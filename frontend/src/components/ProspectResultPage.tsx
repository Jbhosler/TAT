import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { prospectsAPI } from '../services/api';
import TaxSummary from './TaxSummary';

const ProspectResultPage = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<any>(null);
  const [hasDocument, setHasDocument] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadResult(id);
      loadProspectSummary(id);
    } else {
      setLoading(false);
      setError('No prospect ID');
    }
  }, [id]);

  const loadResult = async (prospectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await prospectsAPI.getResult(prospectId);
      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.status === 404 ? 'No result for this scenario. Run Calculate in Dashboard first.' : 'Failed to load result.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const loadProspectSummary = async (prospectId: string) => {
    try {
      const res = await prospectsAPI.get(prospectId);
      setHasDocument(Boolean(res.data?.has_document));
    } catch {
      setHasDocument(false);
    }
  };

  const handleViewPdf = async () => {
    if (!id) return;
    try {
      const res = await prospectsAPI.getDocument(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
    } catch {
      alert('Could not load PDF.');
    }
  };

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (!id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>No prospect selected.</p>
          <Link to="/scenarios" className="mt-4 inline-block text-indigo-600 hover:text-indigo-800">Back to Scenarios</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  Tax-Aware Transition Tool
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/scenarios"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Scenarios
                </Link>
                <Link
                  to="/admin"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Admin
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <Link to="/scenarios" className="text-sm text-indigo-600 hover:text-indigo-800">
            ← Back to Scenarios
          </Link>
          <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-800">
            Dashboard
          </Link>
          {hasDocument && (
            <button
              type="button"
              onClick={handleViewPdf}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              View PDF
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            Loading result…
          </div>
        ) : error ? (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <p className="text-gray-600">{error}</p>
            <Link to="/scenarios" className="mt-4 inline-block text-indigo-600 hover:text-indigo-800">Back to Scenarios</Link>
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Transition Result</h2>
              <div>
                <p className="text-sm font-medium text-gray-700">Total Realized Gain/Loss</p>
                <p
                  className={`text-lg font-bold ${
                    Number(result.total_realized_gain_loss) >= 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  ${formatDollars(Number(result.total_realized_gain_loss))}
                </p>
              </div>
            </div>
            <TaxSummary prospectId={id} />
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default ProspectResultPage;
