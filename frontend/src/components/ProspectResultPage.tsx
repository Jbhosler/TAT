import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { prospectsAPI } from '../services/api';
import TaxSummary from './TaxSummary';

const ProspectResultPage = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<any>(null);
  const [hasDocument, setHasDocument] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file.');
      return;
    }
    setUploadingDoc(true);
    try {
      await prospectsAPI.uploadDocument(id, file);
      setHasDocument(true);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not upload document.');
    } finally {
      setUploadingDoc(false);
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

  const handleDownloadReportPdf = async () => {
    if (!id) return;
    try {
      const res = await prospectsAPI.getReportPdf(id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disp = res.headers['content-disposition'] || res.headers['Content-Disposition'] || '';
      const match = disp.match(/filename="?([^";\n]+)"?/);
      a.download = match ? match[1].trim() : 'transition-report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not download PDF report.');
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
                  to="/monitoring"
                  className="border-transparent text-gray-500 hover:text-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Monitoring
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileSelected}
        />
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
          {uploadingDoc ? (
            <span className="text-sm text-gray-500">Uploading…</span>
          ) : (
            <button
              type="button"
              onClick={triggerFileUpload}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              {hasDocument ? 'Replace document' : 'Add document'}
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
            <div className="bg-white shadow rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
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
              <button
                type="button"
                onClick={handleDownloadReportPdf}
                className="flex-shrink-0 inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Download PDF Report
              </button>
            </div>
            <TaxSummary prospectId={id} />
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default ProspectResultPage;
