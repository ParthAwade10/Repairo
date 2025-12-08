/**
 * Landlord Dashboard
 * View properties, tenants, and maintenance requests
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
} from '../api/properties';
import { doc, getDoc, getDocs, query, where, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function LandlordDashboard() {
  const { currentUser } = useAuth();
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [propertyTenants, setPropertyTenants] = useState([]);
  const [propertyRequests, setPropertyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [landlordId, setLandlordId] = useState(null);
  
  // Add Property State
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [addingProperty, setAddingProperty] = useState(false);
  
  // Add Tenant State
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [tenantEmail, setTenantEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadLandlordId();
      loadProperties();
    }
  }, [currentUser]);

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
    } catch (error) {
      console.error('Error loading properties:', error);
      console.error('Error details:', error.code, error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProperty = async (e) => {
    e.preventDefault();
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !zipcode.trim()) {
      alert('Please fill in all address fields');
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
        },
        currentUser.email // Pass email for user document creation if needed
      );
      console.log('Property created successfully:', propertyId);
      setAddressLine1('');
      setCity('');
      setState('');
      setZipcode('');
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
    
    // Load tenants for this property
    try {
      const tenants = await getPropertyTenants(property.id);
      setPropertyTenants(tenants);
    } catch (error) {
      console.error('Error loading tenants:', error);
      setPropertyTenants([]);
    }
    
    // Load maintenance requests for this property
    try {
      const requests = await getPropertyMaintenanceRequests(property.propertyId);
      setPropertyRequests(requests);
    } catch (error) {
      console.error('Error loading property requests:', error);
      setPropertyRequests([]);
    }
  };

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
    } catch (error) {
      setInviteError(error.message || 'Failed to add tenant');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleAssignContractor = async (requestId, contractorId) => {
    try {
      await assignContractor(requestId, contractorId);
      if (selectedProperty) {
        await handleSelectProperty(selectedProperty);
      }
    } catch (error) {
      console.error('Error assigning contractor:', error);
      alert('Failed to assign contractor');
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
              <h1 className="text-xl font-bold text-gray-900">Repairo - Landlord Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              {landlordId && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Landlord ID:</span> {landlordId.substring(0, 8)}...
                </div>
              )}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Properties List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Properties</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={loadProperties}
                      className="bg-gray-600 text-white px-3 py-2 rounded-md hover:bg-gray-700 text-sm"
                      title="Refresh properties list"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => setShowAddProperty(!showAddProperty)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                    >
                      + Add Property
                    </button>
                  </div>
                </div>

                {showAddProperty && (
                  <form onSubmit={handleAddProperty} className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={addingProperty}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
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
                        <button
                          key={property.id}
                          onClick={() => handleSelectProperty(property)}
                          className={`w-full text-left p-4 rounded-lg border-2 transition ${
                            selectedProperty?.id === property.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-semibold text-gray-900">{displayAddress}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            Property ID: {property.propertyId}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {property.tenantIds?.length || 0} tenant(s)
                          </div>
                        </button>
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
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">
                          {selectedProperty.address || 
                            [selectedProperty.addressLine1, selectedProperty.city, selectedProperty.state, selectedProperty.zipcode]
                              .filter(Boolean)
                              .join(', ')}
                        </h2>
                        {selectedProperty.addressLine1 && (
                          <div className="text-sm text-gray-600 mt-1">
                            {selectedProperty.addressLine1}
                            {selectedProperty.city && `, ${selectedProperty.city}`}
                            {selectedProperty.state && `, ${selectedProperty.state}`}
                            {selectedProperty.zipcode && ` ${selectedProperty.zipcode}`}
                          </div>
                        )}
                        <p className="text-sm text-gray-500 mt-1">Property ID: {selectedProperty.propertyId}</p>
                      </div>
                      <button
                        onClick={() => setShowAddTenant(!showAddTenant)}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
                      >
                        + Add Tenant
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
                          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-3">
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
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
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
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Tenants</h3>
                      {propertyTenants.length === 0 ? (
                        <p className="text-gray-500 text-sm">No tenants added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {propertyTenants.map((tenant) => (
                            <div
                              key={tenant.id}
                              className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <div className="font-medium text-gray-900">{tenant.email}</div>
                              {tenant.name && (
                                <div className="text-sm text-gray-500">{tenant.name}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Maintenance Requests */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Requests</h3>
                    {propertyRequests.length === 0 ? (
                      <p className="text-gray-500">No maintenance requests for this property.</p>
                    ) : (
                      <div className="space-y-4">
                        {propertyRequests.map((request) => (
                          <div
                            key={request.id}
                            className="border border-gray-200 rounded-lg p-4"
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
                                  <input
                                    type="text"
                                    placeholder="Contractor ID"
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        handleAssignContractor(request.id, e.target.value);
                                        e.target.value = '';
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => handleStatusChange(request.id, 'in_progress')}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                                  >
                                    Start
                                  </button>
                                </>
                              )}
                              {request.status === 'in_progress' && (
                                <button
                                  onClick={() => handleStatusChange(request.id, 'complete')}
                                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
                                >
                                  Mark Complete
                                </button>
                              )}
                              <Link
                                to={`/maintenance/${request.id}/chat`}
                                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm"
                              >
                                Chat
                              </Link>
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
