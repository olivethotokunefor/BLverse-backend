const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (!admin.apps.length) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[firebaseAdmin] Initialized Firebase Admin for project:', process.env.FIREBASE_PROJECT_ID);
  } catch (err) {
    console.error('[firebaseAdmin] Failed to initialize Firebase Admin:', err && err.message);
    throw err;
  }
}

const db = admin.firestore();

module.exports = { admin, db };
