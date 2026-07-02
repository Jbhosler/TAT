import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import AdminPanel from './components/admin/AdminPanel';
import ScenariosPage from './components/ScenariosPage';
import ProspectResultPage from './components/ProspectResultPage';
import MonitoringPage from './components/MonitoringPage';
import AcceptTokenPage from './components/auth/AcceptTokenPage';

const parseJwtPayload = (token: string): any | null => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const hasValidToken = (): boolean => {
  const token = localStorage.getItem('auth_token');
  if (!token) return false;
  if (token === 'authenticated') return true;
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') {
    return false;
  }
  return payload.exp * 1000 > Date.now();
};

function App() {
  // Use state to track auth so React re-renders when it changes
  const [isAuth, setIsAuth] = useState(() => hasValidToken());

  useEffect(() => {
    // Listen for custom auth event (dispatched when token is saved)
    const handleAuthChange = () => {
      setIsAuth(hasValidToken());
    };
    
    // Listen for custom event
    window.addEventListener('auth-changed', handleAuthChange);
    
    // Also listen for hash changes (when navigating)
    const handleHashChange = () => {
      setIsAuth(hasValidToken());
    };
    window.addEventListener('hashchange', handleHashChange);
    
    // Check auth on mount
    setIsAuth(hasValidToken());
    
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
        <Route path="/auth/accept" element={<AcceptTokenPage />} />
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
