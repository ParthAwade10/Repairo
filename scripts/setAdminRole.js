/**
 * Script to set admin role for a user
 * 
 * Usage:
 * 1. Get your service account key from Firebase Console
 *    Project Settings → Service Accounts → Generate new private key
 * 2. Save it as 'serviceAccountKey.json' in the scripts folder
 * 3. Run: node scripts/setAdminRole.js <user-email>
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
try {
  const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('Error loading service account. Make sure serviceAccountKey.json exists in scripts folder.');
  console.error('Get it from: Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

async function setAdminRole(userEmail) {
  try {
    // Get user by email
    const user = await admin.auth().getUserByEmail(userEmail);
    
    // Set admin role
    await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
    
    console.log(`✅ Admin role set for ${userEmail} (UID: ${user.uid})`);
    console.log('⚠️  User must sign out and sign in again for changes to take effect.');
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User with email ${userEmail} not found.`);
    } else {
      console.error('❌ Error setting admin role:', error.message);
    }
    process.exit(1);
  }
}

// Get email from command line arguments
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('Usage: node scripts/setAdminRole.js <user-email>');
  process.exit(1);
}

setAdminRole(userEmail)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

