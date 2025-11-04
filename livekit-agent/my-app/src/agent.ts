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

// 👇 add these: where is your Node/Express backend?
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const BACKEND_HOOK = process.env.BACKEND_HOOK || '/livekit/webhook';
// so final URL will be like: http://localhost:3000/livekit/webhook

class Assistant extends voice.Agent {
  constructor() {
    super({
      instructions: `You are a helpful voice AI assistant. The user is interacting with you via voice, even if you perceive the conversation as text.
      You eagerly assist users with their questions by providing information from your extensive knowledge.
      Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
      You are curious, friendly, and have a sense of humor.`,
    });
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // you already downloaded the model, so this is OK now
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const session = new voice.AgentSession({
      stt: new inference.STT({
        model: 'assemblyai/universal-streaming',
        language: 'en',
      }),
      tts: new inference.TTS({
        model: 'cartesia/sonic-3',
        voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      }),
      // you’re using VAD from silero (prewarmed above)
      vad: ctx.proc.userData.vad! as silero.VAD,
    });

    // ✅ 1) COLLECT METRICS (your original code)
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });
    const logUsage = async () => {
      const summary = usageCollector.getSummary();
      console.log(`Usage: ${JSON.stringify(summary)}`);
    };
    ctx.addShutdownCallback(logUsage);

    // ✅ 2) SEND STT RESULTS TO YOUR BACKEND
    // this event fires when STT has a final transcript for a turn
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (ev) => {
    console.log('[agent] UserInputTranscribed event:', ev.transcript);

    const transcript = ev.transcript?.trim();
    if (!transcript) return;

    const customerId =
      ctx.participant?.identity || ctx.room?.name || 'livekit-user';

    const url = `${BACKEND_URL}${BACKEND_HOOK}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, customerId }),
      });
      console.log('[agent] sent transcript to backend:', transcript, 'status:', resp.status);
    } catch (err) {
      console.error('[agent] failed to send transcript to backend', err);
    }
  });


    // handle typed messages from the sandbox chat box
  session.on(voice.AgentSessionEventTypes., async (ev) => {
    console.log('[agent] TextInput event:', ev.text);

    const transcript = ev.text?.trim();
    if (!transcript) return;

    const customerId =
      ctx.participant?.identity ||
      ctx.room?.name ||
      'livekit-user';

    const url = `${BACKEND_URL}${BACKEND_HOOK}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, customerId }),
      });
      console.log('[agent] sent typed text to backend:', transcript, 'status:', resp.status);
    } catch (err) {
      console.error('[agent] failed to send typed text to backend', err);
    }
  });




    // ✅ 3) START YOUR EXISTING VOICE FLOW
    await session.start({
      agent: new Assistant(),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    await ctx.connect();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
