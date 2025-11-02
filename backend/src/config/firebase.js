// config/firebase.js
import admin from "firebase-admin";
import fs from "fs";

// Load your service account JSON without JSON import assertions
const serviceAccount = JSON.parse(
  fs.readFileSync(new URL("../../service-account-key.json", import.meta.url), "utf8")
);

// Initialize once (important for dev/hot reload)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export default admin;
