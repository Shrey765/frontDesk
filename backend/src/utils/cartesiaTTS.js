// src/utils/cartesiaTts.js (or inside your agent file)
import { CartesiaClient } from "@cartesia/cartesia-js";

const cartesia = new CartesiaClient({
  apiKey: process.env.CARTESIA_API_KEY,
  baseUrl: "https://api.cartesia.ai",
  version: "2025-04-16", // or 2025-04-16 / 2025-04-?? your account said
});

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function generateSpeech(text) {
  try {
    const audioStream = await cartesia.tts.bytes({
      modelId: process.env.CARTESIA_MODEL_ID || "sonic-2",
      transcript: text,
      voice: {
        mode: "id",
        id: process.env.CARTESIA_VOICE_ID, // now it’s Samantha
      },
      language: "en",
      outputFormat: {
        container: "wav",
        sampleRate: 44100,
        encoding: "pcm_s16le",
      },
    });

    const buf = await streamToBuffer(audioStream);
    return buf;
  } catch (err) {
    console.error("Cartesia TTS error:", err);
    throw err;
  }
}
