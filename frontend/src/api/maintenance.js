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
  // Upload images to Firebase Storage (only if provided)
  const imageUrls = [];
  if (imageFiles && imageFiles.length > 0) {
    try {
      for (const file of imageFiles) {
        const storageRef = ref(storage, `maintenance/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        imageUrls.push(url);
      }
    } catch (error) {
      console.warn('Error uploading images (continuing without images):', error);
      // Continue without images if upload fails
    }
  }

  // Validate required fields
  if (!requestData.title || !requestData.description) {
    throw new Error('Title and description are required');
  }

  // Ensure landlordId is set - try to get it from property if not provided
  let finalLandlordId = requestData.landlordId;
  if (!finalLandlordId && requestData.propertyId) {
    try {
      const { getPropertyByPropertyId } = await import('./properties');
      const property = await getPropertyByPropertyId(requestData.propertyId);
      if (property && property.landlordId) {
        finalLandlordId = property.landlordId;
        console.log('✅ Found landlordId from property:', finalLandlordId);
      }
    } catch (error) {
      console.warn('Could not fetch landlordId from property:', error);
      // Continue with null if we can't fetch it
    }
  }

  // Create request document
  const requestDoc = {
    title: requestData.title.trim(),
    description: requestData.description.trim(),
    propertyId: requestData.propertyId || null,
    tenantId: requestData.tenantId,
    landlordId: finalLandlordId || null,
    images: imageUrls, // Empty array if no images
    status: 'open',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    tenantName: requestData.tenantName || null,
    tenantEmail: requestData.tenantEmail || null,
    creatorId: requestData.creatorId || requestData.tenantId || requestData.landlordId,
    creatorName: requestData.creatorName || requestData.tenantName || requestData.landlordName || null,
    creatorEmail: requestData.creatorEmail || requestData.tenantEmail || requestData.landlordEmail || null,
  };

  const docRef = await addDoc(collection(db, MAINTENANCE_COLLECTION), requestDoc);
  
  // Create chat room for this request
  try {
    await createChatRoomForRequest(docRef.id, requestData);
  } catch (error) {
    console.warn('Error creating chat room (request still created):', error);
    // Continue even if chat room creation fails
  }
  
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
 * Get all maintenance requests for a property
 * @param {string} propertyId - Property ID (generated ID, not document ID)
 * @returns {Promise<Array>} Array of maintenance request documents
 */
export const getPropertyRequests = async (propertyId) => {
  const baseRef = collection(db, MAINTENANCE_COLLECTION);
  try {
    const q = query(
      baseRef,
      where('propertyId', '==', propertyId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    // Fallback if index missing: query without orderBy and sort client-side
    if (error.code === 'failed-precondition') {
      console.warn('Index missing for maintenanceRequests/propertyId+createdAt, falling back without orderBy');
      const q = query(baseRef, where('propertyId', '==', propertyId));
      const querySnapshot = await getDocs(q);
      const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return requests.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
    }
    throw error;
  }
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
export const assignContractor = async (requestId, contractorId, contractorProfile = {}) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);

  // Try to fetch contractor info for display
  let contractorName = contractorProfile.name || null;
  let contractorEmail = contractorProfile.email || null;

  // Only hit Firestore if we still need info
  if (!contractorName || !contractorEmail) {
    try {
      const contractorDoc = await getDoc(doc(db, 'users', contractorId));
      if (contractorDoc.exists()) {
        const data = contractorDoc.data();
        contractorEmail = contractorEmail || data.email || null;
        contractorName =
          contractorName ||
          (data.firstName && data.lastName
            ? `${data.firstName} ${data.lastName}`
            : data.name || data.email || null);
      }
    } catch (err) {
      console.warn('Could not load contractor profile for assignment display:', err);
    }
  }

  await updateDoc(docRef, {
    contractorId,
    contractorName: contractorName || null,
    contractorEmail: contractorEmail || null,
    status: 'in_progress',
    updatedAt: Timestamp.now(),
  });
  
  // Add contractor to chat room
  await addContractorToChatRoom(requestId, contractorId);
};

/**
 * Remove contractor from a maintenance request
 * @param {string} requestId - Maintenance request ID
 */
export const clearContractor = async (requestId) => {
  const docRef = doc(db, MAINTENANCE_COLLECTION, requestId);
  await updateDoc(docRef, {
    contractorId: null,
    contractorName: null,
    contractorEmail: null,
    status: 'open',
    updatedAt: Timestamp.now(),
  });
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
  const members = [];
  if (requestData.tenantId) members.push(requestData.tenantId);
  if (requestData.landlordId) members.push(requestData.landlordId);
  
  // Add all tenants from the property to the chat room
  if (requestData.propertyId) {
    try {
      const { getPropertyByPropertyId, getPropertyTenants } = await import('./properties');
      const property = await getPropertyByPropertyId(requestData.propertyId);
      if (property) {
        const tenants = await getPropertyTenants(property.id);
        tenants.forEach(tenant => {
          if (!members.includes(tenant.id)) {
            members.push(tenant.id);
          }
        });
      }
    } catch (error) {
      console.warn('Could not load property tenants for chat room:', error);
      // Continue with just tenant and landlord
    }
  }
  
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

