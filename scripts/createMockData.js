/**
 * Script to create mock data (tenants and contractors)
 * 
 * Usage:
 * 1. Get your service account key from Firebase Console
 *    Project Settings → Service Accounts → Generate new private key
 * 2. Save it as 'serviceAccountKey.json' in the scripts folder
 * 3. Run: node scripts/createMockData.js <landlord-email>
 * 
 * Example: node scripts/createMockData.js landlord@example.com
 * 
 * This script will:
 * - Create 5 mock tenants
 * - Create 3 mock contractors
 * - All with default password "password123"
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

async function createMockData(landlordEmail) {
  const db = admin.firestore();
  
  try {
    // Get landlord user
    const landlordUser = await admin.auth().getUserByEmail(landlordEmail);
    const landlordId = landlordUser.uid;
    
    console.log(`✅ Found landlord: ${landlordEmail} (${landlordId})`);
    
    // Mock tenants
    const tenants = [
      { email: 'tenant1@example.com', name: 'John Doe', propertyId: 'prop-001' },
      { email: 'tenant2@example.com', name: 'Jane Smith', propertyId: 'prop-002' },
      { email: 'tenant3@example.com', name: 'Bob Johnson', propertyId: 'prop-003' },
      { email: 'tenant4@example.com', name: 'Alice Williams', propertyId: 'prop-004' },
      { email: 'tenant5@example.com', name: 'Charlie Brown', propertyId: 'prop-005' },
    ];
    
    // Mock contractors
    const contractors = [
      { email: 'contractor1@example.com', name: 'Mike Plumber', specialty: 'Plumbing' },
      { email: 'contractor2@example.com', name: 'Sarah Electrician', specialty: 'Electrical' },
      { email: 'contractor3@example.com', name: 'Tom Handyman', specialty: 'General Maintenance' },
    ];
    
    const defaultPassword = 'password123';
    
    console.log('\n📝 Creating mock tenants...');
    for (const tenant of tenants) {
      try {
        // Check if user already exists
        let userRecord;
        try {
          userRecord = await admin.auth().getUserByEmail(tenant.email);
          console.log(`   ⚠️  Tenant ${tenant.email} already exists, skipping creation`);
        } catch (error) {
          if (error.code === 'auth/user-not-found') {
            // Create user
            userRecord = await admin.auth().createUser({
              email: tenant.email,
              password: defaultPassword,
              emailVerified: false,
            });
            
            // Set role
            await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'tenant' });
            
            // Store in Firestore
            await db.collection('users').doc(userRecord.uid).set({
              email: tenant.email,
              role: 'tenant',
              name: tenant.name,
              landlordId: landlordId,
              propertyId: tenant.propertyId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            console.log(`   ✅ Created tenant: ${tenant.email} (${tenant.propertyId})`);
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error(`   ❌ Error creating tenant ${tenant.email}:`, error.message);
      }
    }
    
    console.log('\n📝 Creating mock contractors...');
    for (const contractor of contractors) {
      try {
        // Check if user already exists
        let userRecord;
        try {
          userRecord = await admin.auth().getUserByEmail(contractor.email);
          console.log(`   ⚠️  Contractor ${contractor.email} already exists, skipping creation`);
        } catch (error) {
          if (error.code === 'auth/user-not-found') {
            // Create user
            userRecord = await admin.auth().createUser({
              email: contractor.email,
              password: defaultPassword,
              emailVerified: false,
            });
            
            // Set role
            await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'contractor' });
            
            // Store in Firestore
            await db.collection('users').doc(userRecord.uid).set({
              email: contractor.email,
              role: 'contractor',
              name: contractor.name,
              specialty: contractor.specialty,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            console.log(`   ✅ Created contractor: ${contractor.email} (${contractor.specialty})`);
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error(`   ❌ Error creating contractor ${contractor.email}:`, error.message);
      }
    }
    
    console.log('\n✅ Mock data creation complete!');
    console.log('\n📋 Summary:');
    console.log(`   Landlord: ${landlordEmail}`);
    console.log(`   Tenants: ${tenants.length} (all with password: ${defaultPassword})`);
    console.log(`   Contractors: ${contractors.length} (all with password: ${defaultPassword})`);
    console.log('\n💡 All users can now log in with their email and password "password123"');
    
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ Landlord with email ${landlordEmail} not found.`);
      console.error('💡 Create the landlord first using: node scripts/createUser.js <email> <password> landlord');
    } else {
      console.error('❌ Error creating mock data:', error.message);
    }
    process.exit(1);
  }
}

// Get landlord email from command line arguments
const landlordEmail = process.argv[2];

if (!landlordEmail) {
  console.error('Usage: node scripts/createMockData.js <landlord-email>');
  console.error('Example: node scripts/createMockData.js landlord@example.com');
  console.error('\nNote: The landlord must exist before creating mock data.');
  process.exit(1);
}

createMockData(landlordEmail)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

