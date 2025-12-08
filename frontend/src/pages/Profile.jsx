/**
 * Profile Page
 * View and edit user profile information
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getPropertyByPropertyId } from '../api/properties';

export default function Profile() {
  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [propertyInfo, setPropertyInfo] = useState(null);
  const [landlordInfo, setLandlordInfo] = useState(null);
  
  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadProfile();
    }
  }, [currentUser]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setProfile(userData);
        // Split name into first and last
        if (userData.name) {
          const nameParts = userData.name.split(' ');
          setFirstName(nameParts[0] || '');
          setLastName(nameParts.slice(1).join(' ') || '');
        } else if (userData.firstName || userData.lastName) {
          setFirstName(userData.firstName || '');
          setLastName(userData.lastName || '');
        } else {
          setFirstName('');
          setLastName('');
        }
        setPhone(userData.phone || '');
        
        // Load property info for tenants
        if (userRole === 'tenant' && userData.propertyId) {
          try {
            const property = await getPropertyByPropertyId(userData.propertyId);
            if (property) {
              setPropertyInfo(property);
            }
          } catch (error) {
            console.error('Error loading property info:', error);
          }
        }
        
        // Load landlord info for tenants
        if (userRole === 'tenant' && userData.landlordId) {
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
      } else {
        // Create basic profile if it doesn't exist
        setProfile({
          email: currentUser.email,
          role: userRole,
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    // Validate required fields
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required');
      setSaving(false);
      return;
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const updates = {
        name: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        updatedAt: new Date(),
      };

      // Remove null values
      Object.keys(updates).forEach(key => {
        if (updates[key] === null) {
          delete updates[key];
        }
      });

      await updateDoc(userDocRef, updates);
      setSuccess('Profile updated successfully!');
      await loadProfile();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">My Profile</h1>
            </div>
            <div className="flex items-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-700 hover:text-gray-900 px-4 py-2"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Information */}
            <div className="lg:col-span-2">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Information</h2>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
                    {success}
                  </div>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                      value={profile?.email || currentUser?.email || ''}
                    />
                    <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
                  </div>

                  <div>
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      Role
                    </label>
                    <input
                      type="text"
                      id="role"
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 cursor-not-allowed capitalize"
                      value={userRole || profile?.role || ''}
                    />
                    <p className="mt-1 text-xs text-gray-500">Role cannot be changed</p>
                  </div>

                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter your first name"
                    />
                  </div>

                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Enter your last name"
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div>
                    <label htmlFor="userId" className="block text-sm font-medium text-gray-700">
                      User ID
                    </label>
                    <input
                      type="text"
                      id="userId"
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 cursor-not-allowed font-mono text-xs"
                      value={currentUser?.uid || ''}
                    />
                    <p className="mt-1 text-xs text-gray-500">Your unique user identifier</p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Additional Information Sidebar */}
            <div className="lg:col-span-1">
              <div className="space-y-6">
                {/* Property Info (for tenants) */}
                {userRole === 'tenant' && propertyInfo && (
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">My Property</h3>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-gray-500">Address</p>
                        <p className="text-gray-900 font-medium">
                          {propertyInfo.address || 
                            [propertyInfo.addressLine1, propertyInfo.city, propertyInfo.state, propertyInfo.zipcode]
                              .filter(Boolean)
                              .join(', ')}
                        </p>
                      </div>
                      {propertyInfo.propertyId && (
                        <div>
                          <p className="text-sm text-gray-500">Property ID</p>
                          <p className="text-gray-900 font-mono text-xs">{propertyInfo.propertyId}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Landlord Info (for tenants) */}
                {userRole === 'tenant' && landlordInfo && (
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">My Landlord</h3>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="text-gray-900">{landlordInfo.email || 'N/A'}</p>
                      </div>
                      {landlordInfo.name && (
                        <div>
                          <p className="text-sm text-gray-500">Name</p>
                          <p className="text-gray-900">{landlordInfo.name}</p>
                        </div>
                      )}
                      {landlordInfo.phone && (
                        <div>
                          <p className="text-sm text-gray-500">Phone</p>
                          <p className="text-gray-900">{landlordInfo.phone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Account Stats */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Account Created</p>
                      <p className="text-gray-900">
                        {profile?.createdAt 
                          ? (profile.createdAt.toDate ? profile.createdAt.toDate().toLocaleDateString() : new Date(profile.createdAt).toLocaleDateString())
                          : 'N/A'}
                      </p>
                    </div>
                    {profile?.updatedAt && (
                      <div>
                        <p className="text-sm text-gray-500">Last Updated</p>
                        <p className="text-gray-900">
                          {profile.updatedAt.toDate 
                            ? profile.updatedAt.toDate().toLocaleDateString()
                            : new Date(profile.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
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

