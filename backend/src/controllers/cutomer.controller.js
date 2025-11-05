import { db } from "../config/firebase.js";
import admin from "firebase-admin";
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";

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
// src/controllers/cutomer.controller.js
const resolveCustomerRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    if (!answer || !answer.trim()) {
      return res.status(400).json({ message: "answer is required" });
    }

    // 1. fetch the help request
    const reqRef = db.collection("helpRequests").doc(id);
    const snap = await reqRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: "request not found" });
    }

    const reqData = snap.data();
    const question = reqData.question || "";
    // this is what your agent sent originally:
    const roomOrIdentity =
      reqData.customerId || reqData.customer || "livekit-user";
    // you stored the hash as hashedQuestion
    const kbId = reqData.kbId || reqData.hashedQuestion;

    // 2. mark request resolved
    await reqRef.update({
      status: "resolved",
      resolvedAnswer: answer,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3. upsert KB
    if (kbId) {
      const kbRef = db.collection("knowledgeBase").doc(kbId);
      await kbRef.set(
        {
          question,
          answer,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(
        `KB upserted for "${question}" (id: ${kbId})`
      );
    }

    // 4. 🔔 notify the LiveKit room so the agent can speak it
    // LIVEKIT_URL is wss://..., turn it into https://...
    const livekitHttp =
      process.env.LIVEKIT_HTTP_URL ||
      (process.env.LIVEKIT_URL || "").replace("wss://", "https://");

    if (livekitHttp && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
      const roomService = new RoomServiceClient(
        livekitHttp,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
      );

      // we’ll send to the room whose name == customerId (that’s what your agent sent)
      const payload = {
        type: "kb_resolved",
        text: answer,
        question,
      };

      try {
        await roomService.sendData(
          // room name
          roomOrIdentity,
          Buffer.from(JSON.stringify(payload)),
          {
            // reliable so it reaches the agent
            kind: DataPacket_Kind.RELIABLE,
            // we can broadcast to everyone in the room
            // or target an identity: destinationIdentities: [roomOrIdentity]
          }
        );
        console.log(
          `LiveKit notify sent to room "${roomOrIdentity}" about resolved request`
        );
      } catch (e) {
        console.error("Failed to send LiveKit data:", e);
      }
    } else {
      console.warn(
        "LiveKit notify skipped: LIVEKIT_URL/API_KEY/API_SECRET missing"
      );
    }

    return res.json({ message: "request resolved", id });
  } catch (err) {
    console.error("Error while resolving customer requests:", err);
    return res.status(500).json({
      message: "Error while resolving customer requests",
      error: err.message,
    });
  }
};

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