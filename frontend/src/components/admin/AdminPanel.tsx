import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { strategiesAPI } from '../../services/api';
import AdminUploads from './AdminUploads';
import StrategyEditor from './StrategyEditor';
import StrategyBridge from '../monitoring/StrategyBridge';
import AssetClassMapper from './AssetClassMapper';
import ProductEquivalents from './ProductEquivalents';
import DataIntegrity from './DataIntegrity';

type Strategy = { id: string; name: string };

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState<'uploads' | 'editor' | 'bridge' | 'mapper' | 'equivalents' | 'integrity'>('uploads');
  const [strategies, setStrategies] = useState<Strategy[]>([]);

  useEffect(() => {
    strategiesAPI.list()
      .then((r) => {
        const data = r?.data;
        setStrategies(Array.isArray(data) ? data : (data?.data ?? []));
      })
      .catch((err) => {
        console.error('AdminPanel: failed to load strategies', err);
        setStrategies([]);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  Admin Panel
                </h1>
                <span className="ml-2 text-xs text-gray-400" title="Build time">
                  {typeof __BUILD_TIME__ !== 'undefined' ? new Date(__BUILD_TIME__).toLocaleString() : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/scenarios"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                Scenarios
              </Link>
              <Link
                to="/monitoring"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                Monitoring
              </Link>
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
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('uploads')}
                className={`${
                  activeTab === 'uploads'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Uploads
              </button>
              <button
                onClick={() => setActiveTab('editor')}
                className={`${
                  activeTab === 'editor'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Strategy Editor
              </button>
              <button
                onClick={() => setActiveTab('bridge')}
                className={`${
                  activeTab === 'bridge'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Strategy Bridge
              </button>
              <button
                onClick={() => setActiveTab('mapper')}
                className={`${
                  activeTab === 'mapper'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Asset Class Mapper
              </button>
              <button
                onClick={() => setActiveTab('equivalents')}
                className={`${
                  activeTab === 'equivalents'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Product Equivalents
              </button>
              <button
                onClick={() => setActiveTab('integrity')}
                className={`${
                  activeTab === 'integrity'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Data Integrity
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {activeTab === 'uploads' && (
              <AdminUploads
                strategies={strategies}
                onStrategiesRefresh={() =>
                  strategiesAPI.list()
                    .then((r) => {
                      const data = r?.data;
                      setStrategies(Array.isArray(data) ? data : (data?.data ?? []));
                    })
                    .catch(() => setStrategies([]))
                }
              />
            )}
            {activeTab === 'editor' && <StrategyEditor />}
            {activeTab === 'bridge' && <StrategyBridge />}
            {activeTab === 'mapper' && <AssetClassMapper />}
            {activeTab === 'equivalents' && (
              <ProductEquivalents
                strategies={strategies}
                onStrategiesRefresh={() =>
                  strategiesAPI.list()
                    .then((r) => {
                      const data = r?.data;
                      setStrategies(Array.isArray(data) ? data : (data?.data ?? []));
                    })
                    .catch(() => setStrategies([]))
                }
              />
            )}
            {activeTab === 'integrity' && <DataIntegrity />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
