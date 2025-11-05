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
const LIVEKIT_WS_URL =
  process.env.LIVEKIT_URL || 'wss://frontdesk-flwj05rb.livekit.cloud';

function makeInferenceUrl() {
  const base = LIVEKIT_WS_URL.replace(/\/+$/, '');
  return `${base}/inference`;
}

function makeBackendUrl() {
  const base = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const hook = BACKEND_HOOK.startsWith('/') ? BACKEND_HOOK : `/${BACKEND_HOOK}`;
  return `${base}${hook}`;
}

function sanitizeForTTS(text: string) {
  return text.replace(/[^\x00-\x7F]/g, '').trim();
}
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
      allowInterruptions: true,
    });
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    // try to build TTS, but don't die if it fails
    const inferenceUrl = makeInferenceUrl();
    let tts: inference.TTS | undefined;

    try {
      tts = new inference.TTS({
        // this is the one you wanted
        model: 'cartesia/sonic-3',
        baseUrl: inferenceUrl,
      });
      console.log('[agent] TTS initialized with', inferenceUrl);
    } catch (err) {
      console.error('[agent] failed to init TTS, will run STT-only:', err);
    }

    const session = new voice.AgentSession({
      stt: new inference.STT({
        model: 'assemblyai/universal-streaming',
        language: 'en',
      }),
      // only pass tts if we actually created it
      ...(tts ? { tts } : {}),
      vad: ctx.proc.userData.vad! as silero.VAD,
      allowInterruptions: false,
    });

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

      if (transcript.length < 10) {
        console.log('[agent] ignore short transcript:', transcript);
        return;
      }

      const looksComplete = /[.?!]$/.test(transcript) || transcript.length > 25;
      if (!looksComplete) {
        console.log('[agent] wait for completion:', transcript);
        return;
      }

      if (transcript === lastTranscript) {
        console.log('[agent] ignore duplicate transcript:', transcript);
        return;
      }
      lastTranscript = transcript;

      console.log('[agent] user said:', transcript);

      const customerId =
        ctx.participant?.identity || ctx.room?.name || 'livekit-user';

      const url = makeBackendUrl();
      console.log('[agent] POSTing to backend:', url);

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, customerId }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          console.error('[agent] backend returned non-200:', resp.status, text);
          return;
        }

        const data = await resp.json();
        console.log('[agent] backend reply:', data);

        const reply = data?.answer || data?.message;
        if (reply) {
          const clean = sanitizeForTTS(shorten(reply));
          console.log('[agent] will speak:', clean);

          // speak if we have a working TTS
          if (tts) {
            try {
              await session.say(clean);
            } catch (err) {
              console.error('[agent] TTS failed via inference:', err);
            }
          } else {
            console.log('[agent] TTS not available, only publishing data');
          }

          // publish to room so UI can show it
          try {
            const payload = Buffer.from(
              JSON.stringify({
                type: 'agent_reply',
                text: clean,
              }),
              'utf-8',
            );
            await ctx.room.localParticipant.publishData(payload, {
              reliable: true,
            });
          } catch (err) {
            console.error('[agent] failed to publish data to room:', err);
          }
        }
      } catch (err) {
        console.error('[agent] failed to send transcript:', err);
      }
    });

    // start listening + join room
    await session.start({
      agent: new Assistant(),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    // VERY IMPORTANT: if we reach here, the job is healthy
    await ctx.connect();
    console.log('[agent] joined job room and is ready');
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
  }),
);
