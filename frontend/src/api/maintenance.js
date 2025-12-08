/**
 * Maintenance Request API
 * CRUD operations for maintenance requests
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

const MAINTENANCE_COLLECTION = 'maintenanceRequests';

/**
 * Create a new maintenance request
 * @param {Object} requestData - Maintenance request data
 * @param {File[]} imageFiles - Array of image files to upload
 * @returns {Promise<string>} Document ID of created request
 */
export const createMaintenanceRequest = async (requestData, imageFiles = []) => {
  // Upload images to Firebase Storage
  const imageUrls = [];
  for (const file of imageFiles) {
    const storageRef = ref(storage, `maintenance/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    imageUrls.push(url);
  }

  // Create request document
  const requestDoc = {
    ...requestData,
    images: imageUrls,
    status: 'open',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, MAINTENANCE_COLLECTION), requestDoc);
  
  // Create chat room for this request
  await createChatRoomForRequest(docRef.id, requestData);
  
  return docRef.id;
};

/**
 * Get a single maintenance request by ID
 */
export const getMaintenanceRequest = async (requestId) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
};

/**
 * Get all maintenance requests for a tenant
 */
export const getTenantRequests = async (tenantId) => {
  const q = query(
    collection(db, MAINTENANCE_COLLECTION),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get all maintenance requests for a landlord
 */
export const getLandlordRequests = async (landlordId) => {
  const q = query(
    collection(db, MAINTENANCE_COLLECTION),
    where('landlordId', '==', landlordId),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get all maintenance requests assigned to a contractor
 */
export const getContractorRequests = async (contractorId) => {
  const q = query(
    collection(db, MAINTENANCE_COLLECTION),
    where('contractorId', '==', contractorId),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Update maintenance request status
 */
export const updateRequestStatus = async (requestId, status) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);
  await updateDoc(docRef, {
    status,
    updatedAt: Timestamp.now(),
  });
};

/**
 * Assign a contractor to a maintenance request
 */
export const assignContractor = async (requestId, contractorId) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);
  await updateDoc(docRef, {
    contractorId,
    status: 'in_progress',
    updatedAt: Timestamp.now(),
  });
  
  // Add contractor to chat room
  await addContractorToChatRoom(requestId, contractorId);
};

/**
 * Update maintenance request (general update)
 */
export const updateMaintenanceRequest = async (requestId, updates) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
};

/**
 * Delete a maintenance request (admin only)
 */
export const deleteMaintenanceRequest = async (requestId) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);
  await deleteDoc(docRef);
};

// Helper function to create chat room (imported from messaging API)
import { createChatRoom, addMemberToRoom } from './messaging';

const createChatRoomForRequest = async (requestId, requestData) => {
  const members = [requestData.tenantId, requestData.landlordId];
  await createChatRoom(requestId, members, requestId);
};

const addContractorToChatRoom = async (requestId, contractorId) => {
  // Find chat room by maintenanceRequestId
  const roomsRef = collection(db, 'rooms');
  const q = query(roomsRef, where('maintenanceRequestId', '==', requestId));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    const roomDoc = querySnapshot.docs[0];
    await addMemberToRoom(roomDoc.id, contractorId);
  }
};

