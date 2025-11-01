import "dotenv/config";
import app from './app.js'
import { GoogleGenAI } from "@google/genai";

const port = process.env.PORT || 8000;




// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Explain how AI works in a few words",
  });
  console.log(response.text);
}

main();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})

