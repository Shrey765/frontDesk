// src/controllers/agent.controller.js

import admin, { db } from '../config/firebase.js';
import {
  llmNormalize,
  llmPhraseAnswer,
  classifyUtterance,
} from '../services/gemini.service.js';
import { normalizeText, hashQuestion } from '../utils/text.utils.js';

// simple in-memory rate limiter per customer
const lastCalls = new Map();

const SMALL_TALK_REPLIES = [
  'Hi there! How can I help you today?',
  'Hello! What would you like to know?',
  "I\'m doing great, thanks for asking. How can I assist you?",
  "Hey! Tell me what you\'re looking for and I\'ll check.",
];

function pickSmallTalk() {
  return SMALL_TALK_REPLIES[Math.floor(Math.random() * SMALL_TALK_REPLIES.length)];
}

const agentTurn = async (req, res) => {
  try {
    console.log('🔹 agentTurn received:', req.body);
    const { transcript, customerId = 'anon' } = req.body;

    // 1) basic guard
    if (!transcript || typeof transcript !== 'string' || transcript.trim() === '') {
      return res.status(400).json({ message: 'transcript is required' });
    }

    const lower = transcript.toLowerCase();

    // 2) 🔸 quick salon FAQ responses (fast path, no LLM, no Firestore)
    if (
      lower.includes('opening hour') ||
      lower.includes('timings') ||
      lower.includes('timing') ||
      lower.includes('what time do you open') ||
      lower.includes('when are you open')
    ) {
      return res.json({
        route: 'answer',
        answer: 'We are open every day from 10 AM to 8 PM.',
      });
    }

    if (
      lower.includes('price') ||
      lower.includes('cost') ||
      lower.includes('rates') ||
      lower.includes('haircut')
    ) {
      return res.json({
        route: 'answer',
        answer: 'A standard haircut costs ₹300. Styling and color are billed separately.',
      });
    }

    if (
      lower.includes('appointment') ||
      lower.includes('book') ||
      lower.includes('slot')
    ) {
      return res.json({
        route: 'answer',
        answer:
          'Sure, I can help with that. Tell me the service and a preferred time between 10 AM and 7:30 PM.',
      });
    }

    if (
      lower.includes('location') ||
      lower.includes('address') ||
      lower.includes('where are you')
    ) {
      return res.json({
        route: 'answer',
        answer:
          'We are at Shop 12, Central Mall, MG Road. You can find us on Google Maps as "FrontDesk Salon".',
      });
    }

    // 3) ⏱️ rate limit AFTER quick replies
    const now = Date.now();
    const last = lastCalls.get(customerId) || 0;
    if (now - last < 1500) {
      return res.json({
        route: 'small_talk',
        answer: "I'm listening. Tell me your full question.",
      });
    }
    lastCalls.set(customerId, now);

    // 4) classify the utterance (small talk vs question)
    const classification = await classifyUtterance(transcript);
    console.log('utterance classification:', classification);

    // If it's small talk, answer right away — DO NOT hit Firestore
    if (classification?.type === 'small_talk') {
      const reply = pickSmallTalk();
      console.log(`small talk reply for ${customerId}: "${reply}"`);
      return res.json({
        route: 'small_talk',
        answer: reply,
      });
    }

    // 5) normalize the user question via LLM
    const question = await llmNormalize(transcript);
    const normalizedQuestion = normalizeText(question);
    const hashedQuestion = hashQuestion(normalizedQuestion);

    // 6) try to find an answer in Firestore KB
    const kbRef = db.collection('knowledgeBase').doc(hashedQuestion);
    const kbSnapshot = await kbRef.get();

    if (kbSnapshot.exists) {
      const { answer } = kbSnapshot.data();
      const friendlyAnswer = await llmPhraseAnswer(question, answer);

      console.log(
        `Agent found answer in KB for customer ${customerId}: Q: "${question}" A: "${friendlyAnswer}"`
      );

      return res.json({
        route: 'answer',
        answer: friendlyAnswer,
        kbId: hashedQuestion,
      });
    }

    // 7) if not in KB, create / reuse a helpRequest
    console.log(
      `Agent could not find answer in KB for customer ${customerId}: Q: "${question}"`
    );

    const pendingRef = db.collection('helpRequests');
    const pendingRequest = await pendingRef
      .where('hashedQuestion', '==', hashedQuestion)
      .where('status', '==', 'pending')
      .get();

    let requestId = null;

    if (!pendingRequest.empty) {
      // reuse existing pending request
      requestId = pendingRequest.docs[0].id;
    } else {
      const FieldValue = admin.firestore.FieldValue;
      const newRequest = {
        customerId,
        question,
        hashedQuestion,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const docRef = await pendingRef.add(newRequest);
      requestId = docRef.id;
      console.log(`New helpRequest ${requestId} for ${hashedQuestion}`);
    }

    // 8) final fallback answer
    return res.json({
      route: 'create_request',
      answer: 'Let me check with my supervisor and get back to you.',
      requestId,
      kbId: hashedQuestion,
    });
  } catch (error) {
    console.log('Agent turn error:', error);
    return res.status(500).json({
      message: 'error occured in agent controller',
      error,
    });
  }
};

export { agentTurn };
