import crypto from "crypto";

function normalizeText(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function hashQuestion(q) {
  return crypto.createHash("sha256").update(normalizeText(q)).digest("hex");
}

export { normalizeText, hashQuestion}