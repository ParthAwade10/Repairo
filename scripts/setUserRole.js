/**
 * Script to set user role (tenant, landlord, contractor, or admin)
 * 
 * Usage:
 * 1. Get your service account key from Firebase Console
 *    Project Settings → Service Accounts → Generate new private key
 * 2. Save it as 'serviceAccountKey.json' in the scripts folder
 * 3. Run: node scripts/setUserRole.js <user-email> <role>
 * 
 * Example: node scripts/setUserRole.js user@example.com tenant
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
  console.error('❌ Error loading service account. Make sure serviceAccountKey.json exists in scripts folder.');
  console.error('📝 Get it from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
  process.exit(1);
}

async function setUserRole(userEmail, role) {
  const validRoles = ['tenant', 'landlord', 'contractor', 'admin'];
  
  if (!validRoles.includes(role)) {
    console.error(`❌ Invalid role. Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  try {
    // Get user by email
    const user = await admin.auth().getUserByEmail(userEmail);
    
    // Set role
    await admin.auth().setCustomUserClaims(user.uid, { role });
    
    console.log(`✅ Role "${role}" set for ${userEmail} (UID: ${user.uid})`);
    console.log('⚠️  User must sign out and sign in again for changes to take effect.');
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User with email ${userEmail} not found.`);
    } else {
      console.error('❌ Error setting user role:', error.message);
    }
    process.exit(1);
  }
}

// Get email and role from command line arguments
const userEmail = process.argv[2];
const role = process.argv[3];

if (!userEmail || !role) {
  console.error('Usage: node scripts/setUserRole.js <user-email> <role>');
  console.error('Roles: tenant, landlord, contractor, admin');
  console.error('Example: node scripts/setUserRole.js user@example.com tenant');
  process.exit(1);
}

setUserRole(userEmail, role)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

