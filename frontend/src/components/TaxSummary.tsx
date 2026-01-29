import { useState, useEffect } from 'react';
import { prospectsAPI } from '../services/api';

interface TaxSummaryProps {
  prospectId: string | null;
}

interface TransitionResult {
  total_realized_gain_loss: number;
  sell_orders: Array<{
    ticker: string;
    value: number;
    gain_loss: number;
    grade: number;
  }>;
}

const TaxSummary = ({ prospectId }: TaxSummaryProps) => {
  const [result, setResult] = useState<TransitionResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prospectId) {
      loadTaxSummary(prospectId);
    }
  }, [prospectId]);

  const loadTaxSummary = async (id: string) => {
    setLoading(true);
    try {
      const response = await prospectsAPI.getResult(id);
      const data = response.data;
      // Parse JSONB fields
      const sellOrders = typeof data.sell_orders === 'string' 
        ? JSON.parse(data.sell_orders) 
        : data.sell_orders;
      
      setResult({
        total_realized_gain_loss: data.total_realized_gain_loss,
        sell_orders: sellOrders,
      });
    } catch (err) {
      console.error('Failed to load tax summary:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!prospectId) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tax Summary
        </h2>
        <p className="text-gray-500">Select a prospect to view tax summary</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tax Summary
        </h2>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tax Summary
        </h2>
        <p className="text-gray-500">No tax data available</p>
      </div>
    );
  }

  const isGain = result.total_realized_gain_loss >= 0;
  const colorClass = isGain ? 'text-red-600' : 'text-green-600';

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Tax Summary
      </h2>
      
      <div className="space-y-4">
        <div className="border-b pb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              Total Realized Gain/Loss
            </span>
            <span className={`text-lg font-bold ${colorClass}`}>
              ${result.total_realized_gain_loss.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Sell Orders Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ticker
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gain/Loss
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {result.sell_orders.map((order, index) => {
                  const orderGain = order.gain_loss >= 0;
                  const orderColorClass = orderGain ? 'text-red-600' : 'text-green-600';
                  
                  return (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {order.ticker}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${order.value.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${orderColorClass}`}>
                        ${order.gain_loss.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {order.grade}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaxSummary;
