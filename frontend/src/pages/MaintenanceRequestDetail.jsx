/**
 * Maintenance Request Detail Page
 * Shows full request details, progress bar, and chat access
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMaintenanceRequest, assignContractor, clearContractor } from '../api/maintenance';
import { getChatRoomByRequestId, createChatRoom, addMemberToRoom } from '../api/messaging';
import { getPropertyByPropertyId, getPropertyTenants } from '../api/properties';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { mockContractors } from '../api/mockContractors';

export default function MaintenanceRequestDetail() {
  const { requestId } = useParams();
  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [propertyInfo, setPropertyInfo] = useState(null);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [contractorInfo, setContractorInfo] = useState(null);
  const [landlordInfo, setLandlordInfo] = useState(null);
  const [suggestedContractors, setSuggestedContractors] = useState([]);
  const [areaContractors, setAreaContractors] = useState([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (requestId) {
      loadRequest();
    }
  }, [requestId]);

  const loadRequest = async () => {
    try {
      setLoading(true);
      const requestData = await getMaintenanceRequest(requestId);
      
      if (!requestData) {
        alert('Request not found');
        navigate('/dashboard');
        return;
      }

      setRequest(requestData);

      // Load property info
      if (requestData.propertyId) {
        try {
          const property = await getPropertyByPropertyId(requestData.propertyId);
          if (property) {
            setPropertyInfo(property);
            // Load all tenants for this property
            const tenants = await getPropertyTenants(property.id);
            setPropertyTenants(tenants);
          }
        } catch (error) {
          console.error('Error loading property:', error);
        }
      }

      // Load landlord info
      if (requestData.landlordId) {
        try {
          const landlordDoc = await getDoc(doc(db, 'users', requestData.landlordId));
          if (landlordDoc.exists()) {
            setLandlordInfo(landlordDoc.data());
          }
        } catch (error) {
          console.error('Error loading landlord:', error);
        }
      }

      // Load contractor info
      if (requestData.contractorId) {
        try {
          const contractorDoc = await getDoc(doc(db, 'users', requestData.contractorId));
          if (contractorDoc.exists()) {
            setContractorInfo(contractorDoc.data());
          }
        } catch (error) {
          console.error('Error loading contractor:', error);
        }
      }
    } catch (error) {
      console.error('Error loading request:', error);
      alert('Failed to load request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Compute top contractors (best value) for the area
  useEffect(() => {
    // Simple service classification
    const serviceKey = (() => {
      const t = (request?.title || '').toLowerCase();
      if (t.includes('toilet') || t.includes('sink') || t.includes('plumb')) return 'plumbing';
      if (t.includes('light') || t.includes('elect')) return 'electrical';
      return 'general';
    })();

    // Filter contractors by area match when possible; otherwise keep all
    const inArea = propertyInfo
      ? mockContractors.filter((c) => {
          const city = (propertyInfo.city || '').toLowerCase();
          const addr = (propertyInfo.address || '').toLowerCase();
          const county = (propertyInfo.county || '').toLowerCase();
          const areaStr = `${city} ${addr} ${county}`;
          return c.areas.some((a) => areaStr.includes(a.toLowerCase()));
        })
      : mockContractors;

    const candidates = inArea.length > 0 ? inArea : mockContractors;

    // Price normalization
    const prices = candidates.map((c) => c.prices?.[serviceKey] || c.prices?.general || 999);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const normPrice = (p) => {
      if (maxPrice === minPrice) return 1;
      return (maxPrice - p) / (maxPrice - minPrice); // lower price -> higher score
    };

    const scored = candidates.map((c) => {
      const price = c.prices?.[serviceKey] || c.prices?.general || 999;
      const priceScore = normPrice(price);
      const ratingScore = (c.rating || 0) / 5;
      const valueScore = ratingScore * 0.6 + priceScore * 0.4; // weight rating a bit more
      return { ...c, price, valueScore };
    });

    scored.sort((a, b) => b.valueScore - a.valueScore);
    setSuggestedContractors(scored.slice(0, 3));
    setAreaContractors(scored);
  }, [propertyInfo, request?.title]);

  const handleOpenChat = async () => {
    if (!request) return;

    try {
      // Find or create chat room for this request
      let room = await getChatRoomByRequestId(requestId);
      
      if (!room) {
        // Create chat room with all property tenants, landlord, and contractor
        const members = [request.tenantId, request.landlordId];
        
        // Add all property tenants
        if (propertyTenants.length > 0) {
          propertyTenants.forEach(tenant => {
            if (!members.includes(tenant.id)) {
              members.push(tenant.id);
            }
          });
        }
        
        // Add contractor if assigned
        if (request.contractorId && !members.includes(request.contractorId)) {
          members.push(request.contractorId);
        }

        const roomId = await createChatRoom(requestId, members, requestId);
        room = { id: roomId };
      } else {
        // Ensure all property tenants are in the room
        if (propertyTenants.length > 0) {
          for (const tenant of propertyTenants) {
            if (!room.members.includes(tenant.id)) {
              await addMemberToRoom(room.id, tenant.id);
            }
          }
        }
        
        // Ensure contractor is in room if assigned
        if (request.contractorId && !room.members.includes(request.contractorId)) {
          await addMemberToRoom(room.id, request.contractorId);
        }
      }

      navigate(`/maintenance/${requestId}/chat`);
    } catch (error) {
      console.error('Error opening chat:', error);
      alert('Failed to open chat: ' + error.message);
    }
  };

  const handleAssignMockContractor = async (contractorId) => {
    if (!request || assigning) return;
    const contractor = mockContractors.find((c) => c.id === contractorId);
    if (!contractor) {
      alert('Contractor not found');
      return;
    }
    setAssigning(true);
    try {
      await assignContractor(requestId, contractor.id, { name: contractor.name, email: contractor.email });
      setRequest((prev) =>
        prev
          ? {
              ...prev,
              contractorId: contractor.id,
              contractorName: contractor.name,
              contractorEmail: contractor.email,
            }
          : prev
      );
      setContractorInfo({
        email: contractor.email,
        name: contractor.name,
        firstName: contractor.name?.split(' ')?.[0] || '',
        lastName: contractor.name?.split(' ')?.slice(1).join(' ') || '',
      });
      alert('Contractor assigned successfully');
    } catch (error) {
      console.error('Error assigning contractor:', error);
      alert('Failed to assign contractor: ' + (error.message || 'Unknown error'));
    } finally {
      setAssigning(false);
    }
  };

  // Start a direct chat with a contractor (for landlord pre-assignment Q&A)
  const handleContactContractor = async (contractorId) => {
    if (!currentUser) return;
    try {
      // Direct chat uses maintenanceRequestId = null so it's a 1:1 room
      const roomId = await createChatRoom(
        `direct-${currentUser.uid}-${contractorId}`,
        [currentUser.uid, contractorId],
        null
      );

      // small delay to ensure room is available to chat page
      setTimeout(() => {
        navigate(`/chat/direct/${roomId}`);
      }, 200);
    } catch (error) {
      console.error('Error contacting contractor:', error);
      alert('Failed to start chat with contractor: ' + (error.message || 'Unknown error'));
    }
  };

  const handleRemoveContractor = async () => {
    if (!request || assigning || !request.contractorId) return;
    setAssigning(true);
    try {
      await clearContractor(requestId);
      setRequest((prev) =>
        prev ? { ...prev, contractorId: null, contractorName: null, contractorEmail: null, status: 'open' } : prev
      );
      setContractorInfo(null);
      alert('Contractor removed from this request.');
    } catch (error) {
      console.error('Error removing contractor:', error);
      alert('Failed to remove contractor: ' + (error.message || 'Unknown error'));
    } finally {
      setAssigning(false);
    }
  };

  const getProgressSteps = () => {
    const steps = [
      { key: 'open', label: 'Awaiting Review from Landlord', status: 'pending' },
      { key: 'in_progress', label: 'Contractor is Working on This Request', status: 'pending' },
      { key: 'complete', label: 'Work Order Completed', status: 'pending' },
    ];

    if (!request) return steps;

    const currentStatus = request.status;
    let currentIndex = -1;

    switch (currentStatus) {
      case 'open':
        currentIndex = 0;
        break;
      case 'in_progress':
        currentIndex = 1;
        break;
      case 'complete':
        currentIndex = 2;
        break;
    }

    return steps.map((step, index) => {
      // If status is complete, all steps should be completed
      if (currentStatus === 'complete') {
        return { ...step, status: 'completed' };
      }
      // Otherwise, mark steps before current as completed, current as current, and after as pending
      if (index < currentIndex) {
        return { ...step, status: 'completed' };
      } else if (index === currentIndex) {
        return { ...step, status: 'current' };
      } else {
        return { ...step, status: 'pending' };
      }
    });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading request...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Request not found</div>
      </div>
    );
  }

  const progressSteps = getProgressSteps();

  // Derived contractor display
  const contractorName = contractorInfo
    ? (contractorInfo.firstName && contractorInfo.lastName
        ? `${contractorInfo.firstName} ${contractorInfo.lastName}`
        : contractorInfo.name || contractorInfo.email || null)
    : (request.contractorName || null);
  const contractorEmail = contractorInfo?.email || request.contractorEmail || null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100">
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Maintenance Request</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleOpenChat}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                title="Open group chat for this request"
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
                <span>Message</span>
              </button>
              <Link
                to="/dashboard"
                className="text-gray-700 hover:text-gray-900 px-4 py-2 rounded-md hover:bg-gray-100"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Request Header */}
          <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-gray-900">{request.title}</h2>
                <p className="text-gray-700 mt-2 text-lg">{request.description}</p>
              </div>
              <span
                className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(
                  request.status
                )}`}
              >
                {request.status.replace('_', ' ')}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Request Progress</h3>
              <div className="relative">
                {/* Progress Line */}
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200">
                  <div
                    className={`h-full transition-all duration-300 ${
                      request.status === 'complete' ? 'bg-green-500' : 'bg-blue-600'
                    }`}
                    style={{
                      width: request.status === 'complete' 
                        ? '100%' 
                        : `${(progressSteps.findIndex(s => s.status === 'current') + 1) * 33.33}%`,
                    }}
                  />
                </div>

                {/* Steps */}
                <div className="relative flex justify-between">
                  {progressSteps.map((step, index) => (
                    <div key={step.key} className="flex flex-col items-center flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition ${
                          step.status === 'completed'
                            ? 'bg-green-500 border-green-500 text-white'
                            : step.status === 'current'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-400'
                        }`}
                      >
                        {step.status === 'completed' ? (
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <span className="text-sm font-bold">{index + 1}</span>
                        )}
                      </div>
                      <p
                        className={`mt-2 text-xs text-center ${
                          step.status === 'current'
                            ? 'text-blue-600 font-semibold'
                            : step.status === 'completed'
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Request Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Property Information */}
              {propertyInfo && (
                <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Property Information
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Address</p>
                      <p className="text-gray-900">
                        {propertyInfo.address ||
                          [propertyInfo.addressLine1, propertyInfo.city, propertyInfo.state, propertyInfo.zipcode]
                            .filter(Boolean)
                            .join(', ')}
                      </p>
                    </div>
                    {propertyInfo.propertyId && (
                      <div>
                        <p className="text-sm text-gray-500">Property ID</p>
                        <p className="text-gray-900 font-mono text-sm">{propertyInfo.propertyId}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* People Involved */}
              <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  People Involved
                </h3>
                <div className="space-y-4">
                  {landlordInfo && (
                    <div>
                      <p className="text-sm text-gray-500">Landlord</p>
                      <p className="text-gray-900">{landlordInfo.email || 'N/A'}</p>
                      {landlordInfo.name && (
                        <p className="text-sm text-gray-600">{landlordInfo.name}</p>
                      )}
                    </div>
                  )}
                  {(contractorInfo || request.contractorId) && (
                    <div>
                      <p className="text-sm text-gray-500">Contractor</p>
                      <p className="text-gray-900">{contractorEmail || 'N/A'}</p>
                      {contractorName && contractorName !== contractorEmail && (
                        <p className="text-sm text-gray-600">{contractorName}</p>
                      )}
                      {userRole === 'landlord' && (
                        <button
                          onClick={handleRemoveContractor}
                          disabled={assigning}
                          className="mt-2 inline-flex items-center justify-center px-3 py-1 rounded-md bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
                        >
                          Remove Contractor
                        </button>
                      )}
                    </div>
                  )}
                  {!request.contractorId && (
                    <div>
                      <p className="text-sm text-gray-500">Contractor</p>
                      <p className="text-gray-500 italic">Not yet assigned</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Suggested Contractors */}
              <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Suggested Contractors (Top 3 Value)
                  </h3>
                  {userRole === 'landlord' && (
                    <span className="text-xs text-gray-500">Ranking: rating + fair pricing</span>
                  )}
                </div>
                {suggestedContractors.length === 0 ? (
                  <p className="text-gray-500 text-sm">No suggested contractors found.</p>
                ) : (
                  <div className="space-y-3">
                    {suggestedContractors.map((c) => (
                      <div key={c.id} className="border border-gray-200 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 overflow-hidden">
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900">{c.name}</p>
                            <p className="text-sm text-gray-600 break-words break-all">{c.email}</p>
                            <p className="text-sm text-gray-600 break-words break-all">{c.phone}</p>
                            <p className="text-xs text-gray-500">
                              Areas: {c.areas.join(', ')}
                            </p>
                          </div>
                          <div className="flex flex-col md:items-end gap-1 text-sm text-gray-800 min-w-[150px]">
                            <div className="flex items-center md:justify-end gap-1 font-semibold">
                              <span>{c.rating.toFixed(1)}</span>
                              <span className="text-amber-500">★</span>
                            </div>
                            <div className="text-xs text-gray-500">{c.reviewCount} reviews</div>
                            {userRole === 'landlord' && (
                              <div className="text-xs text-gray-600">
                                Est. price: ${c.price}
                              </div>
                            )}
                            {userRole === 'landlord' && (
                              <div className="flex gap-2 mt-1">
                                <button
                                  onClick={() => handleContactContractor(c.id)}
                                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                                >
                                  Contact
                                </button>
                                <button
                                  onClick={() => handleAssignMockContractor(c.id)}
                                  disabled={assigning}
                                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:bg-gray-300 disabled:opacity-50 shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                                >
                                  Assign
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {userRole === 'landlord' && (
                          <p className="text-xs text-gray-500 mt-1">
                            Value score: {c.valueScore.toFixed(2)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contractors in Area */}
              <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Contractors in This Area
                  </h3>
                </div>
                {areaContractors.length === 0 ? (
                  <p className="text-gray-500 text-sm">No contractors found in this area.</p>
                ) : (
                  <div className="space-y-3">
                    {areaContractors.map((c) => (
                      <div key={c.id} className="border border-gray-200 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 overflow-hidden">
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900">{c.name}</p>
                            <p className="text-sm text-gray-600 break-words break-all">{c.email}</p>
                            <p className="text-sm text-gray-600 break-words break-all">{c.phone}</p>
                            <p className="text-xs text-gray-500">Areas: {c.areas.join(', ')}</p>
                          </div>
                          <div className="flex flex-col md:items-end gap-1 text-sm text-gray-800 min-w-[150px]">
                            <div className="flex items-center md:justify-end gap-1 font-semibold">
                              <span>{c.rating.toFixed(1)}</span>
                              <span className="text-amber-500">★</span>
                            </div>
                            <div className="text-xs text-gray-500">{c.reviewCount} reviews</div>
                            {userRole === 'landlord' && (
                              <>
                                <div className="text-xs text-gray-600">
                                  Est. price: ${c.price ?? c.prices?.general ?? '—'}
                                </div>
                                <div className="flex gap-2 mt-1">
                                  <button
                                    onClick={() => handleContactContractor(c.id)}
                                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                                  >
                                    Contact
                                  </button>
                                  <button
                                    onClick={() => handleAssignMockContractor(c.id)}
                                    disabled={assigning}
                                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:bg-gray-300 disabled:opacity-50 shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                                  >
                                    Assign
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Images */}
              {request.images && request.images.length > 0 && (
                <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Images
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {request.images.map((imageUrl, index) => (
                      <img
                        key={index}
                        src={imageUrl}
                        alt={`Request image ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Request Metadata */}
              <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Request Details
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="text-gray-900">
                      {request.createdAt?.toDate
                        ? request.createdAt.toDate().toLocaleString()
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Last Updated</p>
                    <p className="text-gray-900">
                      {request.updatedAt?.toDate
                        ? request.updatedAt.toDate().toLocaleString()
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Request ID</p>
                    <p className="text-gray-900 font-mono text-xs">{request.id}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

