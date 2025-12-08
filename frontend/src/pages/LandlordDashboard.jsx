/**
 * Landlord Dashboard
 * View properties, tenants, and maintenance requests
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLandlordRequests, assignContractor, updateRequestStatus } from '../api/maintenance';
import { signOut } from '../api/auth';
import { createInvite } from '../api/invites';
import {
  getLandlordProperties,
  createProperty,
  getPropertyTenants,
  getPropertyMaintenanceRequests,
  addTenantToProperty,
  removeTenantFromProperty,
  deleteProperty,
} from '../api/properties';
import { doc, getDoc, getDocs, query, where, collection, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getUserChatRooms, createChatRoom, subscribeToMessages, sendMessage, deleteMessage, getChatRoomByRequestId, addMemberToRoom } from '../api/messaging';
import Logo from '../components/Logo';

export default function LandlordDashboard() {
  const { currentUser } = useAuth();
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [propertyInvites, setPropertyInvites] = useState([]);
  const [propertyRequests, setPropertyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [landlordId, setLandlordId] = useState(null);
  const [propertyTenantCounts, setPropertyTenantCounts] = useState({});
  
  // Add Property State
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [county, setCounty] = useState('');
  const [addingProperty, setAddingProperty] = useState(false);
  
  // Add Tenant State
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [tenantEmail, setTenantEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  
  // Messaging State
  const [showMessaging, setShowMessaging] = useState(false);
  const [chatRooms, setChatRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesByRoom, setMessagesByRoom] = useState({}); // Store messages by room ID
  const [newMessage, setNewMessage] = useState('');
  const [allTenants, setAllTenants] = useState([]);
  const [selectedTenantForNewChat, setSelectedTenantForNewChat] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  
  // Contractors State
  const [contractors, setContractors] = useState([]);
  const [selectedContractors, setSelectedContractors] = useState({}); // Map of requestId -> contractorId

  // Helper to display a readable contractor label
  const getContractorLabel = (id) => {
    if (!id) return '';
    const c = contractors.find((c) => c.id === id);
    if (c) {
      if (c.firstName && c.lastName) return `${c.firstName} ${c.lastName}${c.email ? ` (${c.email})` : ''}`;
      if (c.name && c.email) return `${c.name} (${c.email})`;
      return c.email || c.name || id;
    }
    return id; // fallback if not in list
  };

  useEffect(() => {
    if (currentUser) {
      loadLandlordId();
      loadProperties();
      // Load chat rooms on mount so they persist
      loadChatRooms();
      // Also load tenants on mount so they're available
      loadAllTenants();
      // Load contractors on mount
      loadContractors();
    }
  }, [currentUser]);

  // Auto-sync tenants from chat rooms and invites when properties are loaded
  useEffect(() => {
    if (properties.length > 0 && currentUser) {
      console.log('🔄 Properties loaded, running auto-sync for all properties...');
      syncAllPropertiesTenants();
    }
  }, [properties, currentUser]);

  // Periodically refresh unread counts (even when messaging is closed)
  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        loadChatRooms();
      }, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Debug: Log when selectedContractors changes
  useEffect(() => {
    console.log('🟡 selectedContractors state changed:', selectedContractors);
  }, [selectedContractors]);

  const loadLandlordId = async () => {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.landlordId) {
          setLandlordId(userData.landlordId);
        } else {
          setLandlordId(currentUser.uid);
        }
      } else {
        setLandlordId(currentUser.uid);
      }
    } catch (error) {
      console.error('Error loading landlord ID:', error);
      setLandlordId(currentUser.uid);
    }
  };

  const loadProperties = async () => {
    try {
      console.log('Loading properties for landlord:', currentUser.uid);
      const data = await getLandlordProperties(currentUser.uid);
      console.log('Properties loaded:', data);
      setProperties(data);
      
      // Load tenant counts for each property
      const counts = {};
      for (const property of data) {
        try {
          const tenants = await getPropertyTenants(property.id);
          counts[property.id] = tenants.length;
        } catch (error) {
          console.error('Error loading tenant count for property:', error);
          counts[property.id] = 0;
        }
      }
      setPropertyTenantCounts(counts);
      
      // Reload all tenants when properties are loaded
      await loadAllTenants();
    } catch (error) {
      console.error('Error loading properties:', error);
      console.error('Error details:', error.code, error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProperty = async (e) => {
    e.preventDefault();
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !zipcode.trim() || !county.trim()) {
      alert('Please fill in all address fields (including county)');
      return;
    }

    setAddingProperty(true);
    try {
      console.log('Creating property with landlordId:', currentUser.uid);
      const propertyId = await createProperty(
        currentUser.uid, 
        {
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          state: state.trim(),
          zipcode: zipcode.trim(),
          county: county.trim(),
        },
        currentUser.email // Pass email for user document creation if needed
      );
      console.log('Property created successfully:', propertyId);
      setAddressLine1('');
      setCity('');
      setState('');
      setZipcode('');
      setCounty('');
      setShowAddProperty(false);
      
      // Reload properties after a short delay to ensure Firestore has updated
      setTimeout(async () => {
        await loadProperties();
      }, 500);
    } catch (error) {
      console.error('Error creating property:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Full error object:', error);
      
      let errorMessage = 'Failed to create property: ' + error.message;
      
      if (error.code === 'permission-denied') {
        errorMessage += '\n\nThis is a permissions error. Please check:';
        errorMessage += '\n1. You are logged in';
        errorMessage += '\n2. Your Firestore rules are deployed';
        errorMessage += '\n3. Try refreshing the page and logging in again';
      }
      
      alert(errorMessage);
    } finally {
      setAddingProperty(false);
    }
  };

  const handleSelectProperty = async (property) => {
    setSelectedProperty(property);
    
    console.log('🔍 Selecting property:', property.id, property.propertyId);
    
    // Auto-sync accepted invites to property (silently, in background)
    try {
      const { getLandlordInvites } = await import('../api/invites');
      const allInvites = await getLandlordInvites(currentUser.uid);
      console.log('🔍 All invites:', allInvites.length);
      
      // Get accepted invites - try to find tenantId if not set
      let acceptedInvites = allInvites.filter(
        invite => invite.status === 'accepted' && invite.propertyId === property.propertyId
      );
      
      // If invite doesn't have tenantId, try to find tenant by email
      for (const invite of acceptedInvites) {
        if (!invite.tenantId && invite.tenantEmail) {
          try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', invite.tenantEmail.toLowerCase().trim()));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              invite.tenantId = querySnapshot.docs[0].id;
              console.log('🔍 Found tenantId for invite:', invite.tenantEmail, '->', invite.tenantId);
            }
          } catch (error) {
            console.error('Error finding tenant by email:', error);
          }
        }
      }
      
      // Filter to only invites with tenantId
      acceptedInvites = acceptedInvites.filter(invite => invite.tenantId);
      console.log('🔍 Accepted invites for this property (with tenantId):', acceptedInvites.length, acceptedInvites);

      // Get current property document to check tenantIds
      const { getProperty } = await import('../api/properties');
      const currentProperty = await getProperty(property.id);
      console.log('🔍 Current property tenantIds:', currentProperty?.tenantIds || 'missing/empty');

      // Sync tenants who accepted but aren't in property yet
      let syncedCount = 0;
      for (const invite of acceptedInvites) {
        try {
          const currentTenants = await getPropertyTenants(property.id);
          const isAlreadyAdded = currentTenants.some(t => t.id === invite.tenantId);
          
          console.log(`🔍 Checking tenant ${invite.tenantId}:`, {
            isAlreadyAdded,
            currentTenantsCount: currentTenants.length,
            tenantEmail: invite.tenantEmail
          });
          
          if (!isAlreadyAdded) {
            console.log(`🔄 Syncing tenant ${invite.tenantId} to property ${property.id}...`);
            await addTenantToProperty(property.id, invite.tenantId);
            syncedCount++;
            console.log(`✅ Auto-synced tenant ${invite.tenantId} to property`);
          }
        } catch (error) {
          console.error(`❌ Error auto-syncing tenant ${invite.tenantId}:`, error);
        }
      }
      
      if (syncedCount > 0) {
        console.log(`✅ Auto-synced ${syncedCount} tenant(s) to property`);
      }
    } catch (error) {
      console.error('❌ Error during auto-sync:', error);
    }
    
    // Load tenants for this property
    try {
      const tenants = await getPropertyTenants(property.id);
      setPropertyTenants(tenants);
      console.log(`✅ Loaded ${tenants.length} tenants for property:`, tenants.map(t => t.email || t.id));
    } catch (error) {
      console.error('❌ Error loading tenants:', error);
      setPropertyTenants([]);
    }
    
    // Load invites for this property
    try {
      const { getLandlordInvites } = await import('../api/invites');
      const allInvites = await getLandlordInvites(currentUser.uid);
      // Filter invites for this property
      const propertyInvites = allInvites.filter(invite => invite.propertyId === property.propertyId);
      setPropertyInvites(propertyInvites);
    } catch (error) {
      console.error('Error loading invites:', error);
      setPropertyInvites([]);
    }
    
    // Load maintenance requests for this property
    // Query by landlordId first (matches Firestore rules), then filter by propertyId
    try {
      const allLandlordRequests = await getLandlordRequests(currentUser.uid);
      // Filter to only requests for this property
      const propertyRequests = allLandlordRequests.filter(
        request => request.propertyId === property.propertyId
      );
      setPropertyRequests(propertyRequests);
      
      // Initialize selectedContractors state with existing contractorIds
      // PRESERVE existing selections - only set if not already in state
      setSelectedContractors(prev => {
        const newState = { ...prev };
        propertyRequests.forEach(request => {
          // Only initialize if not already set by user selection
          // This preserves the user's dropdown selection
          if (request.contractorId && newState[request.id] === undefined) {
            newState[request.id] = request.contractorId;
          }
        });
        console.log('🟢 Initialized selectedContractors (preserving user selections):', newState);
        return newState;
      });
    } catch (error) {
      console.error('Error loading property requests:', error);
      setPropertyRequests([]);
    }
    
    // Reload tenants list for messaging
    await loadAllTenants();
  };

  const loadChatRooms = async () => {
    try {
      const rooms = await getUserChatRooms(currentUser.uid);
      // Get room details with member info and unread counts
      const roomsWithDetails = await Promise.all(
        rooms.map(async (room) => {
          const otherMembers = room.members.filter(m => m !== currentUser.uid);
          const memberDetails = [];
          
          for (const memberId of otherMembers) {
            try {
              const memberDoc = await getDoc(doc(db, 'users', memberId));
              if (memberDoc.exists()) {
                const memberData = memberDoc.data();
                memberDetails.push({
                  id: memberId,
                  name: memberData.firstName && memberData.lastName
                    ? `${memberData.firstName} ${memberData.lastName}`
                    : memberData.name || memberData.email || 'Unknown',
                  email: memberData.email,
                });
              }
            } catch (error) {
              console.error('Error loading member info:', error);
            }
          }
          
          // Get unread count for this room
          const lastReadTime = localStorage.getItem(`lastRead_${room.id}_${currentUser.uid}`);
          let unreadCount = 0;
          
          if (lastReadTime) {
            try {
              const messagesRef = collection(db, 'rooms', room.id, 'messages');
              const q = query(
                messagesRef,
                where('timestamp', '>', new Date(lastReadTime)),
                orderBy('timestamp', 'asc')
              );
              const unreadMessages = await getDocs(q);
              unreadCount = unreadMessages.docs.filter(
                doc => doc.data().senderId !== currentUser.uid
              ).length;
            } catch (error) {
              console.error('Error loading unread count:', error);
            }
          } else {
            // If never read, count all messages not from current user
            try {
              const messagesRef = collection(db, 'rooms', room.id, 'messages');
              const allMessages = await getDocs(query(messagesRef, orderBy('timestamp', 'asc')));
              unreadCount = allMessages.docs.filter(
                doc => doc.data().senderId !== currentUser.uid
              ).length;
            } catch (error) {
              console.error('Error loading all messages for unread count:', error);
            }
          }
          
          return {
            ...room,
            otherMembers: memberDetails,
            unreadCount,
          };
        })
      );
      
      setChatRooms(roomsWithDetails);
      
      // Calculate total unread count
      const total = roomsWithDetails.reduce((sum, room) => sum + (room.unreadCount || 0), 0);
      setTotalUnreadCount(total);
      
      // Store unread counts by room ID
      const counts = {};
      roomsWithDetails.forEach(room => {
        counts[room.id] = room.unreadCount || 0;
      });
      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error loading chat rooms:', error);
    }
  };

  const loadAllTenants = async () => {
    try {
      // Always reload properties to ensure we have the latest list
      const currentProperties = await getLandlordProperties(currentUser.uid);
      console.log('Loading tenants from properties:', currentProperties.length);
      const allTenantsList = [];
      
      for (const property of currentProperties) {
        console.log('Loading tenants for property:', property.id, property.address);
        try {
          const tenants = await getPropertyTenants(property.id);
          console.log(`Found ${tenants.length} tenants for property ${property.id}:`, tenants.map(t => t.email || t.id));
          
          for (const tenant of tenants) {
            // Only add if not already in list
            if (!allTenantsList.find(t => t.id === tenant.id)) {
              allTenantsList.push(tenant);
            }
          }
        } catch (error) {
          console.error(`Error loading tenants for property ${property.id}:`, error);
          console.error('Error details:', error.message, error.code);
        }
      }
      
      console.log('Loaded users for messaging:', allTenantsList);
      console.log('Total users available:', allTenantsList.length);
      console.log('User details:', allTenantsList.map(t => ({
        id: t.id,
        email: t.email,
        name: t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim()
      })));
      
      setAllTenants(allTenantsList);
    } catch (error) {
      console.error('Error loading all tenants:', error);
      console.error('Error details:', error.message, error.code);
      setAllTenants([]);
    }
  };

  const loadContractors = async () => {
    try {
      console.log('🔍 Loading contractors...');
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'contractor'));
      const querySnapshot = await getDocs(q);
      
      console.log('🔍 Query returned', querySnapshot.docs.length, 'contractor documents');
      
      const contractorsList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('🔍 Contractor data:', doc.id, data);
        return {
          id: doc.id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          name: data.firstName && data.lastName
            ? `${data.firstName} ${data.lastName}`
            : data.name || data.email || 'Contractor',
          email: data.email || '',
        };
      });
      
      console.log('✅ Loaded contractors:', contractorsList.length, contractorsList);
      setContractors(contractorsList);
      
      if (contractorsList.length === 0) {
        console.warn('⚠️ No contractors found. Make sure contractors have been created with role="contractor" in Firestore.');
        // Try to get all users to debug
        try {
          const allUsersQuery = query(usersRef);
          const allUsersSnapshot = await getDocs(allUsersQuery);
          console.log('🔍 All users in database:', allUsersSnapshot.docs.map(doc => ({
            id: doc.id,
            email: doc.data().email,
            role: doc.data().role
          })));
        } catch (debugError) {
          console.error('Error loading all users for debug:', debugError);
        }
      }
    } catch (error) {
      console.error('❌ Error loading contractors:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      setContractors([]);
      
      // If permission denied, provide helpful message
      if (error.code === 'permission-denied') {
        console.error('⚠️ Permission denied. Check Firestore rules allow landlords to query users by role.');
      }
    }
  };

  const handleSelectChatRoom = async (room) => {
    // If switching to a different room, clear current messages display
    if (selectedRoom?.id !== room.id) {
      setMessages([]);
    }
    setSelectedRoom(room);
    // Messages will be loaded by the useEffect subscription
  };

  const handleStartNewChat = async () => {
    if (!selectedTenantForNewChat) {
      alert('Please select a user to message');
      return;
    }

    try {
      // Always fetch latest rooms to check for existing chat
      const latestRooms = await getUserChatRooms(currentUser.uid);
      const existingRoom = latestRooms.find(room => 
        room.members.includes(selectedTenantForNewChat) &&
        room.members.length === 2 &&
        !room.maintenanceRequestId
      );

      if (existingRoom) {
        // Get room details with member info
        const otherMembers = existingRoom.members.filter(m => m !== currentUser.uid);
        const memberDetails = [];
        
        for (const memberId of otherMembers) {
          try {
            const memberDoc = await getDoc(doc(db, 'users', memberId));
            if (memberDoc.exists()) {
              const memberData = memberDoc.data();
              const memberName = memberData.firstName && memberData.lastName
                ? `${memberData.firstName} ${memberData.lastName}`
                : memberData.name || memberData.email || 'User';
              
              memberDetails.push({
                id: memberId,
                firstName: memberData.firstName,
                lastName: memberData.lastName,
                name: memberName,
                email: memberData.email || memberId.substring(0, 8) + '...',
              });
            } else {
              // If user document doesn't exist, still add with basic info
              memberDetails.push({
                id: memberId,
                name: 'User',
                email: memberId.substring(0, 8) + '...',
              });
            }
          } catch (error) {
            console.error('Error loading member info:', error);
            // Add placeholder if loading fails
            memberDetails.push({
              id: memberId,
              name: 'User',
              email: memberId.substring(0, 8) + '...',
            });
          }
        }
        
        const roomWithDetails = {
          ...existingRoom,
          otherMembers: memberDetails,
        };
        
        handleSelectChatRoom(roomWithDetails);
      } else {
        // Create new chat room
        const roomId = await createChatRoom(
          `direct-${currentUser.uid}-${selectedTenantForNewChat}`,
          [currentUser.uid, selectedTenantForNewChat],
          null
        );
        
        // Reload chat rooms to get the new room with details
        await loadChatRooms();
        
        // Find the newly created room
        const updatedRooms = await getUserChatRooms(currentUser.uid);
        const newRoom = updatedRooms.find(r => r.id === roomId);
        
        if (newRoom) {
          // Get member details for the new room
          const otherMembers = newRoom.members.filter(m => m !== currentUser.uid);
          const memberDetails = [];
          
          for (const memberId of otherMembers) {
            try {
              const memberDoc = await getDoc(doc(db, 'users', memberId));
              if (memberDoc.exists()) {
                const memberData = memberDoc.data();
                const memberName = memberData.firstName && memberData.lastName
                  ? `${memberData.firstName} ${memberData.lastName}`
                  : memberData.name || memberData.email || 'User';
                
                memberDetails.push({
                  id: memberId,
                  firstName: memberData.firstName,
                  lastName: memberData.lastName,
                  name: memberName,
                  email: memberData.email || memberId.substring(0, 8) + '...',
                });
              } else {
                // If user document doesn't exist, still add with basic info
                memberDetails.push({
                  id: memberId,
                  name: 'User',
                  email: memberId.substring(0, 8) + '...',
                });
              }
            } catch (error) {
              console.error('Error loading member info:', error);
              // Add placeholder if loading fails
              memberDetails.push({
                id: memberId,
                name: 'User',
                email: memberId.substring(0, 8) + '...',
              });
            }
          }
          
          const roomWithDetails = {
            ...newRoom,
            otherMembers: memberDetails,
          };
          
          handleSelectChatRoom(roomWithDetails);
        } else {
          // Fallback if room not found - create basic room structure
          const otherMembers = [selectedTenantForNewChat];
          const memberDetails = [];
          
          try {
            const memberDoc = await getDoc(doc(db, 'users', selectedTenantForNewChat));
            if (memberDoc.exists()) {
              const memberData = memberDoc.data();
              const memberName = memberData.firstName && memberData.lastName
                ? `${memberData.firstName} ${memberData.lastName}`
                : memberData.name || memberData.email || 'User';
              
              memberDetails.push({
                id: selectedTenantForNewChat,
                firstName: memberData.firstName,
                lastName: memberData.lastName,
                name: memberName,
                email: memberData.email || selectedTenantForNewChat.substring(0, 8) + '...',
              });
            } else {
              memberDetails.push({
                id: selectedTenantForNewChat,
                name: 'User',
                email: selectedTenantForNewChat.substring(0, 8) + '...',
              });
            }
          } catch (error) {
            console.error('Error loading member info:', error);
            memberDetails.push({
              id: selectedTenantForNewChat,
              name: 'User',
              email: selectedTenantForNewChat.substring(0, 8) + '...',
            });
          }
          
          handleSelectChatRoom({ 
            id: roomId, 
            members: [currentUser.uid, selectedTenantForNewChat],
            otherMembers: memberDetails,
          });
        }
      }
      
      setSelectedTenantForNewChat('');
    } catch (error) {
      console.error('Error starting new chat:', error);
      alert('Failed to start chat: ' + error.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedRoom) return;

    try {
      await sendMessage(selectedRoom.id, currentUser.uid, newMessage.trim());
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message: ' + error.message);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!selectedRoom || !window.confirm('Are you sure you want to delete this message?')) {
      return;
    }

    try {
      await deleteMessage(selectedRoom.id, messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message: ' + error.message);
    }
  };

  // Subscribe to messages when room is selected
  useEffect(() => {
    if (selectedRoom?.id) {
      // Restore messages from cache if available
      if (messagesByRoom[selectedRoom.id]) {
        setMessages(messagesByRoom[selectedRoom.id]);
      }
      
      // Mark room as read when selected
      localStorage.setItem(`lastRead_${selectedRoom.id}_${currentUser.uid}`, new Date().toISOString());
      
      // Update unread count for this room
      setUnreadCounts(prev => ({ ...prev, [selectedRoom.id]: 0 }));
      setTotalUnreadCount(prev => prev - (unreadCounts[selectedRoom.id] || 0));
      
      const unsubscribe = subscribeToMessages(selectedRoom.id, (msgs) => {
        setMessages(msgs);
        // Store messages in cache by room ID
        setMessagesByRoom(prev => ({ ...prev, [selectedRoom.id]: msgs }));
        // Scroll to bottom when new messages arrive
        setTimeout(() => {
          const messagesContainer = document.querySelector('.overflow-y-auto');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 100);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
    // Don't clear messages when closing - keep them in cache
  }, [selectedRoom, currentUser.uid]);

  const handleAddTenantToProperty = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    if (!tenantEmail.trim()) {
      setInviteError('Please enter a tenant email');
      setInviteLoading(false);
      return;
    }

    if (!selectedProperty) {
      setInviteError('Please select a property first');
      setInviteLoading(false);
      return;
    }

    try {
      // Create invite with property ID
      await createInvite(currentUser.uid, tenantEmail.trim(), selectedProperty.propertyId);
      
      // Try to find existing tenant by email and add to property
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', tenantEmail.trim().toLowerCase()));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const tenantDoc = querySnapshot.docs[0];
          const tenantData = tenantDoc.data();
          
          // If tenant exists and has the right role, add to property
          if (tenantData.role === 'tenant') {
            await addTenantToProperty(selectedProperty.id, tenantDoc.id);
            // Update tenant's user document
            await updateDoc(doc(db, 'users', tenantDoc.id), {
              landlordId: currentUser.uid,
              propertyId: selectedProperty.propertyId,
            });
            setInviteSuccess(`Tenant ${tenantEmail.trim()} added to property!`);
          } else {
            setInviteSuccess(`Invite sent to ${tenantEmail.trim()}!`);
          }
        } else {
          setInviteSuccess(`Invite sent to ${tenantEmail.trim()}!`);
        }
      } catch (error) {
        // If tenant doesn't exist yet, just send invite
        setInviteSuccess(`Invite sent to ${tenantEmail.trim()}!`);
      }
      
      setTenantEmail('');
      setShowAddTenant(false);
      
      // Reload property data
      if (selectedProperty) {
        await handleSelectProperty(selectedProperty);
      }
      
      // Also reload tenants list for messaging
      await loadAllTenants();
    } catch (error) {
      setInviteError(error.message || 'Failed to add tenant');
    } finally {
      setInviteLoading(false);
    }
  };

  // Remove tenant from property
  const handleRemoveTenant = async (tenantId, tenantName) => {
    if (!selectedProperty) {
      alert('Please select a property first');
      return;
    }

    const confirmMessage = `Are you sure you want to remove ${tenantName || 'this tenant'} from this property?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Remove tenant from property's tenantIds array
      await removeTenantFromProperty(selectedProperty.id, tenantId);
      
      // Update tenant's user document to remove propertyId and landlordId
      const tenantRef = doc(db, 'users', tenantId);
      await updateDoc(tenantRef, {
        propertyId: null,
        landlordId: null,
      });

      // Reload property tenants
      const updatedTenants = await getPropertyTenants(selectedProperty.id);
      setPropertyTenants(updatedTenants);
      
      // Also reload tenants list for messaging
      await loadAllTenants();
      
      alert(`${tenantName || 'Tenant'} has been removed from the property.`);
    } catch (error) {
      console.error('Error removing tenant:', error);
      alert(`Failed to remove tenant: ${error.message}`);
    }
  };

  // Sync all properties' tenants from invites and chat rooms
  const syncAllPropertiesTenants = async () => {
    try {
      const { getLandlordInvites } = await import('../api/invites');
      const allInvites = await getLandlordInvites(currentUser.uid);
      const acceptedInvites = allInvites.filter(invite => invite.status === 'accepted' && invite.tenantId);
      
      // Also get tenants from chat rooms (they might have chatted but not be in property)
      const chatRooms = await getUserChatRooms(currentUser.uid);
      const tenantIdsFromChats = new Set();
      for (const room of chatRooms) {
        if (room.members) {
          room.members.forEach(memberId => {
            if (memberId !== currentUser.uid) {
              tenantIdsFromChats.add(memberId);
            }
          });
        }
      }
      
      console.log('🔄 Found', acceptedInvites.length, 'accepted invites');
      console.log('🔄 Found', tenantIdsFromChats.size, 'unique tenants from chat rooms');
      
      // Sync each property
      for (const property of properties) {
        try {
          const propertyInvites = acceptedInvites.filter(invite => invite.propertyId === property.propertyId);
          const currentTenants = await getPropertyTenants(property.id);
          const currentTenantIds = new Set(currentTenants.map(t => t.id));
          
          let syncedCount = 0;
          
          // Sync from invites
          for (const invite of propertyInvites) {
            if (invite.tenantId && !currentTenantIds.has(invite.tenantId)) {
              try {
                await addTenantToProperty(property.id, invite.tenantId);
                currentTenantIds.add(invite.tenantId);
                syncedCount++;
                console.log(`✅ Synced tenant ${invite.tenantId} from invite to property ${property.id}`);
              } catch (error) {
                console.error(`Error syncing tenant ${invite.tenantId}:`, error);
              }
            }
          }
          
          // Also check chat rooms - if a tenant has chatted and has this propertyId in their user doc, add them
          for (const tenantId of tenantIdsFromChats) {
            if (!currentTenantIds.has(tenantId)) {
              try {
                const tenantDoc = await getDoc(doc(db, 'users', tenantId));
                if (tenantDoc.exists()) {
                  const tenantData = tenantDoc.data();
                  if (tenantData.propertyId === property.propertyId && tenantData.role === 'tenant') {
                    await addTenantToProperty(property.id, tenantId);
                    currentTenantIds.add(tenantId);
                    syncedCount++;
                    console.log(`✅ Synced tenant ${tenantId} from chat/user doc to property ${property.id}`);
                  }
                }
              } catch (error) {
                console.error(`Error checking/syncing tenant ${tenantId}:`, error);
              }
            }
          }
          
          if (syncedCount > 0) {
            console.log(`✅ Synced ${syncedCount} tenant(s) to property ${property.id}`);
          }
        } catch (error) {
          console.error(`Error syncing property ${property.id}:`, error);
        }
      }
      
      // Reload tenants after sync
      await loadAllTenants();
    } catch (error) {
      console.error('Error in syncAllPropertiesTenants:', error);
    }
  };

  // Sync accepted invites to property (add tenants who accepted but weren't added to property)
  const syncTenantsToProperty = async () => {
    if (!selectedProperty) {
      alert('Please select a property first');
      return;
    }

    try {
      const { getLandlordInvites } = await import('../api/invites');
      const allInvites = await getLandlordInvites(currentUser.uid);
      const acceptedInvites = allInvites.filter(
        invite => invite.status === 'accepted' && invite.propertyId === selectedProperty.propertyId && invite.tenantId
      );

      if (acceptedInvites.length === 0) {
        alert('No accepted invites found for this property');
        return;
      }

      let syncedCount = 0;
      for (const invite of acceptedInvites) {
        try {
          // Check if tenant is already in property
          const currentTenants = await getPropertyTenants(selectedProperty.id);
          const isAlreadyAdded = currentTenants.some(t => t.id === invite.tenantId);
          
          if (!isAlreadyAdded) {
            await addTenantToProperty(selectedProperty.id, invite.tenantId);
            syncedCount++;
            console.log(`✅ Synced tenant ${invite.tenantId} to property`);
          }
        } catch (error) {
          console.error(`Error syncing tenant ${invite.tenantId}:`, error);
        }
      }

      if (syncedCount > 0) {
        alert(`Synced ${syncedCount} tenant(s) to property`);
        // Reload property data
        await handleSelectProperty(selectedProperty);
        await loadAllTenants();
      } else {
        alert('All accepted tenants are already in the property');
      }
    } catch (error) {
      console.error('Error syncing tenants:', error);
      alert('Failed to sync tenants: ' + error.message);
    }
  };

  const handleMessageAllTenants = async () => {
    if (!selectedProperty) {
      alert('Please select a property first.');
      return;
    }

    try {
      // Open messaging interface if not already open
      if (!showMessaging) {
        setShowMessaging(true);
        await loadChatRooms();
        await loadAllTenants();
      }

      // Fetch tenants directly from the property to ensure we have all of them
      console.log('🔍 Fetching tenants for property:', selectedProperty.id);
      const allTenantsForProperty = await getPropertyTenants(selectedProperty.id);
      console.log('🔍 Found tenants:', allTenantsForProperty.length, allTenantsForProperty.map(t => ({ id: t.id, email: t.email || t.id })));
      
      if (allTenantsForProperty.length === 0) {
        alert('No tenants to message. Add tenants to this property first.');
        return;
      }

      // Create a group chat with landlord and all tenants
      const tenantIds = allTenantsForProperty.map(t => t.id);
      const members = [currentUser.uid, ...tenantIds];
      console.log('🔍 Creating group chat with members:', members);
      console.log('🔍 Member count:', members.length, '(1 landlord +', tenantIds.length, 'tenants)');
      
      // Check if group chat already exists for this property
      const rooms = await getUserChatRooms(currentUser.uid);
      const existingGroupRoom = rooms.find(room => {
        // Check if this room has the landlord and all tenants
        const hasLandlord = room.members && room.members.includes(currentUser.uid);
        const hasAllTenants = tenantIds.every(tenantId => room.members && room.members.includes(tenantId));
        const sameMemberCount = room.members && room.members.length === members.length;
        const noMaintenanceRequest = !room.maintenanceRequestId;
        
        console.log('🔍 Checking room:', room.id, {
          hasLandlord,
          hasAllTenants,
          sameMemberCount,
          noMaintenanceRequest,
          roomMemberCount: room.members ? room.members.length : 0,
          expectedMemberCount: members.length,
          roomMembers: room.members
        });
        
        return hasLandlord && hasAllTenants && sameMemberCount && noMaintenanceRequest;
      });

      let roomToSelect = null;

      if (existingGroupRoom) {
        console.log('✅ Found existing group chat:', existingGroupRoom.id);
        // Verify all members are present
        const existingMembers = existingGroupRoom.members || [];
        const missingTenantIds = tenantIds.filter(id => !existingMembers.includes(id));
        
        if (missingTenantIds.length > 0) {
          console.log('⚠️ Existing room is missing tenants:', missingTenantIds);
          // Add missing tenants to the room
          for (const tenantId of missingTenantIds) {
            try {
              await addMemberToRoom(existingGroupRoom.id, tenantId);
              console.log('✅ Added missing tenant to room:', tenantId);
            } catch (error) {
              console.error('❌ Error adding tenant to room:', error);
            }
          }
          // Reload the room after adding members
          await loadChatRooms();
          const updatedRooms = await getUserChatRooms(currentUser.uid);
          const updatedRoom = updatedRooms.find(r => r.id === existingGroupRoom.id);
          if (updatedRoom) {
            existingGroupRoom.members = updatedRoom.members;
          }
        }
        
        // Load member details for existing room
        const otherMembers = (existingGroupRoom.members || []).filter(m => m !== currentUser.uid);
        const memberDetails = [];
        
        for (const memberId of otherMembers) {
          try {
            const memberDoc = await getDoc(doc(db, 'users', memberId));
            if (memberDoc.exists()) {
              const memberData = memberDoc.data();
              const memberName = memberData.firstName && memberData.lastName
                ? `${memberData.firstName} ${memberData.lastName}`
                : memberData.name || memberData.email || 'User';
              
              memberDetails.push({
                id: memberId,
                firstName: memberData.firstName,
                lastName: memberData.lastName,
                name: memberName,
                email: memberData.email,
              });
            } else {
              memberDetails.push({
                id: memberId,
                name: 'User',
                email: memberId.substring(0, 8) + '...',
              });
            }
          } catch (error) {
            console.error('Error loading member info:', error);
            memberDetails.push({
              id: memberId,
              name: 'User',
              email: memberId.substring(0, 8) + '...',
            });
          }
        }
        
        console.log('✅ Using existing group chat with all tenants');
        roomToSelect = {
          ...existingGroupRoom,
          otherMembers: memberDetails,
        };
      }

      // If we don't have a room to select (either new or existing), create one
      if (!roomToSelect) {
        console.log('🔨 Creating new group chat with all tenants');
        // Create new group chat - ensure all members are included
        const roomId = await createChatRoom(
          `property_${selectedProperty.propertyId}_group`,
          members,
          null
        );
        
        console.log('✅ Created room with ID:', roomId);
        console.log('✅ Room members array:', members);
        
        // Verify the room was created correctly by fetching it
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait longer for Firestore
        
        // Reload chat rooms to get the new room
        await loadChatRooms();
        
        const updatedRooms = await getUserChatRooms(currentUser.uid);
        const newRoom = updatedRooms.find(r => r.id === roomId);
        
        if (newRoom) {
          console.log('✅ Found new room:', newRoom.id);
          console.log('✅ Room has', newRoom.members ? newRoom.members.length : 0, 'members');
          console.log('✅ Room members:', newRoom.members);
          
          // Verify all members are in the room
          const roomMembers = newRoom.members || [];
          const missingMembers = members.filter(m => !roomMembers.includes(m));
          if (missingMembers.length > 0) {
            console.log('⚠️ Room is missing members:', missingMembers);
            // Add missing members
            for (const memberId of missingMembers) {
              try {
                await addMemberToRoom(roomId, memberId);
                console.log('✅ Added missing member to room:', memberId);
              } catch (error) {
                console.error('❌ Error adding member to room:', error);
              }
            }
            // Reload again
            await loadChatRooms();
            const finalRooms = await getUserChatRooms(currentUser.uid);
            const finalRoom = finalRooms.find(r => r.id === roomId);
            if (finalRoom) {
              newRoom.members = finalRoom.members;
            }
          }
          
          // Load member details for the group chat
          const otherMembers = (newRoom.members || []).filter(m => m !== currentUser.uid);
          const memberDetails = [];
          
          for (const memberId of otherMembers) {
            try {
              const memberDoc = await getDoc(doc(db, 'users', memberId));
              if (memberDoc.exists()) {
                const memberData = memberDoc.data();
                const memberName = memberData.firstName && memberData.lastName
                  ? `${memberData.firstName} ${memberData.lastName}`
                  : memberData.name || memberData.email || 'User';
                
                memberDetails.push({
                  id: memberId,
                  firstName: memberData.firstName,
                  lastName: memberData.lastName,
                  name: memberName,
                  email: memberData.email,
                });
              } else {
                memberDetails.push({
                  id: memberId,
                  name: 'User',
                  email: memberId.substring(0, 8) + '...',
                });
              }
            } catch (error) {
              console.error('Error loading member info:', error);
              memberDetails.push({
                id: memberId,
                name: 'User',
                email: memberId.substring(0, 8) + '...',
              });
            }
          }
          
          roomToSelect = {
            ...newRoom,
            otherMembers: memberDetails,
          };
        } else {
          console.log('⚠️ Room not found after creation, using fallback');
          // Fallback - use the tenants we fetched
          roomToSelect = {
            id: roomId,
            members: members,
            otherMembers: allTenantsForProperty.map(t => ({
              id: t.id,
              firstName: t.firstName || '',
              lastName: t.lastName || '',
              name: t.firstName && t.lastName ? `${t.firstName} ${t.lastName}` : t.name || t.email || 'Tenant',
              email: t.email,
            })),
          };
        }
      }
      
      // Select the room within the messaging interface
      if (roomToSelect) {
        handleSelectChatRoom(roomToSelect);
      } else {
        console.error('Failed to create or find group chat room');
        alert('Failed to create group chat. Please try again.');
      }
    } catch (error) {
      console.error('Error creating group chat with tenants:', error);
      alert('Failed to create group chat: ' + error.message);
    }
  };

  const handleOpenRequestChat = async (request) => {
    if (!request || !selectedProperty) {
      alert('Please select a property first.');
      return;
    }

    try {
      // Open messaging interface if not already open
      if (!showMessaging) {
        setShowMessaging(true);
        await loadChatRooms();
        await loadAllTenants();
      }

      // Get all tenants for the property
      const allTenantsForProperty = await getPropertyTenants(selectedProperty.id);
      
      // Build members list: landlord, all tenants, and contractor (if assigned)
      const members = [currentUser.uid];
      
      // Add all tenants
      allTenantsForProperty.forEach(tenant => {
        if (!members.includes(tenant.id)) {
          members.push(tenant.id);
        }
      });
      
      // Add contractor if assigned
      if (request.contractorId && !members.includes(request.contractorId)) {
        members.push(request.contractorId);
      }

      // Check if chat room already exists for this request
      let room = await getChatRoomByRequestId(request.id);
      
      if (!room) {
        // Create new chat room
        const roomId = await createChatRoom(request.id, members, request.id);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadChatRooms();
        
        const updatedRooms = await getUserChatRooms(currentUser.uid);
        room = updatedRooms.find(r => r.id === roomId);
      } else {
        // Ensure all members are in the room
        const currentMembers = room.members || [];
        
        // Add missing tenants
        for (const tenant of allTenantsForProperty) {
          if (!currentMembers.includes(tenant.id)) {
            await addMemberToRoom(room.id, tenant.id);
          }
        }
        
        // Add contractor if assigned and not in room
        if (request.contractorId && !currentMembers.includes(request.contractorId)) {
          await addMemberToRoom(room.id, request.contractorId);
        }
        
        // Reload chat rooms to get updated room data
        await loadChatRooms();
        const updatedRooms = await getUserChatRooms(currentUser.uid);
        room = updatedRooms.find(r => r.id === room.id);
      }

      if (room) {
        // Load member details for the room
        const otherMembers = room.members.filter(m => m !== currentUser.uid);
        const memberDetails = [];
        
        for (const memberId of otherMembers) {
          try {
            const memberDoc = await getDoc(doc(db, 'users', memberId));
            if (memberDoc.exists()) {
              const memberData = memberDoc.data();
              const memberName = memberData.firstName && memberData.lastName
                ? `${memberData.firstName} ${memberData.lastName}`
                : memberData.name || memberData.email || 'User';
              
              memberDetails.push({
                id: memberId,
                firstName: memberData.firstName,
                lastName: memberData.lastName,
                name: memberName,
                email: memberData.email,
              });
            } else {
              memberDetails.push({
                id: memberId,
                name: 'User',
                email: memberId.substring(0, 8) + '...',
              });
            }
          } catch (error) {
            console.error('Error loading member info:', error);
            memberDetails.push({
              id: memberId,
              name: 'User',
              email: memberId.substring(0, 8) + '...',
            });
          }
        }
        
        const roomWithDetails = {
          ...room,
          otherMembers: memberDetails,
        };
        
        handleSelectChatRoom(roomWithDetails);
      } else {
        alert('Failed to create or find chat room. Please try again.');
      }
    } catch (error) {
      console.error('Error opening request chat:', error);
      alert('Failed to open chat: ' + error.message);
    }
  };

  const handleAssignContractor = async (requestId, contractorId) => {
    if (!contractorId) {
      alert('Please select a contractor');
      return;
    }
    
    // Find the request to check landlordId
    const request = propertyRequests.find(r => r.id === requestId);
    console.log('🔵 Assigning contractor:', { requestId, contractorId });
    console.log('🔵 Current user UID:', currentUser?.uid);
    console.log('🔵 Request data:', request);
    console.log('🔵 Request landlordId:', request?.landlordId);
    console.log('🔵 Do they match?', request?.landlordId === currentUser?.uid);
    
    // Check if landlordId matches
    if (request && request.landlordId !== currentUser.uid) {
      console.error('❌ Permission issue: Request landlordId does not match current user');
      console.error('Request landlordId:', request.landlordId);
      console.error('Current user UID:', currentUser.uid);
      alert(`Permission error: This request belongs to a different landlord (${request.landlordId}). Your UID: ${currentUser.uid}`);
      return;
    }
    
    try {
      await assignContractor(requestId, contractorId);
      // Update the selected contractor in state immediately
      setSelectedContractors(prev => ({
        ...prev,
        [requestId]: contractorId
      }));
      
      // Reload property requests to get updated data
      if (selectedProperty) {
        await handleSelectProperty(selectedProperty);
      }
      alert('Contractor assigned successfully!');
    } catch (error) {
      console.error('❌ Error assigning contractor:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      if (error.code === 'permission-denied') {
        alert('Permission denied. Please ensure:\n1. You are logged in as a landlord\n2. This request belongs to you\n3. Your Firestore rules are deployed');
      } else {
        alert('Failed to assign contractor: ' + error.message);
      }
    }
  };

  const handleStatusChange = async (requestId, newStatus) => {
    try {
      await updateRequestStatus(requestId, newStatus);
      if (selectedProperty) {
        await handleSelectProperty(selectedProperty);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const handleDeleteProperty = async (propertyDocId) => {
    if (!window.confirm('Are you sure you want to delete this property? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteProperty(propertyDocId);
      // If the deleted property was selected, clear selection
      if (selectedProperty?.id === propertyDocId) {
        setSelectedProperty(null);
        setPropertyTenants([]);
        setPropertyRequests([]);
      }
      // Reload properties list
      await loadProperties();
      alert('Property deleted successfully');
    } catch (error) {
      console.error('Error deleting property:', error);
      alert('Failed to delete property: ' + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border border-blue-300';
      case 'complete':
        return 'bg-gray-100 text-gray-700 border border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex items-center hover:opacity-90 transition"
            >
              <Logo size="xl" showText={true} />
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowMessaging(!showMessaging);
                  if (!showMessaging) {
                    loadChatRooms();
                    loadAllTenants();
                    if (selectedRoom?.id && messagesByRoom[selectedRoom.id]) {
                      setMessages(messagesByRoom[selectedRoom.id]);
                    }
                  }
                }}
                className="relative inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md font-medium text-sm"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <defs>
                    <linearGradient id="messageGradientLandlord" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#93C5FD" />
                      <stop offset="100%" stopColor="#60A5FA" />
                    </linearGradient>
                  </defs>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    stroke="url(#messageGradientLandlord)"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Messages
                {totalUnreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ring-2 ring-white">
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </span>
                )}
              </button>
              <Link
                to="/profile"
                className="px-4 py-2 text-gray-700 hover:text-gray-900 rounded-xl hover:bg-gray-100/80 transition-colors font-medium text-sm flex items-center gap-2"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A10.97 10.97 0 0112 15c2.21 0 4.266.64 6.004 1.739M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Profile
              </Link>
              <button
                onClick={async () => {
                  await signOut();
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 rounded-xl hover:bg-gray-100/80 transition-colors font-medium text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Messaging Interface */}
          {showMessaging && (
            <div className="mb-6 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 bg-white">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">Messages</h2>
                  <button
                    onClick={() => {
                      setShowMessaging(false);
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="flex h-[600px]">
                {/* Left Sidebar - Users List */}
                <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
                  <div className="p-4 border-b border-gray-200">
                        <h3 className="font-semibold text-gray-900 mb-3">Start New Chat</h3>
                        <select
                          value={selectedTenantForNewChat}
                          onChange={(e) => setSelectedTenantForNewChat(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                        >
                          <option value="">Select a user...</option>
                          {allTenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                              {(tenant.firstName && tenant.lastName
                                ? `${tenant.firstName} ${tenant.lastName}`
                                : tenant.name || tenant.email || 'User') + ' (Tenant)'}
                            </option>
                          ))}
                          {contractors.map((contractor) => (
                            <option key={contractor.id} value={contractor.id}>
                              {(contractor.firstName && contractor.lastName
                                ? `${contractor.firstName} ${contractor.lastName}`
                                : contractor.name || contractor.email || 'Contractor') + ' (Contractor)'}
                            </option>
                          ))}
                          {allTenants.length === 0 && contractors.length === 0 && (
                            <option value="" disabled>No users available. Add tenants/contractors first.</option>
                          )}
                        </select>
                        {allTenants.length === 0 && contractors.length === 0 && (
                          <p className="text-xs text-gray-500 mt-1">Add tenants/contractors to start messaging.</p>
                        )}
                    <button
                      onClick={handleStartNewChat}
                      disabled={!selectedTenantForNewChat || allTenants.length === 0}
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm mt-2"
                    >
                      Start Chat
                    </button>
                  </div>
                  
                  <div className="p-2">
                    <h3 className="font-semibold text-gray-900 mb-2 px-2">Chat History</h3>
                    {chatRooms.length === 0 ? (
                      <p className="text-sm text-gray-500 px-2">No messages yet</p>
                    ) : (
                      <div className="space-y-1">
                            {chatRooms.map((room) => {
                              const isGroupChat = room.members && room.members.length > 2;
                              const otherMembers = room.otherMembers || [];
                              const isSelected = selectedRoom?.id === room.id;
                              const unreadCount = unreadCounts[room.id] || 0;

                              // Build member names list (excluding current user)
                              const memberNames = otherMembers.map((m) => {
                                if (m.firstName && m.lastName) return `${m.firstName} ${m.lastName}`;
                                if (m.name) return m.name;
                                if (m.email) return m.email;
                                return m.id ? `${m.id.substring(0, 8)}...` : 'User';
                              });
                              const memberSummary = memberNames.join(', ');
                              const memberCount = room.members?.length || (otherMembers.length + 1); // +1 for landlord

                              // For group chats, show group label + member list; for individual chats, show the other person's name
                              let displayName = 'Chat';
                              let displaySubtitle = null;
                              if (isGroupChat) {
                                displayName = selectedProperty && room.id.includes(selectedProperty.propertyId)
                                  ? `${selectedProperty.address || 'Property'} Group Chat (${memberCount} members)`
                                  : `Group Chat (${memberCount} members)`;
                                displaySubtitle = `Members: You${memberNames.length ? `, ${memberSummary}` : ''}`;
                              } else if (otherMembers.length > 0) {
                                displayName = otherMembers[0].name || 'Unknown User';
                                displaySubtitle = otherMembers[0].email || null;
                              }

                              return (
                                <button
                                  key={room.id}
                                  onClick={() => handleSelectChatRoom(room)}
                                  className={`w-full text-left p-3 rounded-md hover:bg-gray-100 transition relative ${
                                    isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                                  }`}
                                >
                                  <div className="font-medium text-gray-900">{displayName}</div>
                                  {displaySubtitle && (
                                    <div className="text-xs text-gray-500">{displaySubtitle}</div>
                                  )}
                                  {room.maintenanceRequestId && (
                                    <div className="text-xs text-blue-600 mt-1">Maintenance Request</div>
                                  )}
                                  {unreadCount > 0 && (
                                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                      {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Right Side - Chat Messages */}
                <div className="flex-1 flex flex-col">
                  {selectedRoom ? (
                    <>
                          <div className="p-4 border-b border-gray-200 bg-gray-50">
                            {selectedRoom.members && selectedRoom.members.length > 2 ? (
                              (() => {
                                const memberNames = (selectedRoom.otherMembers || []).map((m) => {
                                  if (m.firstName && m.lastName) return `${m.firstName} ${m.lastName}`;
                                  if (m.name) return m.name;
                                  if (m.email) return m.email;
                                  return m.id ? `${m.id.substring(0, 8)}...` : 'User';
                                });
                                const memberCount = selectedRoom.members.length;
                                const subtitle = `Members: You${memberNames.length ? `, ${memberNames.join(', ')}` : ''}`;

                                return (
                                  <>
                                    <h3 className="font-semibold text-gray-900">
                                      {selectedProperty && selectedRoom.id.includes(selectedProperty.propertyId)
                                        ? `${selectedProperty.address || 'Property'} Group Chat (${memberCount} members)`
                                        : `Group Chat (${memberCount} members)`}
                                    </h3>
                                    <p className="text-sm text-gray-600">{subtitle}</p>
                                  </>
                                );
                              })()
                            ) : (
                              <>
                                <h3 className="font-semibold text-gray-900">
                                  {selectedRoom.otherMembers?.[0]?.name || 'Chat'}
                                </h3>
                                {selectedRoom.otherMembers?.[0]?.email && (
                                  <p className="text-sm text-gray-600">{selectedRoom.otherMembers[0].email}</p>
                                )}
                              </>
                            )}
                          </div>
                      
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 ? (
                          <div className="text-center text-gray-500 mt-8">
                            No messages yet. Start the conversation!
                          </div>
                        ) : (
                          messages.map((message) => {
                            const isOwnMessage = message.senderId === currentUser.uid;
                            return (
                              <div
                                key={message.id}
                                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                                onMouseEnter={() => setHoveredMessageId(message.id)}
                                onMouseLeave={() => setHoveredMessageId(null)}
                              >
                                <div
                                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg relative group shadow-sm ${
                                    isOwnMessage
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-100 text-gray-900'
                                  }`}
                                >
                                  {isOwnMessage && hoveredMessageId === message.id && (
                                    <button
                                      onClick={() => handleDeleteMessage(message.id)}
                                      className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-lg transition z-10"
                                      title="Delete message"
                                    >
                                      <svg
                                        className="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                  <p className="text-sm">{message.text}</p>
                                  <p
                                    className={`text-xs mt-1 ${
                                      isOwnMessage ? 'text-blue-100' : 'text-gray-500'
                                    }`}
                                  >
                                    {message.timestamp?.toDate ? message.timestamp.toDate().toLocaleString() : 'Just now'}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      
                      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 px-4 py-3 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                          <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                          >
                            Send
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                      <p>Select a chat from the list to view messages</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Properties List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Properties</h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={loadProperties}
                      className="flex items-center justify-center px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm shadow-sm hover:shadow-md transition-all duration-200"
                      title="Refresh properties list"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <defs>
                          <linearGradient id="refreshGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#93C5FD" />
                            <stop offset="100%" stopColor="#60A5FA" />
                          </linearGradient>
                        </defs>
                        <path
                          stroke="url(#refreshGradient)"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115.5-3.5M20 15a9 9 0 01-15.5 3.5"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => setShowAddProperty(!showAddProperty)}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <defs>
                          <linearGradient id="addPropertyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#93C5FD" />
                            <stop offset="100%" stopColor="#3B82F6" />
                          </linearGradient>
                        </defs>
                        <path
                          stroke="url(#addPropertyGradient)"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Add Property
                    </button>
                  </div>
                </div>

                {showAddProperty && (
                  <form onSubmit={handleAddProperty} className="mb-4 p-5 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 shadow-md space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address Line 1 *
                      </label>
                      <input
                        type="text"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        placeholder="Street address, apartment, suite, etc."
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State *
                        </label>
                        <input
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          placeholder="State"
                          required
                          maxLength={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Zip Code *
                        </label>
                        <input
                          type="text"
                          value={zipcode}
                          onChange={(e) => setZipcode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Zip"
                          required
                          maxLength={5}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
                        />
                      </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        County (SoCal) *
                      </label>
                      <select
                        value={county}
                        onChange={(e) => setCounty(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select county</option>
                        <option value="Los Angeles">Los Angeles</option>
                        <option value="Orange">Orange</option>
                        <option value="San Diego">San Diego</option>
                        <option value="Riverside">Riverside</option>
                        <option value="San Bernardino">San Bernardino</option>
                        <option value="Ventura">Ventura</option>
                        <option value="Imperial">Imperial</option>
                        <option value="Santa Barbara">Santa Barbara</option>
                        <option value="Kern">Kern</option>
                      </select>
                    </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={addingProperty}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                      >
                        {addingProperty ? 'Creating...' : 'Create Property'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddProperty(false);
                          setAddressLine1('');
                          setCity('');
                          setState('');
                          setZipcode('');
                        }}
                        className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : properties.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No properties yet. Add your first property!</p>
                    <p className="text-xs mt-2">Landlord ID: {currentUser?.uid?.substring(0, 8)}...</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {properties.map((property) => {
                      // Format address for display
                      const displayAddress = property.address || 
                        [property.addressLine1, property.city, property.state, property.zipcode]
                          .filter(Boolean)
                          .join(', ');
                      
                      return (
                        <div
                          key={property.id}
                          className={`w-full p-4 rounded-xl border-2 transition-all duration-200 shadow-md hover:shadow-lg ${
                            selectedProperty?.id === property.id
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          <button
                            onClick={() => handleSelectProperty(property)}
                            className="w-full text-left"
                          >
                            <div className="font-semibold text-gray-900">{displayAddress}</div>
                            <div className="text-sm text-gray-500 mt-1">
                              Property ID: {property.propertyId}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {propertyTenantCounts[property.id] ?? property.tenantIds?.length ?? 0} tenant(s)
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProperty(property.id);
                            }}
                            className="mt-2 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Delete property"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Property Details */}
            <div className="lg:col-span-2">
              {selectedProperty ? (
                <div className="space-y-6">

                  {/* Property Header */}
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                          </div>
                          <h2 className="text-2xl font-bold text-gray-900">
                            {selectedProperty.address || 
                              [selectedProperty.addressLine1, selectedProperty.city, selectedProperty.state, selectedProperty.zipcode]
                                .filter(Boolean)
                                .join(', ')}
                          </h2>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 ml-12">Property ID: {selectedProperty.propertyId}</p>
                      </div>
                      <button
                        onClick={() => setShowAddTenant(!showAddTenant)}
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <defs>
                            <linearGradient id="addTenantGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#93C5FD" />
                              <stop offset="100%" stopColor="#3B82F6" />
                            </linearGradient>
                          </defs>
                          <path
                            stroke="url(#addTenantGradient)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5.121 17.804A10.97 10.97 0 0112 15c2.21 0 4.266.64 6.004 1.739M15 10a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        Add Tenant
                      </button>
                    </div>

                    {showAddTenant && (
                      <form onSubmit={handleAddTenantToProperty} className="mb-4 p-4 bg-gray-50 rounded-lg">
                        {inviteError && (
                          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-3">
                            {inviteError}
                          </div>
                        )}
                        {inviteSuccess && (
                          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-3">
                            {inviteSuccess}
                          </div>
                        )}
                        <input
                          type="email"
                          value={tenantEmail}
                          onChange={(e) => setTenantEmail(e.target.value)}
                          placeholder="Tenant Email"
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={inviteLoading}
                            className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <defs>
                                <linearGradient id="addTenantFormGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#93C5FD" />
                                  <stop offset="100%" stopColor="#3B82F6" />
                                </linearGradient>
                              </defs>
                              <path
                                stroke="url(#addTenantFormGradient)"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5.121 17.804A10.97 10.97 0 0112 15c2.21 0 4.266.64 6.004 1.739M15 10a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            {inviteLoading ? 'Adding...' : 'Add Tenant'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddTenant(false);
                              setTenantEmail('');
                              setInviteError('');
                              setInviteSuccess('');
                            }}
                            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                      {/* Tenants List */}
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-lg font-semibold text-gray-900">Tenants</h3>
                          {propertyTenants.length > 0 && (
                            <button
                              onClick={handleMessageAllTenants}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
                              title="Create a group chat with all tenants"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <defs>
                                  <linearGradient id="messageAllGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#93C5FD" />
                                    <stop offset="100%" stopColor="#3B82F6" />
                                  </linearGradient>
                                </defs>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  stroke="url(#messageAllGradient)"
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                              </svg>
                              Message All Tenants
                            </button>
                          )}
                        </div>
                      {propertyTenants.length === 0 && propertyInvites.filter(i => i.status === 'accepted').length === 0 ? (
                        <p className="text-gray-500 text-sm">No tenants added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {/* Show accepted tenants */}
                          {propertyTenants.map((tenant) => {
                            const tenantName = tenant.firstName && tenant.lastName
                              ? `${tenant.firstName} ${tenant.lastName}`
                              : tenant.name || tenant.email || 'Tenant';
                            return (
                              <div
                                key={tenant.id}
                                className="p-3 bg-blue-50 rounded-lg border border-blue-200"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      {tenantName}
                                    </div>
                                    {tenant.email && (
                                      <div className="text-sm text-gray-600">{tenant.email}</div>
                                    )}
                                    {tenant.firstName && tenant.lastName && tenant.name && (
                                      <div className="text-xs text-gray-500 mt-1">Full name: {tenant.name}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                      ✓ Active
                                    </span>
                                    <button
                                      onClick={() => handleRemoveTenant(tenant.id, tenantName)}
                                      className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Remove tenant from property"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          
                          {/* Show pending invites */}
                          {propertyInvites
                            .filter(invite => invite.status === 'pending')
                            .map((invite) => (
                              <div
                                key={invite.id}
                                className="p-3 bg-blue-50 rounded-lg border border-blue-200"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-gray-900">{invite.tenantEmail}</div>
                                    <div className="text-xs text-gray-500">Invite sent</div>
                                  </div>
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                    Pending
                                  </span>
                                </div>
                              </div>
                            ))}
                          
                          {/* Show accepted invites (in case they're not in propertyTenants yet) */}
                          {propertyInvites
                            .filter(invite => invite.status === 'accepted' && !propertyTenants.some(t => t.email === invite.tenantEmail))
                            .map((invite) => (
                              <div
                                key={invite.id}
                                className="p-3 bg-blue-50 rounded-lg border border-blue-200"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-gray-900">{invite.tenantEmail}</div>
                                    <div className="text-xs text-gray-500">Accepted invite</div>
                                  </div>
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                    ✓ Accepted
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Maintenance Requests */}
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Maintenance Requests</h3>
                      </div>
                      <Link
                        to="/maintenance/create"
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
                        title="Create a new maintenance request"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <defs>
                            <linearGradient id="newRequestGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#93C5FD" />
                              <stop offset="100%" stopColor="#3B82F6" />
                            </linearGradient>
                          </defs>
                          <path
                            stroke="url(#newRequestGradient)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        New Request
                      </Link>
                    </div>
                    {propertyRequests.length === 0 ? (
                      <p className="text-gray-500">No maintenance requests for this property.</p>
                    ) : (
                      <div className="space-y-4">
                        {propertyRequests.map((request) => (
                          <div
                            key={request.id}
                            className="border border-gray-200 bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200"
                          >
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1">
                                <Link
                                  to={`/maintenance/${request.id}`}
                                  className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                                >
                                  {request.title}
                                </Link>
                                <p className="text-gray-600 mt-1">{request.description}</p>
                                <p className="text-sm text-gray-500 mt-2">
                                  Created: {request.createdAt?.toDate().toLocaleDateString()}
                                </p>
                                {request.contractorId && (
                                  <p className="text-sm text-blue-600 mt-2">
                                    Contractor: {getContractorLabel(request.contractorId)}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                                  request.status
                                )}`}
                              >
                                {request.status.replace('_', ' ')}
                              </span>
                            </div>

                            <div className="flex gap-2 mt-4">
                              {request.status === 'open' && (
                                <>
                                  <div className="flex flex-col gap-1 flex-1">
                                    {(() => {
                                      const currentVal = selectedContractors[request.id] ?? request.contractorId ?? '';
                                      const currentLabel = getContractorLabel(currentVal) || 'Select Contractor...';
                                      return (
                                        <select
                                          value={currentVal}
                                          onChange={(e) => {
                                            const selectedValue = e.target.value;
                                            setSelectedContractors(prev => ({
                                              ...prev,
                                              [request.id]: selectedValue
                                            }));
                                          }}
                                          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                                        >
                                          {!currentVal && <option value="">Select Contractor...</option>}
                                          {currentVal && (
                                            <option value={currentVal}>{currentLabel}</option>
                                          )}
                                          {contractors
                                            .filter((contractor) => contractor.id !== currentVal)
                                            .map((contractor) => (
                                              <option 
                                                key={contractor.id} 
                                                value={contractor.id}
                                              >
                                                {contractor.firstName && contractor.lastName
                                                  ? `${contractor.firstName} ${contractor.lastName}`
                                                  : contractor.name || contractor.email || contractor.id}
                                                {contractor.email && ` (${contractor.email})`}
                                              </option>
                                            ))}
                                          {contractors.length === 0 && (
                                            <option value="" disabled>No contractors available</option>
                                          )}
                                        </select>
                                      );
                                    })()}
                                  </div>
                                  {request.contractorId && (
                                    <span className="px-3 py-2 text-sm text-blue-600 font-medium flex items-center">
                                      ✓ Contractor Assigned
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleAssignContractor(request.id, selectedContractors[request.id] || request.contractorId)}
                                    disabled={!selectedContractors[request.id] && !request.contractorId}
                                    className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                                  >
                                    {request.contractorId ? 'Reassign' : 'Assign'}
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(request.id, 'in_progress')}
                                    disabled={!request.contractorId}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                                    title={!request.contractorId ? 'Please assign a contractor first' : ''}
                                  >
                                    Start
                                  </button>
                                </>
                              )}
                              {request.status === 'in_progress' && (
                                <button
                                  onClick={() => handleStatusChange(request.id, 'complete')}
                                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <defs>
                                      <linearGradient id="markCompleteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#93C5FD" />
                                        <stop offset="100%" stopColor="#3B82F6" />
                                      </linearGradient>
                                    </defs>
                                    <path
                                      stroke="url(#markCompleteGradient)"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                  Mark Complete
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenRequestChat(request)}
                                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                                  <defs>
                                    <linearGradient id="chatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                      <stop offset="0%" stopColor="#93C5FD" />
                                      <stop offset="100%" stopColor="#3B82F6" />
                                    </linearGradient>
                                  </defs>
                                  <path
                                    stroke="url(#chatGradient)"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                  />
                                </svg>
                                Chat
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <p className="text-gray-500">Select a property to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
