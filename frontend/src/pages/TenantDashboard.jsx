/**
 * Tenant Dashboard
 * View and create maintenance requests
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTenantRequests, getPropertyRequests } from '../api/maintenance';
import { signOut } from '../api/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  subscribeToTenantInvites, 
  acceptInvite, 
  declineInvite 
} from '../api/invites';

export default function TenantDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [propertyRequests, setPropertyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [landlordId, setLandlordId] = useState(null);
  const [propertyId, setPropertyId] = useState(null);
  const [invites, setInvites] = useState([]);
  const [showInvites, setShowInvites] = useState(false);

  useEffect(() => {
    if (currentUser) {
      loadRequests();
      loadLandlordId();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.email) return;
    
    // Subscribe to real-time invites
    const unsubscribe = subscribeToTenantInvites(currentUser.email, (invitesList) => {
      setInvites(invitesList);
      if (invitesList.length > 0) {
        setShowInvites(true);
      }
    });
    
    return () => unsubscribe();
  }, [currentUser]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await acceptInvite(inviteId, currentUser.uid);
      // Reload landlord ID after accepting
      await loadLandlordId();
      alert('Invite accepted! You are now connected to your landlord.');
    } catch (error) {
      console.error('Error accepting invite:', error);
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
        }
        if (userData.propertyId) {
          setPropertyId(userData.propertyId);
          // Load all requests for this property
          loadPropertyRequests(userData.propertyId);
        }
      }
    } catch (error) {
      console.error('Error loading landlord ID:', error);
    }
  };

  const loadPropertyRequests = async (propId) => {
    try {
      const data = await getPropertyRequests(propId);
      // Filter out the tenant's own requests (already shown in requests)
      const otherRequests = data.filter(req => req.tenantId !== currentUser.uid);
      setPropertyRequests(otherRequests);
    } catch (error) {
      console.error('Error loading property requests:', error);
    }
  };

  const handleMessageLandlord = async () => {
    if (!landlordId) {
      alert('Landlord information not found. Please contact support.');
      return;
    }

    try {
      // Find or create a direct chat room with the landlord
      const roomsRef = collection(db, 'rooms');
      const q = query(
        roomsRef,
        where('members', 'array-contains', currentUser.uid)
      );
      const querySnapshot = await getDocs(q);
      
      // Look for a room that has both tenant and landlord (and no maintenance request)
      let directRoom = null;
      querySnapshot.forEach((doc) => {
        const roomData = doc.data();
        if (
          roomData.members.includes(landlordId) &&
          roomData.members.includes(currentUser.uid) &&
          roomData.members.length === 2 &&
          !roomData.maintenanceRequestId
        ) {
          directRoom = { id: doc.id, ...roomData };
        }
      });

      if (directRoom) {
        // Navigate to existing chat room
        navigate(`/chat/direct/${directRoom.id}`);
      } else {
        // Create a new direct chat room
        const { createChatRoom } = await import('../api/messaging');
        const roomId = await createChatRoom(
          `direct-${currentUser.uid}-${landlordId}`,
          [currentUser.uid, landlordId],
          null // No maintenance request ID for direct messages
        );
        navigate(`/chat/direct/${roomId}`);
      }
    } catch (error) {
      console.error('Error creating/finding chat room:', error);
      alert('Failed to open chat. Please try again.');
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'complete':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Repairo - Tenant Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleMessageLandlord}
                disabled={!landlordId}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md ${
                  landlordId
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                title={landlordId ? 'Message your landlord' : 'No landlord assigned yet'}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Message Landlord</span>
              </button>
              <Link
                to="/maintenance/create"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                New Request
              </Link>
              <button
                onClick={handleSignOut}
                className="text-gray-700 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Invites Section */}
          {invites.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-yellow-900">
                  You have {invites.length} pending invite{invites.length > 1 ? 's' : ''}
                </h3>
                <button
                  onClick={() => setShowInvites(!showInvites)}
                  className="text-yellow-700 hover:text-yellow-900 text-sm"
                >
                  {showInvites ? 'Hide' : 'Show'}
                </button>
              </div>
              {showInvites && (
                <div className="space-y-3 mt-4">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="bg-white rounded-lg p-4 border border-yellow-300"
                    >
                      <p className="text-sm text-gray-700 mb-2">
                        Invitation from landlord
                      </p>
                      {invite.propertyId && (
                        <p className="text-xs text-gray-500 mb-3">
                          Property ID: {invite.propertyId}
                        </p>
                      )}
                      <div className="flex gap-2">
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
              )}
            </div>
          )}

          <h2 className="text-2xl font-bold text-gray-900 mb-4">My Maintenance Requests</h2>

          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No maintenance requests yet. Create your first request!
            </div>
          ) : (
            <div className="grid gap-4 mb-8">
              {requests.map((request) => (
                <Link
                  key={request.id}
                  to={`/maintenance/${request.id}`}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-md transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{request.title}</h3>
                      <p className="text-gray-600 mt-1">{request.description}</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Created: {request.createdAt?.toDate().toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        request.status
                      )}`}
                    >
                      {request.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Property Requests Section */}
          {propertyId && propertyRequests.length > 0 && (
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Other Requests in My Property
              </h2>
              <div className="grid gap-4">
                {propertyRequests.map((request) => (
                  <Link
                    key={request.id}
                    to={`/maintenance/${request.id}`}
                    className="bg-white rounded-lg shadow p-6 hover:shadow-md transition border-l-4 border-blue-500"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{request.title}</h3>
                        <p className="text-gray-600 mt-1">{request.description}</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Created: {request.createdAt?.toDate().toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                          request.status
                        )}`}
                      >
                        {request.status.replace('_', ' ')}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

