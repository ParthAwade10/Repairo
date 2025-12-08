/**
 * Tenant Dashboard
 * View and create maintenance requests
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTenantRequests, getPropertyRequests } from '../api/maintenance';
import { signOut } from '../api/auth';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  subscribeToTenantInvites, 
  acceptInvite, 
  declineInvite 
} from '../api/invites';
import { getUserChatRooms, createChatRoom, subscribeToMessages, sendMessage, deleteMessage, subscribeToUserChatRooms } from '../api/messaging';
import { getPropertyTenants } from '../api/properties';
import Logo from '../components/Logo';

export default function TenantDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [propertyRequests, setPropertyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [landlordId, setLandlordId] = useState(null);
  const [propertyId, setPropertyId] = useState(null);
  const [propertyInfo, setPropertyInfo] = useState(null);
  const [landlordInfo, setLandlordInfo] = useState(null);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [invites, setInvites] = useState([]);
  const [invitesWithDetails, setInvitesWithDetails] = useState([]);
  const [showInvites, setShowInvites] = useState(false);
  const [contractorCache, setContractorCache] = useState({});
  
  // Messaging State
  const [showMessaging, setShowMessaging] = useState(false);
  const [chatRooms, setChatRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesByRoom, setMessagesByRoom] = useState({}); // Store messages by room ID
  const [newMessage, setNewMessage] = useState('');
  const [peopleToMessage, setPeopleToMessage] = useState([]);
  const [selectedPersonForNewChat, setSelectedPersonForNewChat] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  useEffect(() => {
    if (currentUser) {
      loadRequests();
      loadLandlordId();
      // Load chat rooms on mount so they persist
      loadChatRooms();
    }
  }, [currentUser]);

  // Prefetch contractor info for display (name/email) when contractorId is present
  useEffect(() => {
    const ids = new Set();
    [...propertyRequests, ...requests].forEach((r) => {
      if (r.contractorId) ids.add(r.contractorId);
    });
    const missing = [...ids].filter((id) => !contractorCache[id]);
    if (missing.length === 0) return;

    (async () => {
      const updates = {};
      for (const id of missing) {
        try {
          const snap = await getDoc(doc(db, 'users', id));
          if (snap.exists()) {
            const d = snap.data();
            updates[id] = {
              name: d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : d.name || d.email || id,
              email: d.email || '',
            };
          }
        } catch (err) {
          console.warn('Could not load contractor profile for display:', id, err);
        }
      }
      if (Object.keys(updates).length > 0) {
        setContractorCache((prev) => ({ ...prev, ...updates }));
      }
    })();
  }, [propertyRequests, requests, db]); // avoid re-running on cache changes

  // Load roommates list whenever propertyInfo is available
  useEffect(() => {
    const loadTenants = async () => {
      if (propertyInfo?.id) {
        try {
          const { getPropertyTenants } = await import('../api/properties');
          const tenantsList = await getPropertyTenants(propertyInfo.id);
          setPropertyTenants(tenantsList);
        } catch (err) {
          console.error('Error loading property tenants:', err);
        }
      }
    };
    loadTenants();
  }, [propertyInfo?.id]);

  // Load initial data on mount
  useEffect(() => {
    if (currentUser) {
      loadRequests();
      loadLandlordId();
      loadChatRooms(); // Load chat rooms on mount so they persist
    }
  }, [currentUser]);

  // Auto-load people to message when messaging interface opens or when landlord/property info changes
  useEffect(() => {
    if (showMessaging && currentUser) {
      console.log('Messaging opened, loading people to message...');
      console.log('Current landlordId:', landlordId);
      console.log('Current propertyInfo:', propertyInfo);
      loadPeopleToMessage();
    }
  }, [showMessaging, currentUser, landlordId, propertyInfo]);

  // Subscribe to chat rooms in real-time (even when messaging is closed)
  useEffect(() => {
    if (currentUser) {
      // Load initial chat rooms
      loadChatRooms();
      
      // Subscribe to real-time updates
      const unsubscribe = subscribeToUserChatRooms(currentUser.uid, async (rooms) => {
        // Process rooms with member details and unread counts
        const roomsWithDetails = await Promise.all(
          rooms.map(async (room) => {
            const otherMembers = room.members.filter(m => m !== currentUser.uid);
            const memberDetails = [];
            
            for (const memberId of otherMembers) {
              try {
                const memberDoc = await getDoc(doc(db, 'users', memberId));
                if (memberDoc.exists()) {
                  const memberData = memberDoc.data();
                  const memberName = (memberData.firstName?.trim() && memberData.lastName?.trim())
                    ? `${memberData.firstName.trim()} ${memberData.lastName.trim()}`
                    : memberData.name?.trim() || memberData.email || 'User';
                  
                  memberDetails.push({
                    id: memberId,
                    firstName: memberData.firstName?.trim() || '',
                    lastName: memberData.lastName?.trim() || '',
                    name: memberName,
                    email: memberData.email || memberId.substring(0, 8) + '...',
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
            
            if (memberDetails.length === 0 && otherMembers.length > 0) {
              const firstOtherMemberId = otherMembers[0];
              memberDetails.push({
                id: firstOtherMemberId,
                name: 'User',
                email: firstOtherMemberId.substring(0, 8) + '...',
              });
            }
            
            return {
              ...room,
              otherMembers: memberDetails,
              unreadCount,
            };
          })
        );
        
        setChatRooms(roomsWithDetails);
        
        const total = roomsWithDetails.reduce((sum, room) => sum + (room.unreadCount || 0), 0);
        setTotalUnreadCount(total);
        
        const counts = {};
        roomsWithDetails.forEach(room => {
          counts[room.id] = room.unreadCount || 0;
        });
        setUnreadCounts(counts);
      });
      
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [currentUser]);

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
    } else {
      // Don't clear messages when closing - keep them in cache
      // Only clear the display when switching to a different room
    }
  }, [selectedRoom, currentUser.uid]);

  useEffect(() => {
    if (!currentUser?.email) return;
    
    // Subscribe to real-time invites - normalize email to lowercase
    const normalizedEmail = currentUser.email.toLowerCase().trim();
    console.log('Subscribing to invites for email:', normalizedEmail);
    
    const unsubscribe = subscribeToTenantInvites(normalizedEmail, async (invitesList) => {
      console.log('Invites received:', invitesList);
      console.log('Number of invites:', invitesList.length);
      setInvites(invitesList);
      
      // Load details for each invite (landlord info, property info)
      const invitesWithDetails = await Promise.all(
        invitesList.map(async (invite) => {
          const details = { ...invite };
          
          // Load landlord info
          if (invite.landlordId) {
            try {
              const landlordDoc = await getDoc(doc(db, 'users', invite.landlordId));
              if (landlordDoc.exists()) {
                details.landlordInfo = landlordDoc.data();
              }
            } catch (error) {
              console.error('Error loading landlord info:', error);
            }
          }
          
          // Load property info
          if (invite.propertyId) {
            try {
              const { getPropertyByPropertyId } = await import('../api/properties');
              const property = await getPropertyByPropertyId(invite.propertyId);
              if (property) {
                details.propertyInfo = property;
              }
            } catch (error) {
              console.error('Error loading property info:', error);
            }
          }
          
          return details;
        })
      );
      
      setInvitesWithDetails(invitesWithDetails);
      if (invitesList.length > 0) {
        setShowInvites(true);
      }
    });
    
    // Also try to load invites immediately (in case subscription has issues)
    const loadInvites = async () => {
      try {
        const { getTenantInvites } = await import('../api/invites');
        const invites = await getTenantInvites(normalizedEmail);
        console.log('Loaded invites directly:', invites);
        setInvites(invites);
        
        // Load details for each invite
        const invitesWithDetails = await Promise.all(
          invites.map(async (invite) => {
            const details = { ...invite };
            
            // Load landlord info
            if (invite.landlordId) {
              try {
                const landlordDoc = await getDoc(doc(db, 'users', invite.landlordId));
                if (landlordDoc.exists()) {
                  details.landlordInfo = landlordDoc.data();
                }
              } catch (error) {
                console.error('Error loading landlord info:', error);
              }
            }
            
            // Load property info
            if (invite.propertyId) {
              try {
                const { getPropertyByPropertyId } = await import('../api/properties');
                const property = await getPropertyByPropertyId(invite.propertyId);
                if (property) {
                  details.propertyInfo = property;
                }
              } catch (error) {
                console.error('Error loading property info:', error);
              }
            }
            
            return details;
          })
        );
        
        setInvitesWithDetails(invitesWithDetails);
        if (invites.length > 0) {
          setShowInvites(true);
        }
      } catch (error) {
        console.error('Error loading invites:', error);
      }
    };
    loadInvites();
    
    return () => unsubscribe();
  }, [currentUser]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      // Accept invite - this updates the invite status and user document
      await acceptInvite(inviteId, currentUser.uid);
      
      // Wait a moment for Firestore to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload landlord ID and property info after accepting
      await loadLandlordId();
      
      // Remove accepted invite from the list
      setInvites(prev => prev.filter(inv => inv.id !== inviteId));
      setInvitesWithDetails(prev => prev.filter(inv => inv.id !== inviteId));
      
      // Wait a bit more to ensure property is saved, then navigate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate to property dashboard
      window.location.href = '/property';
    } catch (error) {
      console.error('Error accepting invite:', error);
      console.error('Error code:', error.code);
      console.error('Error details:', error);
      
      // Check if the invite was actually accepted (sometimes error happens after success)
      try {
        const inviteDoc = await getDoc(doc(db, 'invites', inviteId));
        if (inviteDoc.exists() && inviteDoc.data().status === 'accepted') {
          // Invite was accepted, wait and reload
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadLandlordId();
          setInvites(prev => prev.filter(inv => inv.id !== inviteId));
          setInvitesWithDetails(prev => prev.filter(inv => inv.id !== inviteId));
          // Navigate to property dashboard with full reload
          await new Promise(resolve => setTimeout(resolve, 500));
          window.location.href = '/property';
          return;
        }
      } catch (checkError) {
        console.error('Error checking invite status:', checkError);
      }
      
      alert('Failed to accept invite: ' + error.message);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await declineInvite(inviteId);
    } catch (error) {
      console.error('Error declining invite:', error);
      alert('Failed to decline invite');
    }
  };

  const loadLandlordId = async () => {
    try {
      // Get landlordId and propertyId from user document
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.landlordId) {
          setLandlordId(userData.landlordId);
          // Load landlord info
          try {
            const landlordDocRef = doc(db, 'users', userData.landlordId);
            const landlordDoc = await getDoc(landlordDocRef);
            if (landlordDoc.exists()) {
              setLandlordInfo(landlordDoc.data());
            }
          } catch (error) {
            console.error('Error loading landlord info:', error);
          }
        }
        if (userData.propertyId) {
          setPropertyId(userData.propertyId);
          // Load property info
          try {
            const { getPropertyByPropertyId } = await import('../api/properties');
            const property = await getPropertyByPropertyId(userData.propertyId);
            if (property) {
              setPropertyInfo(property);
              console.log('✅ Property info loaded:', property);
              // Load roommates list
              try {
                const { getPropertyTenants } = await import('../api/properties');
                const tenantsList = await getPropertyTenants(property.id);
                setPropertyTenants(tenantsList);
              } catch (err) {
                console.error('Error loading property tenants:', err);
              }
            } else {
              console.warn('Property not found for ID:', userData.propertyId);
            }
          } catch (error) {
            console.error('Error loading property info:', error);
          }
          // Load all requests for this property
          loadPropertyRequests(userData.propertyId);
        } else {
          // Clear property info if no propertyId
          setPropertyInfo(null);
          setPropertyId(null);
        }
      }
    } catch (error) {
      console.error('Error loading landlord ID:', error);
    }
  };

  const loadPropertyRequests = async (propId) => {
    try {
      const data = await getPropertyRequests(propId);
      // Show all property requests (including tenant's own - they're already in requests, but we'll show them here too for visibility)
      // Actually, let's show all requests from the property, but mark which ones are the tenant's
      setPropertyRequests(data);
    } catch (error) {
      console.error('Error loading property requests:', error);
    }
  };

  const handleMessageLandlord = async () => {
    // Get landlordId from state or property info
    let llId = landlordId;
    if (!llId && propertyInfo && propertyInfo.landlordId) {
      llId = propertyInfo.landlordId;
    }
    
    // If still no landlordId, try to get it from user document
    if (!llId) {
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          llId = userDoc.data().landlordId;
        }
      } catch (error) {
        console.error('Error loading landlord ID:', error);
      }
    }

    if (!llId) {
      alert('Landlord information not found. Please accept a property invite from your landlord first.');
      return;
    }

    try {
      // Open messaging interface
      setShowMessaging(true);
      
      // Load chat rooms and people first
      await loadPeopleToMessage();
      const rooms = await getUserChatRooms(currentUser.uid);
      
      // Find existing room with landlord
      const existingRoom = rooms.find(room => 
        room.members.includes(llId) &&
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
                const memberName = (memberData.firstName?.trim() && memberData.lastName?.trim())
                  ? `${memberData.firstName.trim()} ${memberData.lastName.trim()}`
                  : memberData.name?.trim() || memberData.email || 'User';
                
                memberDetails.push({
                  id: memberId,
                  firstName: memberData.firstName?.trim() || '',
                  lastName: memberData.lastName?.trim() || '',
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
        
        // Reload all chat rooms to update state
        await loadChatRooms();
        
        // Select the room
        handleSelectChatRoom(roomWithDetails);
      } else {
        // Create a new direct chat room
        const roomId = await createChatRoom(
          `direct-${currentUser.uid}-${llId}`,
          [currentUser.uid, llId],
          null
        );
        
        // Reload chat rooms to get the new room with details
        await loadChatRooms();
        
        const updatedRooms = await getUserChatRooms(currentUser.uid);
        const newRoom = updatedRooms.find(r => r.id === roomId);
        
        if (newRoom) {
          const otherMembers = newRoom.members.filter(m => m !== currentUser.uid);
          const memberDetails = [];
          
          for (const memberId of otherMembers) {
            try {
              const memberDoc = await getDoc(doc(db, 'users', memberId));
              if (memberDoc.exists()) {
                const memberData = memberDoc.data();
                const memberName = memberData.firstName && memberData.lastName
                  ? `${memberData.firstName} ${memberData.lastName}`
                  : memberData.name || memberData.email;
                
                if (memberName) {
                  memberDetails.push({
                    id: memberId,
                    firstName: memberData.firstName,
                    lastName: memberData.lastName,
                    name: memberName,
                    email: memberData.email,
                  });
                }
              }
            } catch (error) {
              console.error('Error loading member info:', error);
            }
          }
          
          const roomWithDetails = {
            ...newRoom,
            otherMembers: memberDetails,
          };
          
          handleSelectChatRoom(roomWithDetails);
        } else {
          handleSelectChatRoom({ id: roomId, members: [currentUser.uid, llId] });
        }
      }
    } catch (error) {
      console.error('Error creating/finding chat room:', error);
      console.error('Error details:', error.message, error.code);
      alert('Failed to open chat: ' + error.message + '. Please try again.');
    }
  };

  const loadRequests = async () => {
    try {
      const data = await getTenantRequests(currentUser.uid);
      setRequests(data);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
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
                // Construct name: prefer firstName + lastName, then name, then email
                const memberName = (memberData.firstName?.trim() && memberData.lastName?.trim())
                  ? `${memberData.firstName.trim()} ${memberData.lastName.trim()}`
                  : memberData.name?.trim() || memberData.email || 'User';
                
                // Always add member, even if we only have email or ID
                memberDetails.push({
                  id: memberId,
                  firstName: memberData.firstName?.trim() || '',
                  lastName: memberData.lastName?.trim() || '',
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
          
          // Ensure we always have at least one member detail, even if loading failed
          // If memberDetails is empty but room has members, create a placeholder
          if (memberDetails.length === 0 && otherMembers.length > 0) {
            const firstOtherMemberId = otherMembers[0];
            memberDetails.push({
              id: firstOtherMemberId,
              name: 'User',
              email: firstOtherMemberId.substring(0, 8) + '...',
            });
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

  const loadPeopleToMessage = async () => {
    try {
      console.log('🔍 loadPeopleToMessage called');
      const people = [];
      
      // First, get user document to find propertyId and landlordId
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.warn('❌ User document does not exist');
        setPeopleToMessage([]);
        return;
      }
      
      const userData = userDoc.data();
      const tenantPropertyId = userData.propertyId; // This is the generated propertyId (e.g., prop-123-abc)
      const tenantLandlordId = userData.landlordId;
      
      console.log('🔍 User data:', { propertyId: tenantPropertyId, landlordId: tenantLandlordId });
      
      // Load property info using the propertyId
      let propInfo = propertyInfo;
      if (!propInfo && tenantPropertyId) {
        try {
          const { getPropertyByPropertyId } = await import('../api/properties');
          propInfo = await getPropertyByPropertyId(tenantPropertyId);
          if (propInfo) {
            setPropertyInfo(propInfo);
            setPropertyId(tenantPropertyId);
          }
        } catch (error) {
          console.error('Error loading property info:', error);
        }
      }
      
      // Add landlord if available - try multiple sources
      let llId = tenantLandlordId;
      if (!llId && propInfo?.landlordId) {
        llId = propInfo.landlordId;
      }
      
      // If still no landlordId, try to get it from property document
      if (!llId && propInfo?.id) {
        try {
          const propertyDoc = await getDoc(doc(db, 'properties', propInfo.id));
          if (propertyDoc.exists()) {
            llId = propertyDoc.data().landlordId;
            console.log('🔍 Found landlordId from property document:', llId);
          }
        } catch (error) {
          console.error('Error loading property document:', error);
        }
      }
      
      console.log('🔍 Final landlordId to use:', llId);
      
      if (llId) {
        try {
          console.log('🔍 Attempting to load landlord document:', llId);
          const landlordDoc = await getDoc(doc(db, 'users', llId));
          if (landlordDoc.exists()) {
            const landlordData = landlordDoc.data();
            const landlordName = (landlordData.firstName?.trim() && landlordData.lastName?.trim())
              ? `${landlordData.firstName.trim()} ${landlordData.lastName.trim()}`
              : landlordData.name?.trim() || landlordData.email || 'Landlord';
            
            people.push({
              id: llId,
              firstName: landlordData.firstName?.trim() || '',
              lastName: landlordData.lastName?.trim() || '',
              name: landlordName,
              email: landlordData.email,
              type: 'landlord',
            });
            console.log('✅ Added landlord to people list:', landlordName, llId);
            
            // Update state
            if (!landlordId) {
              setLandlordId(llId);
            }
          } else {
            console.warn('❌ Landlord document does not exist for ID:', llId);
          }
        } catch (error) {
          console.error('❌ Error loading landlord document:', error);
          console.error('❌ Error code:', error.code);
          console.error('❌ Error message:', error.message);
        }
      } else {
        console.warn('⚠️ No landlordId found in user document or property info');
      }
      
      // Add other tenants from the same property
      if (propInfo && propInfo.id) {
        try {
          const tenants = await getPropertyTenants(propInfo.id); // Use document ID, not propertyId
          console.log(`🔍 Found ${tenants.length} tenants for property ${propInfo.id}`);
          
          for (const tenant of tenants) {
            if (tenant.id !== currentUser.uid) {
              const tenantName = (tenant.firstName?.trim() && tenant.lastName?.trim())
                ? `${tenant.firstName.trim()} ${tenant.lastName.trim()}`
                : tenant.name?.trim() || tenant.email || 'Tenant';
              
              people.push({
                id: tenant.id,
                firstName: tenant.firstName?.trim() || '',
                lastName: tenant.lastName?.trim() || '',
                name: tenantName,
                email: tenant.email,
                type: 'tenant',
              });
              console.log('✅ Added tenant:', tenantName);
            }
          }
        } catch (error) {
          console.error('Error loading tenants:', error);
        }
      } else {
        console.warn('⚠️ No property info available to load tenants');
      }
      
      console.log('✅ Total people to message:', people.length, people.map(p => `${p.name} (${p.type})`));
      setPeopleToMessage(people);
    } catch (error) {
      console.error('❌ Error loading people to message:', error);
      setPeopleToMessage([]);
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
    if (!selectedPersonForNewChat) {
      alert('Please select someone to message');
      return;
    }

    try {
      // Check if chat room already exists
      const existingRooms = chatRooms.filter(room => 
        room.members.includes(selectedPersonForNewChat) &&
        room.members.length === 2 &&
        !room.maintenanceRequestId
      );

      if (existingRooms.length > 0) {
        // Get room details with member info
        const existingRoom = existingRooms[0];
        const otherMembers = existingRoom.members.filter(m => m !== currentUser.uid);
        const memberDetails = [];
        
        for (const memberId of otherMembers) {
          try {
            const memberDoc = await getDoc(doc(db, 'users', memberId));
            if (memberDoc.exists()) {
              const memberData = memberDoc.data();
              const memberName = (memberData.firstName?.trim() && memberData.lastName?.trim())
                ? `${memberData.firstName.trim()} ${memberData.lastName.trim()}`
                : memberData.name?.trim() || memberData.email || 'User';
              
              memberDetails.push({
                id: memberId,
                firstName: memberData.firstName?.trim() || '',
                lastName: memberData.lastName?.trim() || '',
                name: memberName,
                email: memberData.email || memberId.substring(0, 8) + '...',
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
          ...existingRoom,
          otherMembers: memberDetails,
        };
        
        handleSelectChatRoom(roomWithDetails);
      } else {
        // Create new chat room
        const roomId = await createChatRoom(
          `direct-${currentUser.uid}-${selectedPersonForNewChat}`,
          [currentUser.uid, selectedPersonForNewChat],
          null
        );
        
        // Wait a bit for Firestore to index the new room
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload chat rooms to get the new room with details
        await loadChatRooms();
        
        const updatedRooms = await getUserChatRooms(currentUser.uid);
        const newRoom = updatedRooms.find(r => r.id === roomId);
        
        if (newRoom) {
          const otherMembers = newRoom.members.filter(m => m !== currentUser.uid);
          const memberDetails = [];
          
          for (const memberId of otherMembers) {
            try {
              const memberDoc = await getDoc(doc(db, 'users', memberId));
              if (memberDoc.exists()) {
                const memberData = memberDoc.data();
                const memberName = (memberData.firstName?.trim() && memberData.lastName?.trim())
                  ? `${memberData.firstName.trim()} ${memberData.lastName.trim()}`
                  : memberData.name?.trim() || memberData.email || 'User';
                
                memberDetails.push({
                  id: memberId,
                  firstName: memberData.firstName?.trim() || '',
                  lastName: memberData.lastName?.trim() || '',
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
          // Fallback: create room object with minimal info
          const fallbackRoom = {
            id: roomId,
            members: [currentUser.uid, selectedPersonForNewChat],
            otherMembers: [{
              id: selectedPersonForNewChat,
              name: 'User',
              email: selectedPersonForNewChat.substring(0, 8) + '...',
            }],
          };
          handleSelectChatRoom(fallbackRoom);
        }
      }
      
      setSelectedPersonForNewChat('');
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
                onClick={async () => {
                  setShowMessaging(!showMessaging);
                  if (!showMessaging) {
                    await loadLandlordId();
                    await loadChatRooms();
                    await loadPeopleToMessage();
                  } else {
                    setSelectedRoom(null);
                    setMessages([]);
                  }
                }}
                className="relative inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md font-medium text-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <defs>
                    <linearGradient id="messageGradientTenant" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#93C5FD" />
                      <stop offset="100%" stopColor="#60A5FA" />
                    </linearGradient>
                  </defs>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    stroke="url(#messageGradientTenant)"
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
                onClick={handleSignOut}
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
                    <div className="w-1/3 border-r border-gray-200 overflow-y-auto bg-white">
                      <div className="p-4 border-b border-gray-200 bg-white">
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Start New Chat
                        </h3>
                        <select
                          value={selectedPersonForNewChat}
                          onChange={(e) => setSelectedPersonForNewChat(e.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition-all"
                        >
                      <option value="">Select a user...</option>
                      {peopleToMessage.length === 0 ? (
                        <option value="" disabled>No users available. You need to be assigned to a property first.</option>
                      ) : (
                        peopleToMessage.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.firstName && person.lastName
                              ? `${person.firstName} ${person.lastName}`
                              : person.name || person.email || 'User'}
                          </option>
                        ))
                      )}
                    </select>
                    {peopleToMessage.length === 0 && (
                      <p className="text-xs text-gray-500 mt-1">Accept a property invite to message your landlord and roommates.</p>
                    )}
                    <button
                      onClick={handleStartNewChat}
                      disabled={!selectedPersonForNewChat}
                      className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
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
                          const otherMember = room.otherMembers?.[0];
                          const isSelected = selectedRoom?.id === room.id;
                          const unreadCount = unreadCounts[room.id] || 0;
                          return (
                            <button
                              key={room.id}
                              onClick={() => handleSelectChatRoom(room)}
                              className={`w-full text-left p-3 rounded-lg hover:bg-blue-50 transition-all duration-200 relative ${
                                isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                              }`}
                            >
                              {otherMember ? (
                                <>
                                  <div className="font-medium text-gray-900">
                                    {otherMember.firstName && otherMember.lastName
                                      ? `${otherMember.firstName} ${otherMember.lastName}`
                                      : otherMember.name || otherMember.email || 'User'}
                                  </div>
                                  {otherMember.email && (
                                    <div className="text-xs text-gray-500">{otherMember.email}</div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="font-medium text-gray-900">User</div>
                                  {room.members && room.members.length > 0 && (
                                    <div className="text-xs text-gray-500">
                                      {room.members.filter(m => m !== currentUser.uid)[0]?.substring(0, 8) || 'Unknown'}...
                                    </div>
                                  )}
                                </>
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
                        <h3 className="font-semibold text-gray-900">
                          {selectedRoom.otherMembers?.[0]?.firstName && selectedRoom.otherMembers?.[0]?.lastName
                            ? `${selectedRoom.otherMembers[0].firstName} ${selectedRoom.otherMembers[0].lastName}`
                            : selectedRoom.otherMembers?.[0]?.name || selectedRoom.otherMembers?.[0]?.email || 'Chat'}
                        </h3>
                        {selectedRoom.otherMembers?.[0]?.email && (
                          <p className="text-sm text-gray-600">{selectedRoom.otherMembers[0].email}</p>
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
                                      isOwnMessage ? 'text-purple-100' : 'text-gray-500'
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
              {/* Property & Landlord Info Section */}
              {propertyInfo && (
                <div className="mb-6 bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">My Property</h2>
                  </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Property Address</h3>
                  <p className="text-lg text-gray-900">
                    {propertyInfo.address || 
                      [propertyInfo.addressLine1, propertyInfo.city, propertyInfo.state, propertyInfo.zipcode]
                        .filter(Boolean)
                        .join(', ')}
                  </p>
                  {propertyInfo.propertyId && (
                    <p className="text-sm text-gray-500 mt-1">ID: {propertyInfo.propertyId}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Landlord</h3>
                  {landlordInfo ? (
                    <>
                      <p className="text-lg font-semibold text-gray-900">
                        {landlordInfo.firstName && landlordInfo.lastName
                          ? `${landlordInfo.firstName} ${landlordInfo.lastName}`
                          : landlordInfo.name || 'Landlord'}
                      </p>
                      {landlordInfo.email && (
                        <p className="text-sm text-gray-600 mt-1">{landlordInfo.email}</p>
                      )}
                    </>
                  ) : (landlordId || (propertyInfo && propertyInfo.landlordId)) ? (
                    <p className="text-sm text-gray-500 italic">Loading landlord information...</p>
                  ) : (
                    <p className="text-sm text-gray-500">No landlord assigned</p>
                  )}
                </div>
              </div>
              
              {/* Roommates / Tenants list */}
              {propertyTenants.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Tenants in this property</h3>
                  <ul className="space-y-1 text-sm text-gray-800">
                    {propertyTenants.map((t) => (
                      <li key={t.id} className="flex flex-col">
                        <span className="font-semibold">
                          {t.firstName && t.lastName ? `${t.firstName} ${t.lastName}` : t.name || t.email || t.id}
                        </span>
                        <span className="text-gray-600">{t.email}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
            </div>
          )}

          {/* Invites Section - Only show if tenant hasn't joined a property yet */}
          {!propertyInfo && (
            <div className="mb-6 bg-white border border-blue-200 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {invites.length > 0 
                  ? `You have ${invites.length} pending invite${invites.length > 1 ? 's' : ''}`
                  : 'Property Invites'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    // Manual refresh using the API function
                    try {
                      const { getTenantInvites } = await import('../api/invites');
                      const normalizedEmail = currentUser.email.toLowerCase().trim();
                      console.log('Refreshing invites for:', normalizedEmail);
                      const refreshedInvites = await getTenantInvites(normalizedEmail);
                      console.log('Manually refreshed invites:', refreshedInvites);
                      setInvites(refreshedInvites);
                      
                      // Load details for refreshed invites
                      const invitesWithDetails = await Promise.all(
                        refreshedInvites.map(async (invite) => {
                          const details = { ...invite };
                          
                          // Load landlord info
                          if (invite.landlordId) {
                            try {
                              const landlordDoc = await getDoc(doc(db, 'users', invite.landlordId));
                              if (landlordDoc.exists()) {
                                details.landlordInfo = landlordDoc.data();
                              }
                            } catch (error) {
                              console.error('Error loading landlord info:', error);
                            }
                          }
                          
                          // Load property info
                          if (invite.propertyId) {
                            try {
                              const { getPropertyByPropertyId } = await import('../api/properties');
                              const property = await getPropertyByPropertyId(invite.propertyId);
                              if (property) {
                                details.propertyInfo = property;
                              }
                            } catch (error) {
                              console.error('Error loading property info:', error);
                            }
                          }
                          
                          return details;
                        })
                      );
                      
                      setInvitesWithDetails(invitesWithDetails);
                      if (refreshedInvites.length > 0) {
                        setShowInvites(true);
                      } else {
                        alert('No pending invites found. Make sure your landlord sent an invite to: ' + normalizedEmail);
                      }
                    } catch (error) {
                      console.error('Error refreshing invites:', error);
                      console.error('Error code:', error.code);
                      console.error('Error message:', error.message);
                      alert('Error refreshing invites: ' + error.message + '\n\nMake sure Firestore rules are deployed and you are logged in as a tenant.');
                    }
                  }}
                  className="text-yellow-700 hover:text-yellow-900 text-sm px-2 py-1 rounded hover:bg-yellow-100"
                  title="Refresh invites"
                >
                  ↻ Refresh
                </button>
                {invites.length > 0 && (
                  <button
                    onClick={() => setShowInvites(!showInvites)}
                    className="text-yellow-700 hover:text-yellow-900 text-sm"
                  >
                    {showInvites ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
            </div>
            {invites.length === 0 ? (
              <div className="text-sm text-yellow-800">
                <p>No pending invites. Your landlord will send you an invite to join a property.</p>
                <p className="text-xs text-yellow-700 mt-2 italic">
                  Note: Invites appear here when your landlord adds you to a property. 
                  No email is sent - check this dashboard for invites.
                </p>
              </div>
            ) : showInvites ? (
              <div className="space-y-3 mt-4">
                {invitesWithDetails.map((invite) => (
                  <div
                    key={invite.id}
                    className="bg-white rounded-lg p-4 border border-blue-200"
                  >
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-gray-900 mb-1">
                        Invitation from:
                      </p>
                      {invite.landlordInfo ? (
                        <div className="text-sm text-gray-700">
                          <p className="font-medium">
                            {invite.landlordInfo.name || invite.landlordInfo.email || 'Landlord'}
                          </p>
                          {invite.landlordInfo.email && (
                            <p className="text-xs text-gray-600">
                              {invite.landlordInfo.email}
                            </p>
                          )}
                        </div>
                      ) : invite.landlordId ? (
                        <div className="text-sm text-gray-500">
                          <p className="italic">Loading landlord info...</p>
                          <p className="text-xs">Landlord ID: {invite.landlordId.substring(0, 8)}...</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No landlord info available</p>
                      )}
                    </div>
                    
                    {invite.propertyId && (
                      <div className="mb-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Property:</p>
                        {invite.propertyInfo ? (
                          <div className="text-sm text-gray-700">
                            <p className="font-medium">
                              {invite.propertyInfo.address ||
                                [invite.propertyInfo.addressLine1, invite.propertyInfo.city, invite.propertyInfo.state, invite.propertyInfo.zipcode]
                                  .filter(Boolean)
                                  .join(', ')}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              ID: {invite.propertyId}
                            </p>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">
                            <p>Property ID: {invite.propertyId}</p>
                            <p className="text-xs italic">Loading property details...</p>
                            <p className="text-xs mt-1">If this doesn't load, the property may not exist.</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleAcceptInvite(invite.id)}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(invite.id)}
                        className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 text-sm"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          )}

              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                {propertyInfo ? 'Property Maintenance Requests' : 'My Maintenance Requests'}
                </h2>
                <Link
                  to="/maintenance/create"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <defs>
                      <linearGradient id="tenantNewRequestGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#93C5FD" />
                        <stop offset="100%" stopColor="#3B82F6" />
                      </linearGradient>
                    </defs>
                    <path stroke="url(#tenantNewRequestGradient)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Request
                </Link>
              </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading requests...</div>
          ) : (
            <>
              {/* Show all property requests if tenant is assigned to a property */}
              {propertyInfo && propertyRequests.length > 0 ? (
                <div className="grid gap-4">
                  {propertyRequests.map((request) => {
                    const isMyRequest = request.tenantId === currentUser.uid;
                        return (
                          <Link
                            key={request.id}
                            to={`/maintenance/${request.id}`}
                            className={`block bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all duration-200 border-l-4 ${
                              isMyRequest ? 'border-blue-600' : 'border-blue-500'
                            }`}
                          >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-semibold text-gray-900">{request.title}</h3>
                              {isMyRequest && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                  My Request
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 mt-1">{request.description}</p>
                            <p className="text-sm text-gray-500 mt-2">
                              Created: {request.createdAt?.toDate().toLocaleDateString()}
                              {!isMyRequest && (request.creatorName || request.tenantName) && (
                                <span className="ml-2">
                                  by {request.creatorName || request.tenantName}
                                  {request.creatorEmail ? ` (${request.creatorEmail})` : request.tenantEmail ? ` (${request.tenantEmail})` : ''}
                                </span>
                              )}
                            </p>
                            {request.contractorId && (
                              <p className="text-xs text-blue-600 mt-1">
                                Contractor: {request.contractorName || request.contractorEmail || request.contractorId}
                                {request.contractorEmail && request.contractorName ? ` (${request.contractorEmail})` : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                                request.status
                              )}`}
                            >
                              {request.status.replace('_', ' ')}
                            </span>
                            <Link
                              to={`/maintenance/${request.id}`}
                              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                              title="View details and chat"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                              <span>Details</span>
                            </Link>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : propertyInfo && propertyRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No maintenance requests for this property yet. Be the first to create one!
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No maintenance requests yet. Create your first request!
                </div>
              ) : (
                <div className="grid gap-4">
                  {requests.map((request) => (
                    <Link
                      key={request.id}
                      to={`/maintenance/${request.id}`}
                      className="bg-white rounded-lg shadow p-6 hover:shadow-md transition border-l-4 border-blue-500"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{request.title}</h3>
                          <p className="text-gray-600 mt-1">{request.description}</p>
                          <p className="text-sm text-gray-500 mt-2">
                            Created: {request.createdAt?.toDate().toLocaleDateString()}
                          </p>
                          {request.contractorId && (() => {
                            const cached = contractorCache[request.contractorId];
                            const name = cached?.name || request.contractorName || request.contractorId;
                            const email = cached?.email || request.contractorEmail || '';
                            return (
                              <p className="text-xs text-blue-600 mt-1">
                                Contractor: {name}
                                {email && name !== email ? ` (${email})` : ''}
                              </p>
                            );
                          })()}
                          {request.contractorId && (() => {
                            const cached = contractorCache[request.contractorId];
                            const name = cached?.name || request.contractorName || request.contractorId;
                            const email = cached?.email || request.contractorEmail || '';
                            return (
                              <p className="text-xs text-blue-600 mt-1">
                                Contractor: {name}
                                {email && name !== email ? ` (${email})` : ''}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                              request.status
                            )}`}
                          >
                            {request.status.replace('_', ' ')}
                          </span>
                          <Link
                            to={`/maintenance/${request.id}`}
                            className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                            title="View details and chat"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            <span>Details</span>
                          </Link>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

