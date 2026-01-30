import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TaxSummary from './TaxSummary';
import ProspectUpload from './prospect/ProspectUpload';
import MappingWizard from './prospect/MappingWizard';
import { prospectsAPI, strategiesAPI } from '../services/api';

type Step = 'upload' | 'classify' | 'map' | 'calculate' | 'result';

const Dashboard = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [step, setStep] = useState<Step>('upload');
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [unmappedHoldings, setUnmappedHoldings] = useState<any[]>([]);
  const [transitionResult, setTransitionResult] = useState<any>(null);
  const [staleWarning, setStaleWarning] = useState(false);

  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    if (prospectId && step === 'result') {
      checkStaleData(prospectId);
    }
  }, [prospectId, step]);

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const checkStaleData = async (id: string) => {
    try {
      const check = await prospectsAPI.staleCheck(id);
      setStaleWarning(check.data.is_stale);
    } catch {
      setStaleWarning(false);
    }
  };

  const handleUploadComplete = (newProspectId: string) => {
    setProspectId(newProspectId);
    setStep('classify');
  };

  const handleClassifyComplete = async () => {
    if (!prospectId) return;
    try {
      const result = await prospectsAPI.classify(prospectId);
      setClassificationResult(result.data);
      const unmapped = await prospectsAPI.getUnmapped(prospectId);
      if (unmapped.data && unmapped.data.length > 0) {
        setUnmappedHoldings(unmapped.data);
        setStep('map');
      } else {
        setStep('calculate');
      }
    } catch (err) {
      console.error('Failed to classify holdings:', err);
    }
  };

  const handleMappingComplete = () => {
    setStep('calculate');
  };

  const handleBackToMapping = async () => {
    if (!prospectId) return;
    try {
      const unmapped = await prospectsAPI.getUnmapped(prospectId);
      setUnmappedHoldings(unmapped.data ?? []);
      setStep('map');
    } catch {
      setStep('map');
    }
  };

  const handleCalculate = async () => {
    if (!prospectId) return;
    try {
      const result = await prospectsAPI.calculate(prospectId);
      setTransitionResult(result.data);
      setStep('result');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to calculate transition');
    }
  };

  const handleDownloadReportPdf = async () => {
    if (!prospectId) return;
    try {
      const res = await prospectsAPI.getReportPdf(prospectId);
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

  const handleStartNewProspect = () => {
    setProspectId(null);
    setStep('upload');
    setClassificationResult(null);
    setUnmappedHoldings([]);
    setTransitionResult(null);
    setStaleWarning(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    window.location.hash = '#/';
  };

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
                  className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
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
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {staleWarning && step === 'result' && (
          <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Warning:</strong> The strategy has been updated since this calculation.
                  Please recalculate to get updated results.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-6 sm:px-0">
          {/* Intro */}
          <p className="mb-6 text-gray-600">
            Select the <strong>target strategy</strong> to compare against, then enter the prospect&apos;s current holdings.
            The tool will calculate the tax-aware transition.
          </p>

          {/* 1. Strategy to compare against - always visible */}
          <div className="mb-6 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              1. Select strategy to compare against
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              This is the target strategy the prospect portfolio will be transitioned to.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[280px]">
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={selectedStrategyId}
                  onChange={(e) => setSelectedStrategyId(e.target.value)}
                >
                  <option value="">Select a strategy...</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {strategies.length === 0 && (
                <p className="text-sm text-amber-600">
                  No strategies yet. Create one in <Link to="/admin" className="underline">Admin</Link> first.
                </p>
              )}
              {prospectId && (
                <button
                  type="button"
                  onClick={handleStartNewProspect}
                  className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Start new prospect
                </button>
              )}
            </div>
          </div>

          {/* Progress steps when in flow */}
          {prospectId && (
            <div className="mb-6">
              <nav aria-label="Progress">
                <ol className="flex flex-wrap items-center gap-2 text-sm">
                  <li className={step === 'upload' ? 'text-indigo-600 font-medium' : 'text-gray-500'}>
                    1. Upload
                  </li>
                  <li className="text-gray-400">→</li>
                  <li className={step === 'classify' ? 'text-indigo-600 font-medium' : 'text-gray-500'}>
                    2. Classify
                  </li>
                  <li className="text-gray-400">→</li>
                  <li className={step === 'map' ? 'text-indigo-600 font-medium' : 'text-gray-500'}>
                    3. Map
                  </li>
                  <li className="text-gray-400">→</li>
                  <li className={step === 'calculate' ? 'text-indigo-600 font-medium' : 'text-gray-500'}>
                    4. Calculate
                  </li>
                  <li className="text-gray-400">→</li>
                  <li className={step === 'result' ? 'text-indigo-600 font-medium' : 'text-gray-500'}>
                    5. Result
                  </li>
                </ol>
              </nav>
            </div>
          )}

          {/* Step content: 2. Prospect portfolio (holdings input) */}
          {step === 'upload' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                2. Prospect portfolio — enter holdings
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Enter the prospect&apos;s current holdings manually or upload a CSV. Then create the prospect to run classification and transition.
              </p>
              {!selectedStrategyId && strategies.length > 0 && (
                <p className="mb-4 text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Select a strategy above (step 1) to compare against, then enter holdings below.
                </p>
              )}
              <ProspectUpload
                strategies={strategies}
                selectedStrategyId={selectedStrategyId}
                onStrategyChange={setSelectedStrategyId}
                onUploadComplete={handleUploadComplete}
                hideStrategySelector
              />
            </div>
          )}

          {step === 'classify' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Classify Holdings
              </h2>
              {classificationResult ? (
                <div className="space-y-4">
                  <p className="text-gray-700">
                    Side-pocket holdings: {classificationResult.side_pocket_count}
                  </p>
                  <p className="text-gray-700">
                    Rebalanceable holdings: {classificationResult.rebalanceable_count}
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleClassifyComplete}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Classify Holdings
                </button>
              )}
            </div>
          )}

          {step === 'map' && prospectId && unmappedHoldings.length > 0 && (
            <MappingWizard
              prospectId={prospectId}
              unmappedHoldings={unmappedHoldings}
              onMappingComplete={handleMappingComplete}
            />
          )}
          {step === 'map' && prospectId && unmappedHoldings.length === 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Mapping
              </h2>
              <p className="text-gray-700 mb-4">
                All holdings are mapped. You can proceed to calculate or re-run Classify to change how holdings are classified.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setStep('calculate')}
                  className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Proceed to Calculate
                </button>
                <button
                  onClick={handleBackToMapping}
                  className="flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Refresh mapping status
                </button>
              </div>
            </div>
          )}

          {step === 'calculate' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Calculate Transition
              </h2>
              <p className="text-gray-700 mb-4">
                All holdings have been mapped. Ready to calculate the transition.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleCalculate}
                  className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Calculate Transition
                </button>
                <button
                  onClick={handleBackToMapping}
                  className="flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Back to mapping
                </button>
              </div>
            </div>
          )}

          {step === 'result' && transitionResult && (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Transition Result
                </h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Total Realized Gain/Loss
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        Number(transitionResult.total_realized_gain_loss) >= 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      $
                      {Number(transitionResult.total_realized_gain_loss).toLocaleString(
                        'en-US',
                        { minimumFractionDigits: 0, maximumFractionDigits: 0 }
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleDownloadReportPdf}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Download PDF Report
                    </button>
                    <button
                      onClick={handleCalculate}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Recalculate
                    </button>
                    <button
                      onClick={handleBackToMapping}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Back to mapping
                    </button>
                  </div>
                </div>
              </div>

              <TaxSummary prospectId={prospectId} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
