/**
 * Script to create a user with a role (hardcode user logins)
 * 
 * Usage:
 * 1. Get your service account key from Firebase Console
 *    Project Settings → Service Accounts → Generate new private key
 * 2. Save it as 'serviceAccountKey.json' in the scripts folder
 * 3. Run: node scripts/createUser.js <email> <password> <role> [propertyId] [landlordId]
 * 
 * Examples:
 *   node scripts/createUser.js tenant@example.com password123 tenant prop-001 landlord-uid-123
 *   node scripts/createUser.js landlord@example.com password123 landlord
 *   node scripts/createUser.js contractor@example.com password123 contractor
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

async function createUser(email, password, role, propertyId, landlordId) {
  const validRoles = ['tenant', 'landlord', 'contractor', 'admin'];
  
  if (!validRoles.includes(role)) {
    console.error(`❌ Invalid role. Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  try {
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
    });
    
    const uid = userRecord.uid;
    
    // Set custom claims (role)
    await admin.auth().setCustomUserClaims(uid, { role });
    
    // Store user data in Firestore
    const db = admin.firestore();
    const userData = {
      email,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Auto-assign landlordId to landlords (their own UID)
    if (role === 'landlord') {
      userData.landlordId = uid;
    }
    
    // If tenant, also store propertyId and landlordId
    if (role === 'tenant' && propertyId && landlordId) {
      userData.propertyId = propertyId;
      userData.landlordId = landlordId;
    }
    
    await db.collection('users').doc(uid).set(userData);
    
    console.log('✅ User created successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   UID: ${uid}`);
    console.log(`   Role: ${role}`);
    if (propertyId) console.log(`   Property ID: ${propertyId}`);
    if (landlordId) console.log(`   Landlord ID: ${landlordId}`);
    console.log('\n📝 User can now log in with the provided email and password.');
    
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.error(`❌ User with email ${email} already exists.`);
      console.error('💡 Use scripts/setUserRole.js to update an existing user\'s role.');
    } else {
      console.error('❌ Error creating user:', error.message);
    }
    process.exit(1);
  }
}

// Get arguments from command line
const email = process.argv[2];
const password = process.argv[3];
const role = process.argv[4];
const propertyId = process.argv[5];
const landlordId = process.argv[6];

if (!email || !password || !role) {
  console.error('Usage: node scripts/createUser.js <email> <password> <role> [propertyId] [landlordId]');
  console.error('Roles: tenant, landlord, contractor, admin');
  console.error('\nExamples:');
  console.error('  node scripts/createUser.js tenant@example.com password123 tenant prop-001 landlord-uid-123');
  console.error('  node scripts/createUser.js landlord@example.com password123 landlord');
  console.error('\nNote: propertyId and landlordId are optional and only used for tenants.');
  process.exit(1);
}

createUser(email, password, role, propertyId, landlordId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

