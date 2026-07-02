import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI } from '../../services/api';

const AcceptTokenPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (!token) {
      setError('Missing token.');
      return;
    }

    const applyToken = async () => {
      try {
        localStorage.setItem('auth_token', token);
        const me = await authAPI.me();
        if (me?.role) localStorage.setItem('auth_role', me.role);
        if (me?.email) localStorage.setItem('auth_email', me.email);
        window.dispatchEvent(new CustomEvent('auth-changed'));
        // Remove sensitive token from URL.
        navigate('/dashboard', { replace: true });
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_email');
        setError('Invalid or expired token.');
      }
    };

    applyToken();
  }, [location.search, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md text-center">
        {error ? (
          <>
            <h2 className="text-xl font-semibold text-red-700 mb-3">Authentication failed</h2>
            <p className="text-sm text-gray-600">{error}</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Signing you in...</h2>
            <p className="text-sm text-gray-600">Please wait while we validate your access token.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AcceptTokenPage;
