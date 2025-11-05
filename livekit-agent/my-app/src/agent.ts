// src/agent.ts
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  inference,
  metrics,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '.env.local' });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const BACKEND_HOOK = process.env.BACKEND_HOOK || '/api/v1/livekit/webhook';

function makeBackendUrl() {
  const base = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const hook = BACKEND_HOOK.startsWith('/') ? BACKEND_HOOK : `/${BACKEND_HOOK}`;
  return `${base}${hook}`;
}

// keep TTS text safe
function sanitizeForTTS(text: string) {
  return text.replace(/[^\x00-\x7F]/g, '').trim();
}

// keep answers short so VAD doesn’t kill the stream
function shorten(text: string, max = 120) {
  if (!text) return text;
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + '.';
}

class Assistant extends voice.Agent {
  constructor() {
    super({
      instructions: `
You are a salon receptionist. Greet the caller, ask what service they want (haircut, color, spa, waxing, manicure), and answer from the salon knowledge. Keep replies short and friendly. Do not use emojis.
If you don't know, say: "Let me check with my supervisor and get back to you."
      `.trim(),
      // extra safety: don't let user speech interrupt TTS
      allowInterruptions: false,
    });
  }
}

export default defineAgent({
  // preload VAD
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const session = new voice.AgentSession({
      stt: new inference.STT({
        model: 'assemblyai/universal-streaming',
        language: 'en',
      }),
      // use Cartesia through LiveKit inference
      tts: new inference.TTS({
        model: 'cartesia/sonic-3',
      }),
      vad: ctx.proc.userData.vad! as silero.VAD,
      // tell session too: don't interrupt TTS
      allowInterruptions: false,
    });

    // metrics
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      usageCollector.collect(ev.metrics);
    });
    ctx.addShutdownCallback(async () => {
      console.log(`Usage: ${JSON.stringify(usageCollector.getSummary())}`);
    });

    let lastTranscript = '';

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (ev) => {
      const transcript = ev.transcript?.trim();
      if (!transcript) return;

      // ignore very short partials
      if (transcript.length < 10) {
        console.log('[agent] ignore short transcript:', transcript);
        return;
      }

      // wait until sentence looks complete
      const looksComplete = /[.?!]$/.test(transcript) || transcript.length > 25;
      if (!looksComplete) {
        console.log('[agent] wait for completion:', transcript);
        return;
      }

      // ignore duplicates
      if (transcript === lastTranscript) {
        console.log('[agent] ignore duplicate transcript:', transcript);
        return;
      }
      lastTranscript = transcript;

      console.log('[agent] user said:', transcript);

      const customerId =
        ctx.participant?.identity || ctx.room?.name || 'livekit-user';

      const url = makeBackendUrl();

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, customerId }),
        });

        const data = await resp.json();
        console.log('[agent] backend reply:', data);

        const reply = data?.answer || data?.message;
        if (reply) {
          const clean = sanitizeForTTS(shorten(reply));
          console.log('[agent] spoke reply:', clean);

          try {
            // this is the actual speech
            await session.say(clean);
          } catch (err) {
            console.error('[agent] TTS failed:', err);
          }
        }
      } catch (err) {
        console.error('[agent] failed to send transcript:', err);
      }
    });

    // start and join room
    await session.start({
      agent: new Assistant(),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    await ctx.connect();
    console.log('[agent] joined job room and is ready');
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
  }),
);
