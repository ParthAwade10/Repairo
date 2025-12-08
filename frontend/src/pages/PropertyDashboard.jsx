/**
 * Property Dashboard for Tenants
 * View property details, maintenance requests, and messaging options
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPropertyRequests } from '../api/maintenance';
import { getPropertyByPropertyId, getPropertyTenants } from '../api/properties';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { signOut } from '../api/auth';

export default function PropertyDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [propertyInfo, setPropertyInfo] = useState(null);
  const [landlordInfo, setLandlordInfo] = useState(null);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [propertyRequests, setPropertyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyId, setPropertyId] = useState(null);
  const [landlordId, setLandlordId] = useState(null);

  useEffect(() => {
    if (currentUser) {
      loadPropertyData();
    }
  }, [currentUser]);

  const loadPropertyData = async () => {
    try {
      setLoading(true);
      // Get propertyId and landlordId from user document
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const propId = userData.propertyId;
        const llId = userData.landlordId;
        
        if (!propId) {
          // No property assigned, show message but don't redirect (to avoid loops)
          console.log('No property assigned');
          setError('No property assigned. Please accept a property invitation from your landlord.');
          setLoading(false);
          return;
        }
        
        setPropertyId(propId);
        setLandlordId(llId);
        
        // Load property info - retry if it fails (might be a timing issue)
        let property = null;
        let retries = 0;
        const maxRetries = 3;
        
        while (!property && retries < maxRetries) {
          try {
            const { getPropertyByPropertyId } = await import('../api/properties');
            property = await getPropertyByPropertyId(propId);
            if (property) {
              console.log('Property loaded:', property);
              setPropertyInfo(property);
              // Load all requests for this property
              loadPropertyRequests(propId);
              // Load tenants for this property
              loadPropertyTenants(property.id);
              break;
            } else if (retries < maxRetries - 1) {
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
              retries++;
            } else {
              console.error('Property not found for ID after retries:', propId);
              setError('Property not found. The property may not exist or you may not have access. Please contact support.');
            }
          } catch (error) {
            console.error(`Error loading property (attempt ${retries + 1}):`, error);
            if (retries < maxRetries - 1) {
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
              retries++;
            } else {
              setError('Error loading property: ' + error.message + '. Please try refreshing the page.');
            }
          }
        }
        
        // Load landlord info
        if (llId) {
          try {
            const landlordDocRef = doc(db, 'users', llId);
            const landlordDoc = await getDoc(landlordDocRef);
            if (landlordDoc.exists()) {
              setLandlordInfo(landlordDoc.data());
            } else {
              console.warn('Landlord document not found for ID:', llId);
            }
          } catch (error) {
            console.error('Error loading landlord info:', error);
          }
        }
      } else {
        console.error('User document does not exist');
        setError('User profile not found. Please contact support.');
      }
    } catch (error) {
      console.error('Error loading property data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPropertyRequests = async (propId) => {
    try {
      const data = await getPropertyRequests(propId);
      setPropertyRequests(data);
    } catch (error) {
      console.error('Error loading property requests:', error);
    }
  };

  const loadPropertyTenants = async (propertyDocId) => {
    try {
      const tenants = await getPropertyTenants(propertyDocId);
      // Filter out current user
      setPropertyTenants(tenants.filter(t => t.id !== currentUser.uid));
    } catch (error) {
      console.error('Error loading property tenants:', error);
    }
  };

  const handleMessageLandlord = async () => {
    if (!landlordId) {
      alert('Landlord information not found.');
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
        navigate(`/chat/direct/${directRoom.id}`);
      } else {
        // Create new direct chat room
        const { createChatRoom } = await import('../api/messaging');
        const roomId = await createChatRoom(
          `direct_${currentUser.uid}_${landlordId}`,
          [currentUser.uid, landlordId],
          null
        );
        navigate(`/chat/direct/${roomId}`);
      }
    } catch (error) {
      console.error('Error opening chat with landlord:', error);
      alert('Failed to open chat: ' + error.message);
    }
  };

  const handleMessageRoommates = async () => {
    if (propertyTenants.length === 0) {
      alert('No other tenants in this property.');
      return;
    }

    // Create a group chat with all property tenants and landlord
    try {
      const members = [currentUser.uid, ...propertyTenants.map(t => t.id)];
      if (landlordId && !members.includes(landlordId)) {
        members.push(landlordId);
      }
      
      const { createChatRoom } = await import('../api/messaging');
      const roomId = await createChatRoom(
        `property_${propertyId}_group`,
        members,
        null
      );
      navigate(`/chat/direct/${roomId}`);
    } catch (error) {
      console.error('Error creating group chat:', error);
      alert('Failed to create group chat: ' + error.message);
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading property...</div>
      </div>
    );
  }

  if (!propertyInfo && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          {error ? (
            <>
              <p className="text-lg mb-4 text-red-600">{error}</p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    // Force navigation to dashboard without redirect loop
                    window.location.href = '/dashboard';
                  }}
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  Go to Dashboard
                </button>
                <p className="text-sm text-gray-500">
                  If you're stuck, try refreshing the page or signing out.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-lg mb-4">No property assigned.</p>
              <p className="text-sm text-gray-600 mb-4">
                Please accept a property invitation from your landlord to access the property dashboard.
              </p>
              <button
                onClick={() => {
                  window.location.href = '/dashboard';
                }}
                className="text-blue-600 hover:text-blue-700 underline"
              >
                Go to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">My Property</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/profile"
                className="text-gray-700 hover:text-gray-900 px-4 py-2 rounded-md hover:bg-gray-100"
              >
                Profile
              </Link>
              <button
                onClick={async () => {
                  await signOut();
                }}
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
          {/* Property Information */}
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Property Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <button
                      onClick={handleMessageLandlord}
                      className="mt-3 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
                    >
                      Message Landlord
                    </button>
                  </>
                ) : landlordId ? (
                  <>
                    <p className="text-sm text-gray-500 italic">Loading landlord information...</p>
                    <button
                      onClick={handleMessageLandlord}
                      disabled
                      className="mt-3 bg-gray-300 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed text-sm"
                    >
                      Message Landlord
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-500">No landlord assigned</p>
                    <button
                      onClick={handleMessageLandlord}
                      disabled
                      className="mt-3 bg-gray-300 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed text-sm"
                    >
                      Message Landlord
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Roommates Section */}
          {propertyTenants.length > 0 && (
            <div className="mb-6 bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Roommates</h2>
                <button
                  onClick={handleMessageRoommates}
                  className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm"
                >
                  Message All Roommates
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {propertyTenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <p className="font-medium text-gray-900">
                      {tenant.firstName && tenant.lastName
                        ? `${tenant.firstName} ${tenant.lastName}`
                        : tenant.name || tenant.email}
                    </p>
                    {tenant.email && (
                      <p className="text-sm text-gray-600">{tenant.email}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Request Button - Under Property Info */}
          <div className="mb-6">
            <Link
              to="/maintenance/create"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-medium"
            >
              + Create New Maintenance Request
            </Link>
          </div>

          {/* Maintenance Requests */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Maintenance Requests</h2>
            
            {propertyRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No maintenance requests yet. Create your first request!
              </p>
            ) : (
              <div className="grid gap-4">
                {propertyRequests.map((request) => {
                  const isMyRequest = request.tenantId === currentUser.uid;
                  return (
                    <Link
                      key={request.id}
                      to={`/maintenance/${request.id}`}
                      className={`block p-4 border rounded-lg hover:shadow-md transition ${
                        isMyRequest ? 'border-green-500 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {request.title}
                            </h3>
                            {isMyRequest && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                My Request
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 mt-1">{request.description}</p>
                          <p className="text-sm text-gray-500 mt-2">
                            Created: {request.createdAt?.toDate().toLocaleDateString()}
                          </p>
                          {request.contractorId && (
                            <p className="text-xs text-blue-600 mt-1">
                              ✓ Contractor assigned
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
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/maintenance/${request.id}`);
                            }}
                            className="text-purple-600 hover:text-purple-700 text-sm flex items-center gap-1"
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
                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                              />
                            </svg>
                            View
                          </button>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

