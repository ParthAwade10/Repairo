/**
 * Authentication Context
 * Provides authentication state and user role information throughout the app
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  getIdTokenResult
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Get user role - check in this order:
        // 1. Custom claims (most secure, set by Cloud Functions)
        // 2. localStorage (immediate fallback, set during signup)
        // 3. Firestore (persistent storage, may require rules)
        let role = null;
        
        // Check custom claims first
        try {
          const tokenResult = await getIdTokenResult(user);
          role = tokenResult.claims.role || null;
        } catch (error) {
          console.warn('Error getting user role from claims:', error);
        }
        
        // If no role in claims, check localStorage and sessionStorage (fastest fallback)
        if (!role) {
          // First check if there's a pending role for this user (just signed up)
          const pendingRoleUid = localStorage.getItem('pendingRoleUid') || sessionStorage.getItem('pendingRoleUid');
          if (pendingRoleUid === user.uid) {
            const pendingRole = localStorage.getItem('pendingRole') || sessionStorage.getItem('pendingRole');
            if (pendingRole) {
              role = pendingRole;
              // Move it to the permanent location
              localStorage.setItem(`userRole_${user.uid}`, role);
              sessionStorage.setItem(`userRole_${user.uid}`, role);
              // Clean up temporary keys
              localStorage.removeItem('pendingRole');
              localStorage.removeItem('pendingRoleUid');
              sessionStorage.removeItem('pendingRole');
              sessionStorage.removeItem('pendingRoleUid');
              console.log('✅ Role from pending storage:', role);
            }
          }
          
          // If still no role, check permanent localStorage storage
          if (!role) {
            const storedRole = localStorage.getItem(`userRole_${user.uid}`) || sessionStorage.getItem(`userRole_${user.uid}`);
            if (storedRole) {
              role = storedRole;
              console.log('✅ Role from permanent storage:', role);
            }
          }
        }
        
        // If still no role, check Firestore as last resort
        if (!role) {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              role = userDoc.data().role || null;
              // Cache it in localStorage for next time
              if (role) {
                localStorage.setItem(`userRole_${user.uid}`, role);
              }
            }
          } catch (error) {
            // Firestore read failed (likely rules not deployed) - that's okay,
            // we'll use localStorage if available
            console.warn('Could not read role from Firestore:', error.message);
          }
        }
        
        setUserRole(role);
        
        // Debug logging
        if (!role) {
          console.warn('No role found for user:', user.uid);
          console.warn('Checked: claims, localStorage, Firestore');
          console.warn('localStorage keys:', Object.keys(localStorage).filter(k => k.includes('Role')));
        } else {
          console.log('✅ Role loaded successfully:', role);
        }
        
        setLoading(false);
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Sign in with email and password
   */
  const signIn = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
  };

  /**
   * Sign up with email and password
   * Note: Role assignment happens via Cloud Function (createUserWithRole)
   */
  const signUp = async (email, password) => {
    return await createUserWithEmailAndPassword(auth, email, password);
  };

  /**
   * Sign out current user
   */
  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  /**
   * Check if user has required role(s)
   */
  const hasRole = (requiredRoles) => {
    if (!userRole) return false;
    if (Array.isArray(requiredRoles)) {
      return requiredRoles.includes(userRole);
    }
    return userRole === requiredRoles;
  };

  /**
   * Check if user is admin
   */
  const isAdmin = () => {
    return userRole === 'admin';
  };

  const value = {
    currentUser,
    userRole,
    loading,
    signIn,
    signUp,
    signOut,
    hasRole,
    isAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

