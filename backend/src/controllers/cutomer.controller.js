import { db } from "../config/firebase.js";
import admin from "firebase-admin";
import { RoomServiceClient } from "livekit-server-sdk";

const livekit = new RoomServiceClient(
  process.env.LIVEKIT_SERVER_URL,     // <- https://....livekit.cloud
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

const createCustomerRequests = async (req, res) => {
    try {
        const {customerId, question, hashedQuestion} = req.body;
        const FieldValue = admin.firestore.FieldValue;

        if (!customerId || !question ||typeof customerId !== "string" || typeof question !== "string" ||
            customerId.trim() === "" || question.trim() === "") {

            return res
            .status(400)
            .json({ message: "customerId and question are required" });
        }

        console.log(`LOG new customer request from ${customerId}: ${question}`);

        const customerRequest = {
            customerId,
            question,
            status: "pending",
            hashedQuestion,
            answer: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }

        const docRef = db.collection("helpRequests").doc();
        if(!docRef){
            return res
            .status(500)
            .json({ message: "Could not create a new document reference" });
        }
        await docRef.set(customerRequest);

        console.log(`Customer request stored with ID: ${docRef.id}`);
        console.log(customerRequest);

        return res
        .status(201)
        .json({
            message: "Request received successfully",
            requestId: docRef.id,
            request: customerRequest
        })
        
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Error while retrieving customer requests",
            error: error
        })
    }
}

//get pending and resolved customer requests
const getAllCustomerRequests = async (req, res) => {
    try {

        const {status} = req.query;
        let query = db.collection("helpRequests")
        if(status){
            query = query.where('status', '==', status);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const requests = [];
        snapshot.forEach((doc) => requests.push({ id: doc.id, ...doc.data() }));

        return res
        .status(200)
        .json({
            message: "Cutomer requests retrieved successfully",
            requests: requests
        })
        
    } catch (error) {
        console.log(error);
        return res
        .status(500)
        .json({
            message: "Error while creating customer requests",
            error: error
        })
    }
}

//resolve customer request
const resolveCustomerRequest = async (req, res) => {
    try {

        const {id} = req.params;
        const {answer} = req.body;
        const FieldValue = admin.firestore.FieldValue;
        if(!answer || typeof answer !== "string" || answer.trim() === ""){
            return res
            .status(400)
            .json({
                message: "Answer is required to resolve the request"
            })
        }

        const requestRef = db.collection("helpRequests").doc(id);
        const requestDoc = await requestRef.get();
        if (!requestDoc.exists) {
            return res.status(404).json({ message: "Request not found." });
        }

        const { customerId, hashedQuestion, question } = requestDoc.data();

        await requestRef.update({
            status: "resolved",
            answer: answer,
            updatedAt: FieldValue.serverTimestamp()
        })


        const kbRef = db.collection("knowledgeBase").doc(hashedQuestion);
        const kbEntry = {
            hashedQuestion: hashedQuestion,
            question: question,
            answer: answer,
            createdAt: FieldValue.serverTimestamp()
        }
        await kbRef.set(kbEntry);

        console.log(`SIMULATED TEXT to ${customerId}: Here's that answer: '${answer}'`);
        console.log(`KB upserted for question: "${question}" (id: ${hashedQuestion})`);

        const payload = {
            type: "kb_resolved",
            question,
            answer,
        };      

        await livekit.sendData(
            room,
            Buffer.from(JSON.stringify(payload)),
            {
                // you can target a participant if you want
                destinationIdentities: [participantIdentity],
            }
        );

        return res
            .status(200)
            .json({
                message: "Customer request resolved successfully",
                entry: kbEntry,
                kbId: hashedQuestion,
            })
    } catch (error) {
        console.log(error);
        return res
        .status(500)
        .json({
            message: "Error while resolving customer requests",
            error: error
        })
    }
}

//route for LiveKit AI to fetch Q&A pairs from knowledge base
const getKnowledgeBase = async (req, res) => {
    try {
        const hashedQuestion = req.query.hashedQuestion; 
        const kbRef = db.collection("knowledgeBase").doc(hashedQuestion);
        const kbSnapshot = await kbRef.get();

        if(!kbSnapshot.exists){
            return res
            .status(200)
            .json({
                message: "Answer not found in knowledge base.",
                answer: null
            });
        }

        return res
        .status(200)
        .json({
            message: "Knowledge base retrieved successfully",
            answer: kbSnapshot.data()
        });

    } catch (error) {
        console.log(error);
        return res
        .status(500)
        .json({
            message: "Error while retrieving knowledge base",
            error: error
        })  
    }
}

export { createCustomerRequests, getAllCustomerRequests, resolveCustomerRequest, getKnowledgeBase };