/**
 * Firebase Admin SDK initialization for Firestore
 * Used in production (Firebase Functions) for persistent storage
 */
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let firestore: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  if (firestore) return firestore;

  if (getApps().length === 0) {
    // In Firebase Functions, credentials are auto-configured
    // For local testing, use GOOGLE_APPLICATION_CREDENTIALS env var
    if (process.env.FIREBASE_CONFIG) {
      // Running in Firebase Functions
      app = initializeApp();
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Local with service account
      app = initializeApp({
        credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      });
    } else {
      // Fallback - try default credentials
      app = initializeApp();
    }
  } else {
    app = getApps()[0];
  }

  firestore = getFirestore(app!);
  return firestore;
}

/**
 * Check if we should use Firestore (production) or SQLite (local)
 */
export function useFirestore(): boolean {
  return (
    process.env.USE_FIRESTORE === "true" ||
    process.env.FIREBASE_CONFIG !== undefined ||
    process.env.K_SERVICE !== undefined // Cloud Run/Functions indicator
  );
}
