/**
 * Firebase Configuration
 * Initialize Firebase services (Auth, Firestore, Storage)
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration for Repairo
// Values are loaded from environment variables (frontend/.env.local)
// Source file: ../secret/firebase-config.env

// Debug: Log environment variables (remove in production)
if (import.meta.env.DEV) {
  console.log('🔍 Firebase Env Check:', {
    hasApiKey: !!import.meta.env.VITE_FIREBASE_API_KEY,
    hasProjectId: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
    apiKeyPrefix: import.meta.env.VITE_FIREBASE_API_KEY?.substring(0, 10) || 'undefined'
  });
}

// Fallback to hardcoded values if env vars aren't loaded (temporary for debugging)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBKJkvU-AJSdo28sre5Z5dRQYny0ft3Cfs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "repairo-blaze.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "repairo-blaze",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "repairo-blaze.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "399572686070",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:399572686070:web:acd218d7c27e952cf1c8d7",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-LRPV5YKF4B"
};

// Validate that all required config values are present
const missingConfig = [];
if (!firebaseConfig.apiKey) missingConfig.push('apiKey');
if (!firebaseConfig.projectId) missingConfig.push('projectId');
if (!firebaseConfig.authDomain) missingConfig.push('authDomain');

if (missingConfig.length > 0) {
  console.error('❌ Firebase configuration is missing!');
  console.error('Missing values:', missingConfig);
  console.error('Please ensure frontend/.env.local exists with all VITE_FIREBASE_* variables');
  console.error('Current env values:', {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? 'present' : 'MISSING',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ? 'present' : 'MISSING',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? 'present' : 'MISSING'
  });
  throw new Error(`Firebase configuration missing: ${missingConfig.join(', ')}. Please check frontend/.env.local`);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to emulators in development
if (import.meta.env.DEV) {
  // Uncomment these lines when using Firebase emulators locally
  // import { connectAuthEmulator } from 'firebase/auth';
  // import { connectFirestoreEmulator } from 'firebase/firestore';
  // import { connectStorageEmulator } from 'firebase/storage';
  
  // connectAuthEmulator(auth, 'http://localhost:9099');
  // connectFirestoreEmulator(db, 'localhost', 8080);
  // connectStorageEmulator(storage, 'localhost', 9199);
}

export default app;

