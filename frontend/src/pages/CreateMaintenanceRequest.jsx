/**
 * Create Maintenance Request Page
 * Form to create a new maintenance request
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createMaintenanceRequest } from '../api/maintenance';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function CreateMaintenanceRequest() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [landlordId, setLandlordId] = useState('');
  const [role, setRole] = useState('');
  const [userName, setUserName] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingTenantData, setLoadingTenantData] = useState(true);

  // Load tenant's propertyId and landlordId from Firestore
  useEffect(() => {
    const loadTenantData = async () => {
      if (!currentUser) return;
      
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setRole(userData.role || '');
          const fullName = userData.firstName && userData.lastName
            ? `${userData.firstName} ${userData.lastName}`
            : userData.name || '';
          setUserName(fullName);
          if (userData.propertyId) {
            setPropertyId(userData.propertyId);
          }
          if (userData.landlordId) {
            setLandlordId(userData.landlordId);
          }
        }
      } catch (error) {
        console.warn('Could not load tenant property/landlord data:', error.message);
        // Continue anyway - user can still fill in manually
      } finally {
        setLoadingTenantData(false);
      }
    };

    loadTenantData();
  }, [currentUser]);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    setImages(files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate required fields
    if (!title.trim()) {
      setError('Title is required');
      setLoading(false);
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      setLoading(false);
      return;
    }

    try {
      // Landlords must select a property
      if (role === 'landlord' && !propertyId.trim()) {
        setError('Please provide a Property ID to create a request.');
        setLoading(false);
        return;
      }

      const requestData = {
        title: title.trim(),
        description: description.trim(),
        propertyId: propertyId || null,
        tenantId: role === 'tenant' ? currentUser.uid : null,
        landlordId: role === 'landlord' ? currentUser.uid : (landlordId || null),
        tenantName: role === 'tenant' ? userName : null,
        tenantEmail: role === 'tenant' ? currentUser.email : null,
        creatorId: currentUser.uid,
        creatorName: userName || currentUser.email,
        creatorEmail: currentUser.email,
      };

      await createMaintenanceRequest(requestData, images);
      // Keep user on dashboard for a consistent interface
      navigate('/dashboard');
    } catch (err) {
      console.error('Error creating request:', err);
      setError(err.message || 'Failed to create request. Make sure you are logged in and have a property assigned.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Maintenance Request</h2>

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              type="text"
              id="title"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="propertyId" className="block text-sm font-medium text-gray-700">
              Property ID (optional - auto-filled if available)
            </label>
            <input
              type="text"
              id="propertyId"
              disabled={loadingTenantData || !!propertyId}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder={loadingTenantData ? 'Loading...' : 'Property ID (optional)'}
            />
            {propertyId && (
              <p className="mt-1 text-sm text-green-600">✓ Auto-populated from your account</p>
            )}
          </div>

          <div>
            <label htmlFor="landlordId" className="block text-sm font-medium text-gray-700">
              Landlord ID (optional - auto-filled if available)
            </label>
            <input
              type="text"
              id="landlordId"
              disabled={loadingTenantData || !!landlordId}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              value={landlordId}
              onChange={(e) => setLandlordId(e.target.value)}
              placeholder={loadingTenantData ? 'Loading...' : 'Landlord ID (optional)'}
            />
            {landlordId && (
              <p className="mt-1 text-sm text-green-600">✓ Auto-populated from your account</p>
            )}
          </div>

          <div>
            <label htmlFor="images" className="block text-sm font-medium text-gray-700">
              Images (optional)
            </label>
            <input
              type="file"
              id="images"
              multiple
              accept="image/*"
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              onChange={handleImageChange}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Request'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

