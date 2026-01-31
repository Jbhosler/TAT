import { useState, useEffect } from 'react';
import { monitoringAPI, strategiesAPI } from '../../services/api';

type Mapping = { id: string; external_model_name: string; internal_strategy_id: string };
type Strategy = { id: string; name: string };

const StrategyBridge = () => {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [externalName, setExternalName] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMappings = async () => {
    try {
      const res = await monitoringAPI.listStrategyMappings();
      setMappings(res.data);
    } catch (err) {
      console.error('Failed to load strategy mappings:', err);
    }
  };

  const loadStrategies = async () => {
    try {
      const res = await strategiesAPI.list();
      setStrategies(res.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  useEffect(() => {
    loadMappings();
    loadStrategies();
  }, []);

  const handleAdd = async () => {
    if (!externalName.trim() || !strategyId) {
      alert('Enter external model name and select internal strategy.');
      return;
    }
    setLoading(true);
    try {
      await monitoringAPI.createStrategyMapping({
        external_model_name: externalName.trim(),
        internal_strategy_id: strategyId,
      });
      setExternalName('');
      setStrategyId('');
      loadMappings();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to add mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (m: Mapping) => {
    setEditingId(m.id);
    setExternalName(m.external_model_name);
    setStrategyId(m.internal_strategy_id);
  };

  const handleUpdate = async () => {
    if (!editingId || !externalName.trim() || !strategyId) return;
    setLoading(true);
    try {
      await monitoringAPI.updateStrategyMapping(editingId, {
        external_model_name: externalName.trim(),
        internal_strategy_id: strategyId,
      });
      setEditingId(null);
      setExternalName('');
      setStrategyId('');
      loadMappings();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      await monitoringAPI.deleteStrategyMapping(id);
      loadMappings();
      if (editingId === id) {
        setEditingId(null);
        setExternalName('');
        setStrategyId('');
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete mapping');
    }
  };

  const strategyName = (id: string) => strategies.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Strategy Bridge</h3>
      <p className="text-sm text-gray-500 mb-4">
        Map external vendor model names to internal strategies. Only accounts with a mapping are ingested.
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={externalName}
          onChange={(e) => setExternalName(e.target.value)}
          placeholder="External model name (e.g. Auour Instinct Global Equity Strategy)"
          className="block flex-1 min-w-[200px] rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
        <select
          value={strategyId}
          onChange={(e) => setStrategyId(e.target.value)}
          className="block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          <option value="">Select internal strategy</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {editingId ? (
          <>
            <button
              onClick={handleUpdate}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              Update
            </button>
            <button
              onClick={() => { setEditingId(null); setExternalName(''); setStrategyId(''); }}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={handleAdd}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            Add mapping
          </button>
        )}
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">External Model Name</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Internal Strategy</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {mappings.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2 text-sm text-gray-900">{m.external_model_name}</td>
              <td className="px-4 py-2 text-sm text-gray-600">{strategyName(m.internal_strategy_id)}</td>
              <td className="px-4 py-2 text-sm text-right">
                <button
                  onClick={() => handleEdit(m)}
                  className="text-indigo-600 hover:text-indigo-800 mr-3"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mappings.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">No mappings yet. Add one above.</p>
      )}
    </div>
  );
};

export default StrategyBridge;
