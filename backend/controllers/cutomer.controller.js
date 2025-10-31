import { db } from "../config/firebase.js";
import admin from "firebase-admin";

const createCustomerRequests = async (req, res) => {
    try {
        const {customerId, question} = req.body;
        const {FieldValue} = admin.firestore;

        if (typeof customerId !== "string" || typeof question !== "string" ||
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
        const {question, answer} = req.body;
        const {FieldValue} = admin.firestore;
        if(typeof answer !== "string" || answer.trim() === ""){
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

        await requestDoc.update({
            status: "resolved",
            answer: answer,
            updatedAt: FieldValue.serverTimestamp()
        })

        console.log(`SIMULATED TEXT to ${customerId}: Here's that answer: '${answer}'`);
        console.log(` KNOWLEDGE BASE: Learning new fact: ${question}`);

        const kbRef = db.collection("knowledgeBase").doc();
        const kbEntery = {
            question: question,
            answer: answer,
            createdAt: FieldValue.serverTimestamp()
        }
        await kbRef.set(kbEntery);
        return res
            .status(200)
            .json({
                message: "Customer request resolved successfully",
                entry: kbEntery
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
        const {question} = req.query;
        if(typeof question !== "string" || question.trim() === ""){
            return res
            .status(400)
            .json({
                message: "Question query parameter is required"
            })
        }

        const kbRef = db.collection("knowledgeBase");
        const kbSnapshot = await kbRef.get();
        const knowledgeBase = [];

        if(!kbSnapshot.exists){
            return res
            .status(200)
            .json({
                message: "Knowledge base is empty",
                knowledgeBase: []
            })
        }

        kbSnapshot.forEach((doc) => {
            knowledgeBase.push({ id: doc.id, ...doc.data() });
        });

        return res
        .status(200)
        .json({
            message: "Knowledge base retrieved successfully",
            knowledgeBase: knowledgeBase
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