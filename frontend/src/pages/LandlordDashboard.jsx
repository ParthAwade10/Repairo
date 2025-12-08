/**
 * Landlord Dashboard
 * View all requests, assign contractors, update status
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLandlordRequests, assignContractor, updateRequestStatus } from '../api/maintenance';
import { signOut } from '../api/auth';

export default function LandlordDashboard() {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) {
      loadRequests();
    }
  }, [currentUser]);

  const loadRequests = async () => {
    try {
      const data = await getLandlordRequests(currentUser.uid);
      setRequests(data);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignContractor = async (requestId, contractorId) => {
    try {
      await assignContractor(requestId, contractorId);
      await loadRequests();
    } catch (error) {
      console.error('Error assigning contractor:', error);
      alert('Failed to assign contractor');
    }
  };

  const handleStatusChange = async (requestId, newStatus) => {
    try {
      await updateRequestStatus(requestId, newStatus);
      await loadRequests();
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
            <div className="flex items-center">
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">All Maintenance Requests</h2>

          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No maintenance requests yet.</div>
          ) : (
            <div className="grid gap-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="bg-white rounded-lg shadow p-6"
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
      </main>
    </div>
  );
}

