import { initializeApp, cert } from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

//firebase admin initialization
initializeApp({
    credential: cert(serviceAccount)
})

export const db = getFirestore();