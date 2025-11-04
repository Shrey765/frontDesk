import "dotenv/config";
import fetch from "node-fetch";
import { Room, AudioSource, LocalAudioTrack, TrackSource, AudioFrame } from "@livekit/rtc-node";
import { generateSpeech } from "../utils/cartesiaTTS.js";

const API = "http://localhost:4000/api/v1/livekit/getToken";

async function getToken(identity, room) {
  const res = await fetch(`${API}?room=${room}&identity=${identity}`);
  if (!res.ok) {
    throw new Error(`Token endpoint error ${res.status}: ${await res.text()}`);
  }
  return res.json(); // { url, token }
}

async function main() {
  const identity = "agent-1";
  const roomName = "demo";

  const { url, token } = await getToken(identity, roomName);

  const room = new Room();
  await room.connect(url, token);
  console.log("✅ Agent connected to room.");
  console.log("Listening for user text (topic=user)...");

  room.registerTextStreamHandler("user", async (reader, participantInfo) => {
    const info = reader.info;
    if (info.topic !== "user") return;

    const text = await reader.readAll();
    console.log("📝 Received text:", text);

    // hit your Express+Gemini agent
    const resp = await fetch("http://localhost:4000/api/v1/agent/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        customerId: participantInfo?.identity,
      }),
    }).then((r) => r.json());

    const fallback = "Let me check with my supervisor and get back to you.";
    const spoken =
      resp?.answer && resp.answer.trim() !== "" ? resp.answer : fallback;

    console.log("🗣 agent reply:", spoken);

    // 1) get WAV bytes from Cartesia
    let wavBuf;
    try {
      wavBuf = await generateSpeech(spoken);
      console.log("🔊 got audio bytes from Cartesia:", wavBuf.length);
    } catch (err) {
      console.error("TTS error:", err);
      return;
    }

    // 2) strip WAV header -> PCM
    const pcm = wavBuf.subarray(44); // 16-bit, 44-byte header

    try {
      // 3) create audio source (your SDK wants numbers, not object)
      const source = new AudioSource(44100, 1); // sampleRate=44100, channels=1

      // 4) create track from source
      const track = LocalAudioTrack.createAudioTrack("agent-voice", source);

      // 5) publish track so others in room can hear
      await room.localParticipant.publishTrack(track, {
        name: "agent-voice",
        source: TrackSource.MICROPHONE,
      });

      // 6) feed PCM into the source
      // Cartesia gave us 16-bit little endian PCM (pcm_s16le)
      // so bytesPerSample = 2
      const frame = new AudioFrame(pcm, 44100, 1, 2);
      source.captureFrame(frame);

      console.log("🎙 published agent voice track");
      // after console.log("🎙 published agent voice track");
      await room.localParticipant.sendText(spoken, { topic: "user" });
      console.log("📨 sent text reply to room");

    } catch (err) {
      console.error("error publishing audio to LiveKit:", err);
    }
  });
}

main().catch(console.error);
