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
export const rtdb = admin.database();
export const auth = admin.auth();
export const storage = admin.storage();

export default admin;
