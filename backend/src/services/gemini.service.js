import {GoogleGenAI} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const model = process.env.GEMINI_MODEL;
const useLLM = (process.env.USE_LLM || 'true').toLocaleLowerCase() === 'true';

const SYSTEM = `You are a salon receptionist. Be warm and concise.
You must not invent facts. Only normalize text or rephrase supplied answers.`;

const stripCodeFences = (s) => {
  // remove ```json ... ``` or ``` ... ```
  return s.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();
};

const llmNormalize = async (transcript) => {
    if(!useLLM){
        return transcript;
    }

    const response = await ai.models.generateContent({
        model: model,
        contents: `${SYSTEM}\n\nNormalize this utterance into a short search query.
                            Return ONLY JSON: {"question":"<text>"}.
                            Utterance: """${transcript}"""` 
    })

    console.log(`LLM response: ${response.text}`);
    const cleanedText = stripCodeFences(response.text);

    try {
        const content = JSON.parse(cleanedText);
        if((content?.question && typeof content.question === 'string' && content.question.trim() !== "")){
            console.log(`LLM normalized question: ${content.question}`);
            return content.question;
        }

        return transcript;
    } catch (error) {
        return transcript;
    }
}

const llmPhraseAnswer = async (question, answer) => {
    if(!useLLM) return answer;

    const response = await ai.models.generateContent({
        model: model,
        contents: `${SYSTEM}
                            Customer question: "${question}"
                            Knowledge base answer: "${answer}"
                            Write a friendly single-sentence reply reusing the KB answer verbatim where possible.
                            Do NOT add any new facts. Return plain text only.`,
        config: {
            systemInstruction: "You are a helpful customer service agent, working in a salon."
        }
    })

    console.log(`LLM phrased answer: ${response.text}`);

    return response.text;
}

// services/gemini.service.js (style matched to your project)
const temp = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function classifyUtterance(utterance) {
  // 0) basic guard + quick local greeting check
  if (!utterance || typeof utterance !== 'string') {
    return { type: 'unknown' };
  }

  const lower = utterance.toLowerCase().trim();
  const obviousGreetings = [
    'hi',
    'hello',
    'hey',
    'good morning',
    'good evening',
    'how are you',
    'what\'s up',
    'yo'
  ];
  if (obviousGreetings.some((g) => lower.startsWith(g))) {
    return { type: 'small_talk' };
  }

  const prompt = `
You are a classifier for a voice helpdesk.
Decide if the user's utterance is:
- "small_talk" (greetings, thanks, pleasantries, chitchat)
- "question" (they want info or service)

Return ONLY JSON:
{ "type": "small_talk" }
or
{ "type": "question" }

User utterance: """${utterance}"""
  `.trim();

  try {
    const resp = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    // ✅ your client returns resp.text (property), not resp.text()
    const text = (resp && resp.text ? resp.text : '').trim();
    // console.log('classify raw:', text);

    const parsed = JSON.parse(text);
    if (parsed?.type === 'small_talk' || parsed?.type === 'question') {
      return parsed;
    }

    // if LLM returned weird JSON
    return { type: 'unknown' };
  } catch (err) {
    console.error('classifyUtterance LLM error:', err);

    // ✅ fallback heuristic
    const qWords = [
      'what',
      'when',
      'where',
      'how',
      'why',
      'do you',
      'can you',
      'opening hours',
      'price',
      'timing',
      'timings',
      'available',
    ];
    if (qWords.some((w) => lower.includes(w))) {
      return { type: 'question' };
    }
    return { type: 'small_talk' };
  }
}



export { llmNormalize, llmPhraseAnswer, classifyUtterance };