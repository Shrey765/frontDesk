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

// -----------------------------------------------------------------------------
// 1. backend endpoint (your Express app)
// -----------------------------------------------------------------------------
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const BACKEND_HOOK = process.env.BACKEND_HOOK || '/api/v1/livekit/webhook';

function makeBackendUrl() {
  const base = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const hook = BACKEND_HOOK.startsWith('/') ? BACKEND_HOOK : `/${BACKEND_HOOK}`;
  return `${base}${hook}`;
}

// helper – Cartesia is okay with ascii
function sanitizeForTTS(text: string) {
  return text.replace(/[^\x00-\x7F]/g, '').trim();
}

// -----------------------------------------------------------------------------
// 2. Salon receptionist persona
// -----------------------------------------------------------------------------
class Assistant extends voice.Agent {
  constructor() {
    super({
      instructions: `
You are a salon receptionist for a barbershop/salon.
Always greet briefly, then ask what service or timing they want.
Keep replies short, warm, and without emojis.
If you don't know the answer, say: "Let me check with my supervisor and get back to you."
      `.trim(),
    });
  }
}

// -----------------------------------------------------------------------------
// 3. Define the agent
// -----------------------------------------------------------------------------
export default defineAgent({
  // preload VAD
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  // main entry
  entry: async (ctx: JobContext) => {
    // -------------------------------------------------------------------------
    // 3a. voice session: STT + TTS + VAD
    // -------------------------------------------------------------------------
    const session = new voice.AgentSession({
      // ears
      stt: new inference.STT({
        model: 'assemblyai/universal-streaming',
        language: 'en',
      }),

      // mouth – use Cartesia because you have CARTESIA_API_KEY
      // check that .env.local in *this* project has CARTESIA_API_KEY=...
      tts: new inference.TTS({
        model: 'cartesia/sonic-3',     // good default
        voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc', // your earlier voice id
      }),

      // turn detection
      vad: ctx.proc.userData.vad! as silero.VAD,
    });

    // -------------------------------------------------------------------------
    // 3b. metrics
    // -------------------------------------------------------------------------
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      usageCollector.collect(ev.metrics);
    });
    ctx.addShutdownCallback(async () => {
      console.log('[agent] usage:', JSON.stringify(usageCollector.getSummary()));
    });

    // -------------------------------------------------------------------------
    // 3c. prevent spammy duplicates
    // -------------------------------------------------------------------------
    let lastTranscript = '';

    // -------------------------------------------------------------------------
    // 3d. when user finishes a sentence
    // -------------------------------------------------------------------------
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (ev) => {
      const transcript = ev.transcript?.trim();
      if (!transcript) return;

      // ignore very short partials
      if (transcript.length < 10) {
        console.log('[agent] ignore short transcript:', transcript);
        return;
      }

      // wait for “.” or ~25 chars to treat as final
      const looksComplete = /[.?!]$/.test(transcript) || transcript.length > 25;
      if (!looksComplete) {
        console.log('[agent] wait for completion:', transcript);
        return;
      }

      // ignore exact duplicate
      if (transcript === lastTranscript) {
        console.log('[agent] ignore duplicate transcript:', transcript);
        return;
      }
      lastTranscript = transcript;

      console.log('[agent] user said:', transcript);

      // -----------------------------------------------------------------------
      // call your Express backend
      // -----------------------------------------------------------------------
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
          // 1) show to clients (UI)
          try {
            await ctx.room.localParticipant.publishData(
              JSON.stringify({
                type: 'agent_reply',
                text: reply,
              }),
              { reliable: true },
            );
          } catch (pubErr) {
            console.error('[agent] failed to publish data to room:', pubErr);
          }

          // 2) speak it from the agent (Cartesia)
          const clean = sanitizeForTTS(reply);
          try {
            await session.say(clean);
            console.log('[agent] spoke reply:', clean);
          } catch (ttsErr) {
            // if TTS model misbehaves, do NOT crash
            console.error('[agent] TTS failed:', ttsErr);
          }
        }
      } catch (err) {
        console.error('[agent] failed to hit backend:', err);
      }
    });

    // -------------------------------------------------------------------------
    // 3e. join room and start
    // -------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// 4. run worker
// -----------------------------------------------------------------------------
cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
  }),
);
