import { useState, useEffect } from 'react';
import { adminAPI, strategiesAPI } from '../../services/api';

const AssetClassMapper = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<any>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [assetClasses, setAssetClasses] = useState<string[]>([]);

  useEffect(() => {
    loadAssetClasses();
    loadStrategies();
  }, []);

  useEffect(() => {
    if (selectedStrategy) {
      loadMappings();
    }
  }, [selectedStrategy]);

  const loadAssetClasses = async () => {
    try {
      const response = await adminAPI.getAssetClasses();
      setAssetClasses(response.data);
    } catch (err) {
      console.error('Failed to load asset classes:', err);
    }
  };

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const loadMappings = async () => {
    if (!selectedStrategy) return;

    // Build mappings from strategy positions
    const mappings: Record<string, string> = {};
    selectedStrategy.positions?.forEach((pos: any) => {
      mappings[pos.model_ticker] = pos.asset_class;
    });
    setMappings(mappings);
  };

  const handleMappingChange = (modelTicker: string, assetClass: string) => {
    setMappings({ ...mappings, [modelTicker]: assetClass });
  };

  const handleSave = async () => {
    // This would update the strategy positions with new mappings
    // Implementation depends on API structure
    alert('Mappings saved (implementation pending)');
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Asset Class Mapper
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Strategy
          </label>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={selectedStrategy?.id || ''}
            onChange={(e) => {
              const strategy = strategies.find(s => s.id === e.target.value);
              setSelectedStrategy(strategy || null);
            }}
          >
            <option value="">Select a strategy</option>
            {strategies.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {selectedStrategy && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-4">
              Model Ticker to Asset Class Mappings
            </h3>
            <div className="space-y-4">
              {selectedStrategy.positions?.map((pos: any) => (
                <div key={pos.id} className="grid grid-cols-2 gap-4 items-center">
                  <div className="text-sm font-medium text-gray-900">
                    {pos.model_ticker}
                  </div>
                  <select
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={mappings[pos.model_ticker] || pos.asset_class}
                    onChange={(e) => handleMappingChange(pos.model_ticker, e.target.value)}
                  >
                    {assetClasses.map(ac => (
                      <option key={ac} value={ac}>{ac}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={handleSave}
              className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Save Mappings
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetClassMapper;
