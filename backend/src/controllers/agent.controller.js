import admin, {db} from '../config/firebase.js'
import { llmNormalize, llmPhraseAnswer, classifyUtterance } from '../services/gemini.service.js'
import {normalizeText, hashQuestion} from '../utils/text.utils.js'


const SMALL_TALK_REPLIES = [
  "Hi there! How can I help you today?",
  "Hello! 👋 What would you like to know?",
  "I'm doing great, thanks for asking. How can I assist you?",
  "Hey! Tell me what you're looking for and I'll check."
];

function pickSmallTalk() {
  return SMALL_TALK_REPLIES[Math.floor(Math.random() * SMALL_TALK_REPLIES.length)];
}


const agentTurn = async (req, res) => {
    try {
        
        const {transcript, customerId} = req.body; //req body from LiveKit webhook
        if(!transcript || typeof transcript !== 'string' || transcript.trim() === ""){
            return res
                    .status(400)
                    .json({message: 'transcript is required'});
        }

        const classification = await classifyUtterance(transcript);
        console.log("utterance classification:", classification);

        // If it's small talk, answer right away — DO NOT hit Firestore
        if (classification?.type === "small_talk") {
            const reply = pickSmallTalk();
            console.log(`small talk reply for ${customerId}: "${reply}"`);
            return res.json({
                route: 'small_talk',
                answer: reply,
        });
        }

        const question = await llmNormalize(transcript);
        const normalizedQuestion = normalizeText(question);
        const hashedQuestion = hashQuestion(normalizedQuestion);


        const kbRef = db.collection('knowledgeBase').doc(hashedQuestion);
        const kbSnapshot = await kbRef.get();

        if(kbSnapshot.exists){
            const {answer} = kbSnapshot.data();
            const friendlyAnswer = await llmPhraseAnswer(question, answer);

            console.log(`Agent found answer in KB for customer ${customerId}: Q: "${question}" A: "${friendlyAnswer}"`);

            return res
            .json({
                route: 'answer',
                answer: friendlyAnswer,
                kbId: hashedQuestion,
            })
        }


        console.log(`Agent could not find answer in KB for customer ${customerId}: Q: "${question}"`);

        const pendingRef = db.collection('helpRequests');
        const pendingRequest = await pendingRef.where('hashedQuestion', '==', hashedQuestion)
                                        .where('status', '==', 'pending').get();

        let requestId = null;  
        if(!pendingRequest.empty){
            requestId = pendingRequest.docs[0].id;
        }else{
            const FieldValue = admin.firestore.FieldValue;
            const newRequest = {
                customerId,
                question,
                hashedQuestion,
                status: 'pending',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }
            const docRef = await pendingRef.add(newRequest);
            requestId = docRef.id;
            console.log(`New helpRequest ${requestId} for ${hashedQuestion}`);
        }
        return res.json({
                route: "create_request",
                answer: "Let me check with my supervisor and get back to you.",
                requestId,
                kbId: hashedQuestion
                });
    } catch (error) {
        console.log("Agent turn error:", error);
        return res
        .status(500)
        .json({
            message: 'error occured in agent controller',
            error
        })
    }
}

export { agentTurn };