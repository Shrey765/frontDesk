import "dotenv/config";
import app from './app.js'

const port = process.env.PORT || 8000;

// The client gets the API key from the environment variable `GEMINI_API_KEY`.


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})

