import { hashQuestion, normalizeText } from "../utils/text.utils.js";

export const normalize = (req, res, next) => {
  try {
    const question = req.body?.question || req.query?.question;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res
            .status(400)
            .json({ 
                message: "question is required" 
            });
    }

    const normalizedQuestion = normalizeText(question);
    const hashedQuestion = hashQuestion(normalizedQuestion);
    req.normalizedQuestion = normalizedQuestion;
    req.hashedQuestion = hashedQuestion;

    // Make downstream handlers consistent:
    req.body.normalizedQuestion = normalizedQuestion;
    req.body.hashedQuestion = hashedQuestion;

    next();
  } catch (err) {
    console.error("Normalization error:", err);
    return res
      .status(500)
      .json({
        message: "Error while normalizing question",
        error: err.message
      });
  }
};
