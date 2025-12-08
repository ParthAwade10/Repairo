/**
 * Invites API
 * Handle tenant invitations from landlords
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const INVITES_COLLECTION = 'invites';

/**
 * Create an invite from landlord to tenant
 * @param {string} landlordId - Landlord user ID
 * @param {string} tenantEmail - Tenant email address
 * @param {string} propertyId - Property ID (optional)
 * @returns {Promise<string>} Invite document ID
 */
export const createInvite = async (landlordId, tenantEmail, propertyId = null) => {
  const invitesRef = collection(db, INVITES_COLLECTION);
  
  // Normalize email for consistency
  const normalizedEmail = tenantEmail.toLowerCase().trim();
  
  // Check if invite already exists (use normalized email)
  const q = query(
    invitesRef,
    where('landlordId', '==', landlordId),
    where('tenantEmail', '==', normalizedEmail),
    where('status', '==', 'pending')
  );
  const existingInvites = await getDocs(q);
  
  if (!existingInvites.empty) {
    throw new Error('An invite has already been sent to this tenant');
  }
  
  const inviteData = {
    landlordId,
    tenantEmail: normalizedEmail,
    propertyId,
    status: 'pending',
    createdAt: Timestamp.now(),
  };
  
  console.log('Creating invite with data:', inviteData);
  const docRef = await addDoc(invitesRef, inviteData);
  console.log('Invite created with ID:', docRef.id);
  return docRef.id;
};

/**
 * Get all pending invites for a tenant
 * @param {string} tenantEmail - Tenant email
 * @returns {Promise<Array>} Array of invite documents
 */
export const getTenantInvites = async (tenantEmail) => {
  const invitesRef = collection(db, INVITES_COLLECTION);
  const q = query(
    invitesRef,
    where('tenantEmail', '==', tenantEmail.toLowerCase().trim()),
    where('status', '==', 'pending')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/**
 * Subscribe to tenant invites (real-time)
 * @param {string} tenantEmail - Tenant email
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export const subscribeToTenantInvites = (tenantEmail, callback) => {
  const invitesRef = collection(db, INVITES_COLLECTION);
  const q = query(
    invitesRef,
    where('tenantEmail', '==', tenantEmail.toLowerCase().trim()),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, (snapshot) => {
    const invites = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(invites);
  });
};

/**
 * Accept an invite
 * @param {string} inviteId - Invite document ID
 * @param {string} tenantId - Tenant user ID
 * @returns {Promise<void>}
 */
export const acceptInvite = async (inviteId, tenantId) => {
  const inviteRef = doc(db, INVITES_COLLECTION, inviteId);
  const inviteDoc = await getDoc(inviteRef);
  
  if (!inviteDoc.exists()) {
    throw new Error('Invite not found');
  }
  
  const inviteData = inviteDoc.data();
  
  // Check if already accepted
  if (inviteData.status === 'accepted') {
    console.log('Invite already accepted');
    return;
  }
  
  try {
    // Update invite status first
    await updateDoc(inviteRef, {
      status: 'accepted',
      acceptedAt: Timestamp.now(),
      tenantId,
    });
    console.log('✅ Invite status updated to accepted');
  } catch (error) {
    console.error('Error updating invite status:', error);
    throw new Error('Failed to update invite status: ' + error.message);
  }
  
  // Update tenant's user document with landlordId and propertyId
  try {
    const tenantRef = doc(db, 'users', tenantId);
    await updateDoc(tenantRef, {
      landlordId: inviteData.landlordId,
      propertyId: inviteData.propertyId || null,
    });
    console.log('✅ Tenant user document updated');
  } catch (error) {
    console.error('Error updating tenant document:', error);
    // Don't throw - invite is already accepted, user can manually update later
    console.warn('Invite accepted but user document update failed. This may be a permission issue.');
  }
  
  // If propertyId is provided, add tenant to property
  if (inviteData.propertyId) {
    try {
      const { getPropertyByPropertyId, addTenantToProperty } = await import('./properties');
      const property = await getPropertyByPropertyId(inviteData.propertyId);
      if (property) {
        await addTenantToProperty(property.id, tenantId);
        console.log('✅ Tenant added to property');
      }
    } catch (error) {
      console.error('Error adding tenant to property:', error);
      // Don't throw - invite is already accepted, property update can be done manually
      console.warn('Invite accepted but property update failed. This may be a permission issue.');
    }
  }
};

/**
 * Decline an invite
 * @param {string} inviteId - Invite document ID
 * @returns {Promise<void>}
 */
export const declineInvite = async (inviteId) => {
  const inviteRef = doc(db, INVITES_COLLECTION, inviteId);
  await updateDoc(inviteRef, {
    status: 'declined',
    declinedAt: Timestamp.now(),
  });
};

/**
 * Get all invites sent by a landlord
 * @param {string} landlordId - Landlord user ID
 * @returns {Promise<Array>} Array of invite documents
 */
export const getLandlordInvites = async (landlordId) => {
  const invitesRef = collection(db, INVITES_COLLECTION);
  const q = query(
    invitesRef,
    where('landlordId', '==', landlordId)
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};

