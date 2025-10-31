import crypto from 'crypto';

const normalize = async (req, res, next) => {
    try {
        const question = req.query.hashedQuestion || req.body.question;

        if(!question || typeof question !== 'string' || question.trim() === ''){
            return res
            .status(400)
            .json({
                message: "Question query parameter is required"
            });
        }

        const normalizedQuestion = (question) => {
            return question
                    .toLowerCase()
                    .replace(/[^\w\s]/g, '') // remove punctuation
                    .replace(/\s+/g, ' ')     // condense spaces
                    .trim();
        }

        const hashedQuestion = (question) => {
            const normalized = normalizedQuestion(question);
            // Create a SHA-256 hash
            return crypto.createHash('sha256').update(normalized).digest('hex');
        };

        let hashKey = hashedQuestion(question);
        req.hashedQuestion = hashKey;

        req.body = {...req.body, hashedQuestion: hashKey};
        next();

    } catch (error) {
        console.error("Normalization error:", error);
        return res
          .status(500)
          .json({ message: "Error while normalizing question", error: error.message });
    }
}

export {normalize};