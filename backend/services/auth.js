/**
 * Authentication Service (Backend)
 * Helper functions for role-based access control
 */

const admin = require('firebase-admin');

/**
 * Create a user with a specific role
 * Sets custom claims on the user
 * 
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} role - User role (tenant, landlord, contractor, admin)
 * @returns {Promise<admin.auth.UserRecord>} Created user record
 */
async function createUserWithRole(email, password, role) {
  const validRoles = ['tenant', 'landlord', 'contractor', 'admin'];
  
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  // Create user
  const userRecord = await admin.auth().createUser({
    email,
    password,
  });

  // Set custom claim for role
  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  return userRecord;
}

/**
 * Get user role from custom claims
 * 
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
 * Require role middleware for Cloud Functions
 * Throws error if user doesn't have required role
 * 
 * @param {string[]} requiredRoles - Array of allowed roles
 * @param {object} context - Firebase function context
 * @throws {Error} If user doesn't have required role
 */
async function requireRole(requiredRoles, context) {
  if (!context.auth) {
    throw new Error('User must be authenticated');
  }

  const userRole = await getUserRole(context.auth.uid);
  
  if (!userRole || !requiredRoles.includes(userRole)) {
    throw new Error(
      `Permission denied. User must have one of these roles: ${requiredRoles.join(', ')}`
    );
  }

  return true;
}

/**
 * Update user role
 * 
 * @param {string} uid - User ID
 * @param {string} role - New role
 * @returns {Promise<void>}
 */
async function updateUserRole(uid, role) {
  const validRoles = ['tenant', 'landlord', 'contractor', 'admin'];
  
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  await admin.auth().setCustomUserClaims(uid, { role });
}

module.exports = {
  createUserWithRole,
  getUserRole,
  requireRole,
  updateUserRole,
};

