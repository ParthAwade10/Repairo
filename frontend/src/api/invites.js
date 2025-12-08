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
  
  // Check if invite already exists
  const q = query(
    invitesRef,
    where('landlordId', '==', landlordId),
    where('tenantEmail', '==', tenantEmail),
    where('status', '==', 'pending')
  );
  const existingInvites = await getDocs(q);
  
  if (!existingInvites.empty) {
    throw new Error('An invite has already been sent to this tenant');
  }
  
  const inviteData = {
    landlordId,
    tenantEmail: tenantEmail.toLowerCase().trim(),
    propertyId,
    status: 'pending',
    createdAt: Timestamp.now(),
  };
  
  const docRef = await addDoc(invitesRef, inviteData);
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
  
  // Update invite status
  await updateDoc(inviteRef, {
    status: 'accepted',
    acceptedAt: Timestamp.now(),
    tenantId,
  });
  
  // Update tenant's user document with landlordId and propertyId
  const tenantRef = doc(db, 'users', tenantId);
  await updateDoc(tenantRef, {
    landlordId: inviteData.landlordId,
    propertyId: inviteData.propertyId || null,
  });
  
  // If propertyId is provided, add tenant to property
  if (inviteData.propertyId) {
    const { getPropertyByPropertyId, addTenantToProperty } = await import('./properties');
    const property = await getPropertyByPropertyId(inviteData.propertyId);
    if (property) {
      await addTenantToProperty(property.id, tenantId);
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

