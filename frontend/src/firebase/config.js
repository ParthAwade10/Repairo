/**
 * Firebase Configuration
 * Initialize Firebase services (Auth, Firestore, Storage)
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration for Repairo
// Project: cs179repairo
const firebaseConfig = {
  apiKey: "AIzaSyBUAddpqZoU8DkUkMjapYXgsTb8-EihSfQ",
  authDomain: "cs179repairo.firebaseapp.com",
  projectId: "cs179repairo",
  storageBucket: "cs179repairo.firebasestorage.app",
  messagingSenderId: "1082242087772",
  appId: "1:1082242087772:web:1803640c793dd5291d1f99",
  measurementId: "G-RCZK57KCXN"
};

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

