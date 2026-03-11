import { useState, useEffect, Fragment } from 'react';
import { prospectsAPI } from '../services/api';

interface TaxSummaryProps {
  prospectId: string | null;
}

interface PreHolding {
  ticker: string;
  asset_class: string;
  value: number;
}

interface PostHolding {
  model_ticker: string;
  asset_class: string;
  value: number;
  ticker?: string; // legacy ticker when position is kept from a mapped holding
}

/** Group pre or post holdings by asset_class and render a table with sub-rows per ticker. */
function HoldingsByAssetClassTable({
  pre,
  holdings,
}: {
  pre: boolean;
  holdings: PreHolding[] | PostHolding[];
}) {
  type HoldingRow = PreHolding | PostHolding;
  const byClass = holdings.reduce<Record<string, HoldingRow[]>>((acc, h) => {
    const key = h.asset_class;
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});
  const classes = Object.keys(byClass).sort();
  const total = holdings.reduce((sum, h) => sum + Number(h.value), 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {!pre && (
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Legacy Ticker
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {pre ? 'Ticker' : 'Model Ticker'}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Asset Class
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Value
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              % of Total
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {classes.map((assetClass) => {
            const rows = byClass[assetClass];
            const subtotal = rows.reduce((sum, r) => sum + Number(r.value), 0);
            return (
              <Fragment key={assetClass}>
                {rows.map((row, idx) => (
                  <tr key={`${assetClass}-${idx}`}>
                    {!pre && (
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                        {'ticker' in row && row.ticker ? row.ticker : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      {pre ? (row as PreHolding).ticker : (row as PostHolding).model_ticker}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                      {row.asset_class}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${Number(row.value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 text-right">
                      {pct(Number(row.value)).toFixed(1)}%
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  {!pre && <td className="px-4 py-2 text-sm text-gray-500" />}
                  <td className="px-4 py-2 text-sm text-gray-700" colSpan={2}>
                    {assetClass} subtotal
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">
                    ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 text-right">
                    {pct(subtotal).toFixed(1)}%
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-right text-sm font-medium text-gray-700">
        Total: ${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (100%)
      </div>
    </div>
  );
}

interface TransitionResult {
  total_realized_gain_loss: number;
  sell_orders: Array<{
    ticker: string;
    value: number;
    gain_loss: number;
    grade: number;
  }>;
  buy_orders: Array<{
    model_ticker: string;
    value: number;
    asset_class: string;
  }>;
  cash_residual: number;
  pre_holdings?: PreHolding[];
  post_holdings?: PostHolding[];
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
      const sellOrders = typeof data.sell_orders === 'string'
        ? JSON.parse(data.sell_orders)
        : data.sell_orders;
      const buyOrders = typeof data.buy_orders === 'string'
        ? JSON.parse(data.buy_orders)
        : data.buy_orders ?? [];
      const cashResidual = Number(data.cash_residual ?? 0);
      const preHoldings = data.pre_holdings != null
        ? (typeof data.pre_holdings === 'string' ? JSON.parse(data.pre_holdings) : data.pre_holdings)
        : undefined;
      const postHoldings = data.post_holdings != null
        ? (typeof data.post_holdings === 'string' ? JSON.parse(data.post_holdings) : data.post_holdings)
        : undefined;

      setResult({
        total_realized_gain_loss: data.total_realized_gain_loss,
        sell_orders: sellOrders,
        buy_orders: buyOrders,
        cash_residual: cashResidual,
        pre_holdings: preHoldings,
        post_holdings: postHoldings,
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
              ${Number(result.total_realized_gain_loss).toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Sell Orders
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
                          ${Number(order.value).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${orderColorClass}`}>
                          ${Number(order.gain_loss).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
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
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Buy Orders
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Model Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Asset Class
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {result.buy_orders.map((order, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.model_ticker}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {order.asset_class}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${Number(order.value).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="border-t pt-6 mt-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            Holdings by Asset Class — Pre vs Post Trades
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Legacy positions (pre) compared to proposed model holdings (post), grouped by asset class.
          </p>

          {result.pre_holdings && result.post_holdings ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Legacy (Pre) holdings by asset class */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Legacy (Pre-trade)</h4>
                <HoldingsByAssetClassTable
                  pre
                  holdings={result.pre_holdings}
                />
              </div>
              {/* Proposed (Post) holdings by asset class */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Proposed (Post-trade)</h4>
                <HoldingsByAssetClassTable
                  pre={false}
                  holdings={result.post_holdings}
                />
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md mb-4">
                Pre/post breakdown by asset class is not available for this result. Re-run Calculate to see legacy vs proposed holdings by asset class.
              </p>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model Ticker</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset Class</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {result.buy_orders.map((order, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{order.model_ticker}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{order.asset_class}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                        ${Number(order.value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                  {result.cash_residual > 0 && (
                    <tr className="bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700">Cash</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">—</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                        ${Number(result.cash_residual).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <p className="text-sm font-medium text-gray-700">
              Total portfolio value post trades: $
              {(result.post_holdings?.length
                ? result.post_holdings.reduce((sum, o) => sum + Number(o.value), 0)
                : result.buy_orders.reduce((sum, o) => sum + Number(o.value), 0) + result.cash_residual
              ).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaxSummary;
