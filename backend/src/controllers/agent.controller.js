import admin, {db} from '../src/config/firebase.js'
import { llmNormalize, llmPhraseAnswer } from '../services/gemini.service.js'
import {normalizeText, hashQuestion} from '../utils/text.utils.js'


const agentTurn = async (req, res) => {
    try {
        
        const {transcript, customerId} = req.body; //req body from LiveKit webhook
        if(!transcript || typeof transcript !== 'string' || transcript.trim() === ""){
            return res
                    .status(400)
                    .json({message: 'transcript is required'});
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

        if(!pendingRequest.empty()){
            requestId = pendingRef.docs[0].id;
        }else{
            const {FieldValue} = admin.firestore;
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