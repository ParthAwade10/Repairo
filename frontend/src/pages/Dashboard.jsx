/**
 * Dashboard Page
 * Role-based dashboard routing
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../api/auth';
import TenantDashboard from './TenantDashboard';
import LandlordDashboard from './LandlordDashboard';
import ContractorDashboard from './ContractorDashboard';
import AdminDashboard from './AdminDashboard';

export default function Dashboard() {
  const { currentUser, userRole, loading } = useAuth();
  const navigate = useNavigate();
  const [localRole, setLocalRole] = useState(null);

  // Check localStorage directly as fallback
  useEffect(() => {
    if (currentUser && !userRole) {
      // Try multiple ways to get the role
      const roleKey = `userRole_${currentUser.uid}`;
      const storedRole = 
        localStorage.getItem(roleKey) || 
        sessionStorage.getItem(roleKey) ||
        localStorage.getItem('currentUserRole') ||
        sessionStorage.getItem('currentUserRole') ||
        localStorage.getItem('pendingRole') ||
        sessionStorage.getItem('pendingRole');
      
      if (storedRole) {
        console.log('✅ Found role in storage:', storedRole);
        setLocalRole(storedRole);
        // Also store it back for next time
        localStorage.setItem(roleKey, storedRole);
        localStorage.setItem('currentUserRole', storedRole);
      } else {
        console.warn('❌ No role found in storage for UID:', currentUser.uid);
        console.warn('Checked keys:', roleKey, 'currentUserRole', 'pendingRole');
        console.warn('All localStorage keys:', Object.keys(localStorage).filter(k => k.includes('Role') || k.includes('user')));
      }
    }
  }, [currentUser, userRole]);

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate('/login');
    }
  }, [currentUser, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return null; // Will redirect to login
  }

  // Use role from context or localStorage fallback
  const effectiveRole = userRole || localRole;

  // If user doesn't have a role yet, show a helpful message
  if (!effectiveRole) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Role Not Found</h2>
          <p className="text-gray-600 mb-4">
            Your account was created, but we couldn't load your role. This might be a permissions issue.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Check the browser console (F12) for error messages. You may need to:
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 mb-4">
            <li>Deploy Firestore rules: <code className="bg-gray-100 px-2 py-1 rounded">firebase deploy --only firestore:rules</code></li>
            <li>Or manually set your role using the script</li>
          </ol>
          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  switch (effectiveRole) {
    case 'tenant':
      return <TenantDashboard />;
    case 'landlord':
      return <LandlordDashboard />;
    case 'contractor':
      return <ContractorDashboard />;
    case 'admin':
      return <AdminDashboard />;
    default:
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Unknown role. Please contact support.</div>
        </div>
      );
  }
}

