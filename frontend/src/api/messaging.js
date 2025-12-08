/**
 * Messaging API
 * Real-time chat functionality for maintenance requests
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  getDocs,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Create a chat room for a maintenance request or direct messaging
 * @param {string} roomId - Unique room ID (typically maintenance request ID or direct chat ID)
 * @param {string[]} members - Array of user IDs
 * @param {string|null} maintenanceRequestId - Associated maintenance request ID (null for direct chats)
 * @returns {Promise<string>} Room document ID
 */
export const createChatRoom = async (roomId, members, maintenanceRequestId = null) => {
  const roomsRef = collection(db, 'rooms');
  
  // Check if room already exists
  if (maintenanceRequestId) {
    const q = query(roomsRef, where('maintenanceRequestId', '==', maintenanceRequestId));
    const existingRooms = await getDocs(q);
    
    if (!existingRooms.empty) {
      return existingRooms.docs[0].id;
    }
  } else {
    // For direct chats, check if a room with these exact members already exists
    const q = query(roomsRef, where('members', 'array-contains', members[0]));
    const existingRooms = await getDocs(q);
    
    // Find room with exact same members and no maintenanceRequestId
    for (const doc of existingRooms.docs) {
      const roomData = doc.data();
      if (
        !roomData.maintenanceRequestId &&
        roomData.members.length === members.length &&
        members.every(member => roomData.members.includes(member))
      ) {
        return doc.id;
      }
    }
  }
  
  const roomData = {
    members,
    createdAt: Timestamp.now(),
  };
  
  if (maintenanceRequestId) {
    roomData.maintenanceRequestId = maintenanceRequestId;
  }
  
  const docRef = await addDoc(roomsRef, roomData);
  return docRef.id;
};

/**
 * Get chat room by room ID (for direct chats)
 */
export const getChatRoomById = async (roomId) => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomDoc = await getDoc(roomRef);
  
  if (roomDoc.exists()) {
    return { id: roomDoc.id, ...roomDoc.data() };
  }
  return null;
};

/**
 * Get chat room by maintenance request ID
 */
export const getChatRoomByRequestId = async (maintenanceRequestId) => {
  const roomsRef = collection(db, 'rooms');
  const q = query(roomsRef, where('maintenanceRequestId', '==', maintenanceRequestId));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    const roomDoc = querySnapshot.docs[0];
    return { id: roomDoc.id, ...roomDoc.data() };
  }
  return null;
};

/**
 * Add a member to a chat room
 */
export const addMemberToRoom = async (roomId, userId) => {
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, {
    members: arrayUnion(userId),
  });
};

/**
 * Send a message to a chat room
 * @param {string} roomId - Chat room ID
 * @param {string} senderId - User ID of sender
 * @param {string} text - Message text
 * @returns {Promise<string>} Message document ID
 */
export const sendMessage = async (roomId, senderId, text) => {
  const messagesRef = collection(db, 'rooms', roomId, 'messages');
  
  const messageData = {
    senderId,
    text,
    timestamp: Timestamp.now(),
  };
  
  const docRef = await addDoc(messagesRef, messageData);
  return docRef.id;
};

/**
 * Subscribe to messages in a chat room (real-time)
 * @param {string} roomId - Chat room ID
 * @param {Function} callback - Callback function that receives messages array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToMessages = (roomId, callback) => {
  const messagesRef = collection(db, 'rooms', roomId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(messages);
  });
};

/**
 * Get all chat rooms for a user
 */
export const getUserChatRooms = async (userId) => {
  const roomsRef = collection(db, 'rooms');
  const q = query(roomsRef, where('members', 'array-contains', userId));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
};

