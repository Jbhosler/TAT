import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StrategyBridge from './monitoring/StrategyBridge';
import HeatMap from './monitoring/HeatMap';
import TotalFirm from './monitoring/TotalFirm';
import ConcentrationReport from './monitoring/ConcentrationReport';
import AccountDetailsByAdviser from './monitoring/AccountDetailsByAdviser';
import AccountDrillDown from './monitoring/AccountDrillDown';
import ConcentrationAccountList from './monitoring/ConcentrationAccountList';

const MonitoringPage = () => {
  const { id: accountId, ticker, grade } = useParams<{ id?: string; ticker?: string; grade?: string }>();
  const [activeTab, setActiveTab] = useState<'bridge' | 'heatmap' | 'totalfirm' | 'concentration' | 'byadviser'>('totalfirm');

  if (accountId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
                <Link to="/monitoring" className="text-sm text-indigo-600 hover:text-indigo-800">← Back</Link>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Dashboard</Link>
                <Link to="/scenarios" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Scenarios</Link>
                <Link to="/admin" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Admin</Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <AccountDrillDown />
        </main>
      </div>
    );
  }

  if (ticker && grade) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
                <Link to="/monitoring" className="text-sm text-indigo-600 hover:text-indigo-800">← Back</Link>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Dashboard</Link>
                <Link to="/scenarios" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Scenarios</Link>
                <Link to="/admin" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Admin</Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <ConcentrationAccountList />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Dashboard</Link>
              <Link to="/scenarios" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Scenarios</Link>
              <Link to="/admin" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('totalfirm')}
              className={`${
                activeTab === 'totalfirm'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Total Firm
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
              onClick={() => setActiveTab('heatmap')}
              className={`${
                activeTab === 'heatmap'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Heat Map
            </button>
            <button
              onClick={() => setActiveTab('concentration')}
              className={`${
                activeTab === 'concentration'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Concentration
            </button>
            <button
              onClick={() => setActiveTab('byadviser')}
              className={`${
                activeTab === 'byadviser'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              By Adviser
            </button>
          </nav>
        </div>

        <div className="space-y-6">
          {activeTab === 'totalfirm' && <TotalFirm />}
          {activeTab === 'bridge' && <StrategyBridge />}
          {activeTab === 'heatmap' && <HeatMap />}
          {activeTab === 'concentration' && <ConcentrationReport />}
          {activeTab === 'byadviser' && <AccountDetailsByAdviser />}
        </div>
      </main>
    </div>
  );
};

export default MonitoringPage;
