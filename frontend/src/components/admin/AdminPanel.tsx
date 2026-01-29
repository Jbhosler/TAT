import { useState } from 'react';
import { Link } from 'react-router-dom';
import StrategyEditor from './StrategyEditor';
import BulkUpload from './BulkUpload';
import AssetClassMapper from './AssetClassMapper';
import ProductEquivalents from './ProductEquivalents';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState<'editor' | 'upload' | 'mapper' | 'equivalents'>('editor');

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
              </div>
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
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
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
                onClick={() => setActiveTab('upload')}
                className={`${
                  activeTab === 'upload'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Bulk Upload
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
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {activeTab === 'editor' && <StrategyEditor />}
            {activeTab === 'upload' && <BulkUpload />}
            {activeTab === 'mapper' && <AssetClassMapper />}
            {activeTab === 'equivalents' && <ProductEquivalents />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
