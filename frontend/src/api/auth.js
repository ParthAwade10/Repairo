/**
 * Authentication API
 * Helper functions for user authentication and role management
 */

import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import app from '../firebase/config';

// Initialize Functions (with error handling if not configured)
let functions;
try {
  functions = getFunctions(app);
} catch (error) {
  console.warn('Firebase Functions not initialized. Make sure Functions are deployed.');
  functions = null;
}

/**
 * Create a new user with a specific role
 * This calls a Cloud Function that sets custom claims
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} role - User role (tenant, landlord, contractor, admin)
 * @returns {Promise} User credential
 */
export const createUserWithRole = async (email, password, role) => {
  // First create the user
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;
  
  // Store role in localStorage and sessionStorage immediately (works without any backend)
  // Use multiple storage methods to ensure it's available
  const roleKey = `userRole_${uid}`;
  localStorage.setItem(roleKey, role);
  sessionStorage.setItem(roleKey, role);
  localStorage.setItem('pendingRole', role); // Temporary flag for immediate access
  localStorage.setItem('pendingRoleUid', uid); // Track which user this is for
  localStorage.setItem('currentUserRole', role); // Simple key for immediate access
  sessionStorage.setItem('pendingRole', role);
  sessionStorage.setItem('pendingRoleUid', uid);
  sessionStorage.setItem('currentUserRole', role);
  
  console.log('✅ Role stored:', role, 'UID:', uid);
  console.log('✅ Stored in localStorage with key:', roleKey);
  console.log('✅ Also stored as currentUserRole:', localStorage.getItem('currentUserRole'));
  
  // Store role in Firestore as fallback (works even without Cloud Functions)
  try {
    const userData = {
      email,
      role,
      createdAt: new Date(),
    };
    
    // Auto-assign landlordId to landlords (their own UID)
    if (role === 'landlord') {
      userData.landlordId = uid;
    }
    
    await setDoc(doc(db, 'users', uid), userData);
  } catch (error) {
    console.warn('Could not store role in Firestore (rules may not be deployed):', error.message);
    // Continue anyway - we have localStorage as backup
  }
  
  // Try to call Cloud Function to set role in custom claims (if Functions are available)
  if (functions) {
    try {
      const setUserRole = httpsCallable(functions, 'setUserRole');
      await setUserRole({ uid, role });
      
      // Refresh token to get updated claims
      await userCredential.user.getIdToken(true);
    } catch (error) {
      console.warn('Cloud Function not available, using localStorage/Firestore role instead:', error.message);
      // Role is already stored in localStorage and Firestore, so we can continue
    }
  } else {
    console.warn('Firebase Functions not available. Role stored in localStorage and Firestore.');
  }
  
  return userCredential;
};

/**
 * Sign in with email and password
 */
export const signIn = async (email, password) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

/**
 * Sign out current user
 */
export const signOut = async () => {
  return await firebaseSignOut(auth);
};

/**
 * Get user role from custom claims
 * @param {string} uid - User ID
 * @returns {Promise<string|null>} User role or null
 */
export const getUserRole = async (uid) => {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    return null;
  }
  
  try {
    const tokenResult = await user.getIdTokenResult();
    return tokenResult.claims.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

