import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ProspectUpload from './ProspectUpload';
import MappingWizard from './MappingWizard';
import { prospectsAPI, strategiesAPI } from '../../services/api';

const ProspectFlow = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<'upload' | 'classify' | 'map' | 'calculate' | 'result'>('upload');
  const [prospectId, setProspectId] = useState<string | null>(id || null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [unmappedHoldings, setUnmappedHoldings] = useState<any[]>([]);
  const [transitionResult, setTransitionResult] = useState<any>(null);

  useEffect(() => {
    loadStrategies();
    if (prospectId) {
      checkProspectStatus();
    }
  }, [prospectId]);

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const checkProspectStatus = async () => {
    if (!prospectId) return;

    try {
      // Check for unmapped holdings
      const unmapped = await prospectsAPI.getUnmapped(prospectId);
      if (unmapped.data && unmapped.data.length > 0) {
        setUnmappedHoldings(unmapped.data);
        setStep('map');
      } else {
        // Check if calculation exists
        try {
          const result = await prospectsAPI.getResult(prospectId);
          setTransitionResult(result.data);
          setStep('result');
        } catch {
          setStep('calculate');
        }
      }
    } catch (err) {
      console.error('Failed to check prospect status:', err);
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

      // Check for unmapped holdings
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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Prospect Transition
              </h1>
            </div>
            <div className="flex items-center">
              <Link
                to="/dashboard"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Progress Steps */}
          <div className="mb-6">
            <nav aria-label="Progress">
              <ol className="flex items-center">
                <li className={`${step === 'upload' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  <span className="font-medium">1. Upload</span>
                </li>
                <li className="mx-4">→</li>
                <li className={`${step === 'classify' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  <span className="font-medium">2. Classify</span>
                </li>
                <li className="mx-4">→</li>
                <li className={`${step === 'map' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  <span className="font-medium">3. Map</span>
                </li>
                <li className="mx-4">→</li>
                <li className={`${step === 'calculate' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  <span className="font-medium">4. Calculate</span>
                </li>
                <li className="mx-4">→</li>
                <li className={`${step === 'result' ? 'text-indigo-600' : 'text-gray-500'}`}>
                  <span className="font-medium">5. Result</span>
                </li>
              </ol>
            </nav>
          </div>

          {/* Step Content */}
          {step === 'upload' && (
            <ProspectUpload
              strategies={strategies}
              selectedStrategyId={selectedStrategyId}
              onStrategyChange={setSelectedStrategyId}
              onUploadComplete={handleUploadComplete}
            />
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

          {step === 'map' && (
            <MappingWizard
              prospectId={prospectId!}
              unmappedHoldings={unmappedHoldings}
              onMappingComplete={handleMappingComplete}
            />
          )}

          {step === 'calculate' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Calculate Transition
              </h2>
              <p className="text-gray-700 mb-4">
                All holdings have been mapped. Ready to calculate the transition.
              </p>
              <button
                onClick={handleCalculate}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Calculate Transition
              </button>
            </div>
          )}

          {step === 'result' && transitionResult && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Transition Result
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Total Realized Gain/Loss:
                  </p>
                  <p className={`text-lg font-bold ${
                    transitionResult.total_realized_gain_loss >= 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    ${transitionResult.total_realized_gain_loss?.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  View in Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProspectFlow;
