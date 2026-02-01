import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AdminPanel from './components/admin/AdminPanel';
import ScenariosPage from './components/ScenariosPage';
import ProspectResultPage from './components/ProspectResultPage';
import MonitoringPage from './components/MonitoringPage';

function App() {
  // Use state to track auth so React re-renders when it changes
  const [isAuth, setIsAuth] = useState(() => {
    return localStorage.getItem('auth_token') !== null;
  });

  useEffect(() => {
    // Listen for custom auth event (dispatched when token is saved)
    const handleAuthChange = () => {
      setIsAuth(localStorage.getItem('auth_token') !== null);
    };
    
    // Listen for custom event
    window.addEventListener('auth-changed', handleAuthChange);
    
    // Also listen for hash changes (when navigating)
    const handleHashChange = () => {
      setIsAuth(localStorage.getItem('auth_token') !== null);
    };
    window.addEventListener('hashchange', handleHashChange);
    
    // Check auth on mount
    setIsAuth(localStorage.getItem('auth_token') !== null);
    
    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const isAuthenticated = () => {
    return isAuth;
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated() ? <Navigate to="/dashboard" replace /> : <LandingPage />
          }
        />
        <Route
          path="/dashboard"
          element={
            isAuthenticated() ? <Dashboard /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/admin"
          element={
            isAuthenticated() ? <AdminPanel /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/scenarios"
          element={
            isAuthenticated() ? <ScenariosPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/prospect/:id"
          element={
            isAuthenticated() ? <ProspectResultPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/monitoring"
          element={
            isAuthenticated() ? <MonitoringPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/monitoring/account/:id"
          element={
            isAuthenticated() ? <MonitoringPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/monitoring/concentration/accounts/:ticker/:grade"
          element={
            isAuthenticated() ? <MonitoringPage /> : <Navigate to="/" replace />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
