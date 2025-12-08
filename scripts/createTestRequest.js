/**
 * Script to create a test maintenance request
 * 
 * Usage: node scripts/createTestRequest.js <tenant-email> <landlord-email>
 * 
 * Example: node scripts/createTestRequest.js tenant@example.com parthawade23@gmail.com
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
  process.exit(1);
}

async function createTestRequest(tenantEmail, landlordEmail) {
  const db = admin.firestore();
  
  try {
    // Get tenant user
    const tenantUser = await admin.auth().getUserByEmail(tenantEmail);
    const tenantId = tenantUser.uid;
    
    // Get landlord user
    const landlordUser = await admin.auth().getUserByEmail(landlordEmail);
    const landlordId = landlordUser.uid;
    
    // Create test maintenance request
    const requestData = {
      title: 'Test Maintenance Request - Leaky Faucet',
      description: 'The kitchen faucet is leaking and needs repair. Water is dripping constantly.',
      images: [],
      propertyId: 'test-property-001',
      tenantId: tenantId,
      landlordId: landlordId,
      contractorId: null,
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    const requestRef = await db.collection('maintenanceRequests').add(requestData);
    
    // Create chat room for this request
    const roomData = {
      members: [tenantId, landlordId],
      maintenanceRequestId: requestRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection('rooms').add(roomData);
    
    console.log('✅ Test maintenance request created!');
    console.log(`   Request ID: ${requestRef.id}`);
    console.log(`   Tenant: ${tenantEmail}`);
    console.log(`   Landlord: ${landlordEmail}`);
    console.log('   Status: open');
    console.log('\n📝 Refresh your landlord dashboard to see the request!');
    
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User not found: ${error.message}`);
    } else {
      console.error('❌ Error creating test request:', error.message);
    }
    process.exit(1);
  }
}

const tenantEmail = process.argv[2];
const landlordEmail = process.argv[3];

if (!tenantEmail || !landlordEmail) {
  console.error('Usage: node scripts/createTestRequest.js <tenant-email> <landlord-email>');
  console.error('Example: node scripts/createTestRequest.js tenant@example.com parthawade23@gmail.com');
  process.exit(1);
}

createTestRequest(tenantEmail, landlordEmail)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

