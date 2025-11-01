import { hashQuestion, normalizeText } from "../utils/text.utils.js";

export const normalize = (req, res, next) => {
  try {
    const question = req.body?.question ?? req.query?.question;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res
            .status(400)
            .json({ 
                message: "question is required" 
            });
    }

    const hashedQuestion = hashQuestion(question);
    req.hashedQuestion = hashedQuestion;
    req.normalizedQuestion = normalizeText(question);

    // Make downstream handlers consistent:
    req.body = { ...req.body, hashedQuestion, question: req.normalizedQuestion };
    req.query = { ...req.query, hashedQuestion, question: req.normalizedQuestion };

    next();
  } catch (err) {
    console.error("Normalization error:", err);
    return res
    .status(500)
    .json({ 
        message: "Error while normalizing question", error: err.message 
    });
  }
};
