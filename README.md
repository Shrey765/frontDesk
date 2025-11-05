# 🎙️ FrontDesk Voice Agent

A **real-time conversational AI receptionist** built with **LiveKit Agents**, **AssemblyAI STT**, **Cartesia TTS**, and a **custom Node.js backend**.  
This agent listens, understands, and speaks — designed for automating salon, clinic, or front-desk interactions.

---

## ✨ Features

- 🎧 **Real-time speech-to-text (STT)** using AssemblyAI streaming
- 🗣️ **Text-to-speech (TTS)** using Cartesia Sonic-3
- 🧠 **LLM-based replies** via your backend (Gemini / OpenAI / custom rules)
- 🧪 **Silero VAD** to detect when the caller is speaking
- 🔇 **Noise cancellation** with `BackgroundVoiceCancellation`
- 🔗 **Webhook integration** with your backend: `/api/v1/livekit/webhook`
- 📡 **LiveKit room data** so your frontend can display the agent’s replies
- 📊 **Metrics** using LiveKit’s `UsageCollector`

---

## 🧱 Project Structure (high level)

```text
src/
 └── agent.ts              # LiveKit agent (the one you run with `npm run dev`)
backend/                   # Your Express / Node backend (serves the webhook)
.env.local                 # All your secrets + LiveKit URL
package.json
README.md
```


## ⚙️ Prerequisites

**Before you start:**

- **Node.js 18+**

- **npm or yarn**

- **A LiveKit Cloud project (you already have one: frontdesk-flwj05rb.livekit.cloud)**

- **Your backend running locally on port 4000 (or change in .env.local)**

## 🔐 Environment Setup
# --- LiveKit Cloud ---
LIVEKIT_URL=wss://frontdesk-flwj05rb.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET

# --- Backend (your Express app) ---
BACKEND_URL=http://localhost:4000
BACKEND_HOOK=/api/v1/livekit/webhook

# --- LLM / optional ---
USE_LLM=true
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=gemini-2.5-flash

## 🏃‍♂️ Running the Project
1. Start the Backend (API)

Your agent is calling this endpoint:

POST http://localhost:4000/api/v1/livekit/webhook

So make sure your backend is up:
- cd backend
- npm install
- npm run start

2. Start the Agent (LiveKit worker)
   - In another terminal, run:
   - cd my-app (make sure to make the sandbox app in the liveKit dashBoard)
   - npm install
   - npm run dev

4. run front end:
   npm run dev


