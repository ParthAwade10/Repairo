/**
 * Properties API
 * CRUD operations for properties
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const PROPERTIES_COLLECTION = 'properties';

/**
 * Generate a unique property ID
 * Format: prop-{timestamp}-{random}
 */
function generatePropertyId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `prop-${timestamp}-${random}`;
}

/**
 * Create a new property
 * @param {string} landlordId - Landlord user ID
 * @param {Object} addressData - Property address data
 * @param {string} addressData.addressLine1 - Street address
 * @param {string} addressData.city - City
 * @param {string} addressData.state - State
 * @param {string} addressData.zipcode - Zip code
 * @param {string} landlordEmail - Optional landlord email (for creating user document if needed)
 * @returns {Promise<string>} Property document ID
 */
export const createProperty = async (landlordId, addressData, landlordEmail = null) => {
  // Don't check user document - just create the property
  // Firestore rules will handle security (they allow authenticated users to create properties
  // where they set themselves as the landlord)
  const propertiesRef = collection(db, PROPERTIES_COLLECTION);
  
  // Try to create/update user document in background (non-blocking)
  const userRef = doc(db, 'users', landlordId);
  getDoc(userRef).then((userDoc) => {
    if (!userDoc.exists()) {
      const userData = {
        role: 'landlord',
        landlordId: landlordId,
        createdAt: Timestamp.now(),
      };
      
      if (landlordEmail) {
        userData.email = landlordEmail;
      }
      
      setDoc(userRef, userData).catch((error) => {
        console.warn('Could not create user document (non-blocking):', error.message);
      });
    }
  }).catch(() => {
    // Ignore errors - this is non-blocking
  });
  
  // Combine address components into full address string for display
  const fullAddress = [
    addressData.addressLine1?.trim(),
    addressData.city?.trim(),
    addressData.state?.trim(),
    addressData.zipcode?.trim()
  ].filter(Boolean).join(', ');
  
  const propertyData = {
    landlordId,
    addressLine1: addressData.addressLine1?.trim() || '',
    city: addressData.city?.trim() || '',
    state: addressData.state?.trim() || '',
    zipcode: addressData.zipcode?.trim() || '',
    address: fullAddress, // Full address for backward compatibility and display
    propertyId: generatePropertyId(),
    tenantIds: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  console.log('Creating property with data:', propertyData);
  console.log('Current user UID:', landlordId);
  console.log('Property landlordId will be:', propertyData.landlordId);
  
  try {
    const docRef = await addDoc(propertiesRef, propertyData);
    console.log('✅ Property created successfully:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Firestore error creating property:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Provide more helpful error messages
    if (error.code === 'permission-denied') {
      const enhancedError = new Error(
        'Permission denied. Please ensure:\n' +
        '1. You are logged in as a landlord\n' +
        '2. Firestore rules are deployed\n' +
        '3. Your user document exists (try refreshing the page)'
      );
      enhancedError.code = error.code;
      throw enhancedError;
    }
    
    throw error;
  }
};

/**
 * Get all properties for a landlord
 * @param {string} landlordId - Landlord user ID
 * @returns {Promise<Array>} Array of property documents
 */
export const getLandlordProperties = async (landlordId) => {
  const propertiesRef = collection(db, PROPERTIES_COLLECTION);
  console.log('Querying properties for landlordId:', landlordId);
  
  try {
    const q = query(
      propertiesRef,
      where('landlordId', '==', landlordId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log('Query returned', querySnapshot.docs.length, 'properties');
    
    const properties = querySnapshot.docs.map(doc => {
      const data = doc.data();
      console.log('Property:', doc.id, data);
      return {
        id: doc.id,
        ...data,
      };
    });
    
    return properties;
  } catch (error) {
    console.error('Error in getLandlordProperties:', error);
    // If orderBy fails (missing index), try without it
    if (error.code === 'failed-precondition') {
      console.warn('Index missing, trying query without orderBy');
      const q = query(
        propertiesRef,
        where('landlordId', '==', landlordId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    }
    throw error;
  }
};

/**
 * Get a single property by ID
 * @param {string} propertyId - Property document ID
 * @returns {Promise<Object|null>} Property document or null
 */
export const getProperty = async (propertyId) => {
  const propertyRef = doc(db, PROPERTIES_COLLECTION, propertyId);
  const propertyDoc = await getDoc(propertyRef);
  
  if (propertyDoc.exists()) {
    return { id: propertyDoc.id, ...propertyDoc.data() };
  }
  return null;
};

/**
 * Get property by propertyId (the generated ID, not document ID)
 * @param {string} propertyId - Generated property ID (e.g., prop-123-abc)
 * @returns {Promise<Object|null>} Property document or null
 */
export const getPropertyByPropertyId = async (propertyId) => {
  const propertiesRef = collection(db, PROPERTIES_COLLECTION);
  const q = query(propertiesRef, where('propertyId', '==', propertyId));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    const propertyDoc = querySnapshot.docs[0];
    return { id: propertyDoc.id, ...propertyDoc.data() };
  }
  return null;
};

/**
 * Add a tenant to a property
 * @param {string} propertyDocId - Property document ID
 * @param {string} tenantId - Tenant user ID
 * @returns {Promise<void>}
 */
export const addTenantToProperty = async (propertyDocId, tenantId) => {
  const propertyRef = doc(db, PROPERTIES_COLLECTION, propertyDocId);
  await updateDoc(propertyRef, {
    tenantIds: arrayUnion(tenantId),
    updatedAt: Timestamp.now(),
  });
};

/**
 * Remove a tenant from a property
 * @param {string} propertyDocId - Property document ID
 * @param {string} tenantId - Tenant user ID
 * @returns {Promise<void>}
 */
export const removeTenantFromProperty = async (propertyDocId, tenantId) => {
  const propertyRef = doc(db, PROPERTIES_COLLECTION, propertyDocId);
  await updateDoc(propertyRef, {
    tenantIds: arrayRemove(tenantId),
    updatedAt: Timestamp.now(),
  });
};

/**
 * Update property address
 * @param {string} propertyDocId - Property document ID
 * @param {string} address - New address
 * @returns {Promise<void>}
 */
export const updatePropertyAddress = async (propertyDocId, address) => {
  const propertyRef = doc(db, PROPERTIES_COLLECTION, propertyDocId);
  await updateDoc(propertyRef, {
    address: address.trim(),
    updatedAt: Timestamp.now(),
  });
};

/**
 * Delete a property
 * @param {string} propertyDocId - Property document ID
 * @returns {Promise<void>}
 */
export const deleteProperty = async (propertyDocId) => {
  const propertyRef = doc(db, PROPERTIES_COLLECTION, propertyDocId);
  await deleteDoc(propertyRef);
};

/**
 * Get all tenants for a property
 * @param {string} propertyDocId - Property document ID
 * @returns {Promise<Array>} Array of tenant user documents
 */
export const getPropertyTenants = async (propertyDocId) => {
  const property = await getProperty(propertyDocId);
  if (!property || !property.tenantIds || property.tenantIds.length === 0) {
    return [];
  }
  
  const tenants = [];
  for (const tenantId of property.tenantIds) {
    try {
      const tenantRef = doc(db, 'users', tenantId);
      const tenantDoc = await getDoc(tenantRef);
      if (tenantDoc.exists()) {
        tenants.push({ id: tenantDoc.id, ...tenantDoc.data() });
      }
    } catch (error) {
      console.error(`Error loading tenant ${tenantId}:`, error);
    }
  }
  
  return tenants;
};

/**
 * Get maintenance requests for a property
 * @param {string} propertyId - Generated property ID (e.g., prop-123-abc)
 * @returns {Promise<Array>} Array of maintenance request documents
 */
export const getPropertyMaintenanceRequests = async (propertyId) => {
  const maintenanceRef = collection(db, 'maintenanceRequests');
  const q = query(
    maintenanceRef,
    where('propertyId', '==', propertyId),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};

