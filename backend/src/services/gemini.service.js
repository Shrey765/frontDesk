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

export { llmNormalize, llmPhraseAnswer };