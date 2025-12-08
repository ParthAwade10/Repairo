/**
 * Shared Type Definitions for Repairo
 * These types are used across frontend and backend
 */

// User Roles
export const USER_ROLES = {
  TENANT: 'tenant',
  LANDLORD: 'landlord',
  CONTRACTOR: 'contractor',
  ADMIN: 'admin',
};

// Maintenance Request Status
export const MAINTENANCE_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
};

// Maintenance Request Schema
export const MaintenanceRequest = {
  title: '',
  description: '',
  images: [], // Array of Firebase Storage URLs
  propertyId: '',
  tenantId: '',
  landlordId: '',
  contractorId: null, // nullable
  status: MAINTENANCE_STATUS.OPEN,
  createdAt: null, // Firestore timestamp
  updatedAt: null, // Firestore timestamp
};

// Chat Room Schema
export const ChatRoom = {
  members: [], // Array of user IDs
  maintenanceRequestId: '',
  createdAt: null, // Firestore timestamp
};

// Message Schema
export const Message = {
  senderId: '',
  text: '',
  timestamp: null, // Firestore timestamp
};

