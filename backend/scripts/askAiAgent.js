import "dotenv/config";
import fetch from "node-fetch";
import {Room} from "@livekit/rtc-node";

const API = process.env.SERVER_TEMP_TOKEN
console.log("Using API URL:", API);
const QUESTION = "When are you open ?";

const askAiAgent = async () => {
    const r = await fetch(`${API}?room=demo&identity=sim-tx`);
    const {url, token} = await r.json();

    const room = new Room();
    await room.connect(url, token);
    console.log("Connected, Sending Text");

    await room.localParticipant.sendText(QUESTION, {topic: "user"});
    console.log("Text Sent, waiting for answer...");

    room.registerTextStreamHandler("user", async (reader, participantInfo) => {
    const info = reader.info;
    const text = await reader.readAll();
    console.log(
      `💬 reply from ${participantInfo.identity} (topic=${info.topic}):`,
      text
    );
  });

  // 4) send question to agent
  await room.localParticipant.sendText(QUESTION, { topic: "user" });
  console.log("Text Sent, waiting for answer...")
};

askAiAgent();