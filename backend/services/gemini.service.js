import {GoogleGenAI} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const model = process.env.GEMINI_MODEL;
const useLLM = (process.env.USE_LLM || 'true').toLocaleLowerCase() === 'true';

const SYSTEM = `You are a salon receptionist. Be warm and concise.
You must not invent facts. Only normalize text or rephrase supplied answers.`;


const llmNormalize = async (transcript) => {
    if(!useLLM){
        return transcript;
    }

    const {respose} = await ai.models.generateContent({
        model: model,
        contents: [
            {
                role: "user", 
                parts: [
                    { text: `${SYSTEM}\n\nNormalize this utterance into a short search query.
                            Return ONLY JSON: {"question":"<text>"}.
                            Utterance: """${transcript}"""` 
                    }
                ]
            }
        ]
    })


    try {
        const content = JSON.parse(respose.text());
        if((content?.question && typeof content.question === 'string' && content.question.trim() !== "")){
            return content.question;
        }

        return transcript;
    } catch (error) {
        return transcript;
    }
}

const llmPhraseAnswer = async (question, answer) => {
    if(!useLLM) return answer;

    const {respose} = await ai.models.generateContent({
        model: model,
        contents: [
            {
                role: "receptionist",
                parts: [
                    {
                        text: `${SYSTEM}
                            Customer question: "${question}"
                            Knowledge base answer: "${answer}"
                            Write a friendly single-sentence reply reusing the KB answer verbatim where possible.
                            Do NOT add any new facts. Return plain text only.`
                    }
                ]
            }
        ]
    })

    return respose.text().trim();
}

export { llmNormalize, llmPhraseAnswer };