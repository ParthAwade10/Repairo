/**
 * Main App Component
 * Sets up routing and authentication context
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import CreateMaintenanceRequest from './pages/CreateMaintenanceRequest';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import MaintenanceRequestDetail from './pages/MaintenanceRequestDetail';
import PropertyDashboard from './pages/PropertyDashboard';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance/create"
            element={
              <ProtectedRoute requiredRoles={['tenant']}>
                <CreateMaintenanceRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance/:requestId"
            element={
              <ProtectedRoute>
                <MaintenanceRequestDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance/:requestId/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/direct/:roomId"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/property"
            element={
              <ProtectedRoute requiredRoles={['tenant']}>
                <PropertyDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

