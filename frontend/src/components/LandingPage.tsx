import { useState } from 'react';
import { authAPI } from '../services/api';

const LandingPage = () => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.validatePasscode(passcode);
      const isValid = response && (response.valid === true || response.data?.valid === true);
      const token = response?.token || response?.data?.token || 'authenticated';
      if (!isValid) {
        setError('Invalid passcode');
        return;
      }
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_role', 'super_admin');
      window.dispatchEvent(new CustomEvent('auth-changed'));
      window.location.hash = '#/dashboard';
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid passcode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Auour Tax-Aware Transition Tool
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter passcode to continue
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="passcode" className="sr-only">
              Passcode
            </label>
            <input
              id="passcode"
              name="passcode"
              type="password"
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
          </div>

          {error && <div className="text-red-600 text-sm text-center">{error}</div>}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Validating...' : 'Enter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LandingPage;
