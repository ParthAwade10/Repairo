/**
 * Admin Dashboard
 * Full access to all features
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../api/auth';

export default function AdminDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Repairo - Admin Dashboard</h1>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Admin Panel</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">
              Welcome, {currentUser?.email}. Admin features coming soon.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

