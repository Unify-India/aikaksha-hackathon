import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

if (admin.apps.length === 0) {
  admin.initializeApp();
  logger.info('Firebase Admin Initialized for AI Kaksha');

  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    logger.info('Running in Firebase Emulator environment');
  }
}

export const db = admin.firestore();

let _rtdb: admin.database.Database | undefined;
try {
  _rtdb = admin.database();
} catch {
  // Realtime Database URL not specified in environment
}
export const rtdb = _rtdb as admin.database.Database;

export const auth = admin.auth();
export const storage = admin.storage();

export default admin;
