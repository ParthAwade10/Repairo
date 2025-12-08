/**
 * Firebase Cloud Functions
 * Backend logic for Repairo
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Set user role via custom claims
 * This function should be called after user creation to assign a role
 * 
 * Security: Only admins should be able to call this, or it should be
 * called server-side during user registration
 * 
 * @param {string} data.uid - User ID
 * @param {string} data.role - Role to assign (tenant, landlord, contractor, admin)
 */
exports.setUserRole = functions.https.onCall(async (data, context) => {
  // TODO: Add admin check here
  // if (!context.auth || context.auth.token.role !== 'admin') {
  //   throw new functions.https.HttpsError('permission-denied', 'Only admins can set roles');
  // }

  const { uid, role } = data;

  if (!uid || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'uid and role are required'
    );
  }

  const validRoles = ['tenant', 'landlord', 'contractor', 'admin'];
  if (!validRoles.includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid role. Must be one of: tenant, landlord, contractor, admin'
    );
  }

  try {
    // Set custom claim
    await admin.auth().setCustomUserClaims(uid, { role });

    return { success: true, message: `Role ${role} assigned to user ${uid}` };
  } catch (error) {
    console.error('Error setting user role:', error);
    throw new functions.https.HttpsError('internal', 'Failed to set user role');
  }
});

/**
 * Get user role helper function (for backend use)
 * @param {string} uid - User ID
 * @returns {Promise<string|null>} User role or null
 */
async function getUserRole(uid) {
  try {
    const user = await admin.auth().getUser(uid);
    return user.customClaims?.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Require role middleware (for backend security)
 * Use this in Cloud Functions to check user roles
 * 
 * @param {string[]} requiredRoles - Array of allowed roles
 * @param {object} context - Firebase function context
 * @returns {Promise<boolean>} True if user has required role
 */
async function requireRole(requiredRoles, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const userRole = await getUserRole(context.auth.uid);
  
  if (!userRole || !requiredRoles.includes(userRole)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `User must have one of these roles: ${requiredRoles.join(', ')}`
    );
  }

  return true;
}

// Export helper functions for use in other functions
exports.getUserRole = getUserRole;
exports.requireRole = requireRole;

/**
 * Example: Create maintenance request with role check
 * This demonstrates how to use requireRole
 */
exports.createMaintenanceRequestSecure = functions.https.onCall(async (data, context) => {
  // Only tenants can create requests
  await requireRole(['tenant'], context);

  const { title, description, propertyId, landlordId } = data;

  // Create request in Firestore
  const db = admin.firestore();
  const requestRef = await db.collection('maintenanceRequests').add({
    title,
    description,
    propertyId,
    tenantId: context.auth.uid,
    landlordId,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, requestId: requestRef.id };
});

/**
 * Auto-create chat room when maintenance request is created
 */
exports.onCreateMaintenanceRequest = functions.firestore
  .document('maintenanceRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const requestData = snap.data();
    const requestId = context.params.requestId;

    const db = admin.firestore();
    
    // Create chat room
    const roomData = {
      members: [requestData.tenantId, requestData.landlordId],
      maintenanceRequestId: requestId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('rooms').add(roomData);

    console.log(`Chat room created for maintenance request ${requestId}`);
  });

/**
 * Add contractor to chat room when assigned
 */
exports.onUpdateMaintenanceRequest = functions.firestore
  .document('maintenanceRequests/{requestId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const requestId = context.params.requestId;

    // Check if contractor was just assigned
    if (!before.contractorId && after.contractorId) {
      const db = admin.firestore();
      
      // Find chat room for this request
      const roomsSnapshot = await db
        .collection('rooms')
        .where('maintenanceRequestId', '==', requestId)
        .get();

      if (!roomsSnapshot.empty) {
        const roomDoc = roomsSnapshot.docs[0];
        await roomDoc.ref.update({
          members: admin.firestore.FieldValue.arrayUnion(after.contractorId),
        });

        console.log(`Contractor ${after.contractorId} added to chat room for request ${requestId}`);
      }
    }
  });

