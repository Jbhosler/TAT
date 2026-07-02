import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';

type AuthorizedUser = {
  id: string;
  email: string;
  display_name?: string | null;
  role: 'user' | 'admin' | 'super_admin';
  is_active: boolean;
};

const AuthorizedUsers = () => {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'user' | 'admin' | 'super_admin'>('user');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.listAuthorizedUsers();
      setUsers(response.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await adminAPI.createAuthorizedUser({
        email,
        display_name: displayName || undefined,
        role,
      });
      setEmail('');
      setDisplayName('');
      setRole('user');
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create user');
    }
  };

  const updateUser = async (
    userEmail: string,
    updates: { role?: 'user' | 'admin' | 'super_admin'; is_active?: boolean },
  ) => {
    setError('');
    try {
      await adminAPI.updateAuthorizedUser(userEmail, updates);
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded shadow">
        <h3 className="text-lg font-medium mb-4">Add Authorized User</h3>
        <form onSubmit={addUser} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="email"
            placeholder="email@auour.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded px-3 py-2"
            required
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin' | 'super_admin')}
            className="border rounded px-3 py-2"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <button type="submit" className="bg-indigo-600 text-white rounded px-3 py-2 hover:bg-indigo-700">
            Add User
          </button>
        </form>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h3 className="text-lg font-medium mb-4">Authorized Users</h3>
        {loading ? (
          <p className="text-sm text-gray-600">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="py-2 pr-3">{user.email}</td>
                    <td className="py-2 pr-3">{user.display_name || '-'}</td>
                    <td className="py-2 pr-3">{user.role}</td>
                    <td className="py-2 pr-3">{user.is_active ? 'Active' : 'Inactive'}</td>
                    <td className="py-2 pr-3 space-x-2">
                      <button
                        className="text-indigo-600 hover:underline"
                        onClick={() =>
                          updateUser(user.email, {
                            role: user.role === 'user' ? 'admin' : user.role === 'admin' ? 'super_admin' : 'user',
                          })
                        }
                      >
                        Rotate Role
                      </button>
                      <button
                        className="text-indigo-600 hover:underline"
                        onClick={() => updateUser(user.email, { is_active: !user.is_active })}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    </div>
  );
};

export default AuthorizedUsers;
