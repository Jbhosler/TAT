import { useState, useEffect, Fragment } from 'react';
import { prospectsAPI } from '../services/api';

interface TaxSummaryProps {
  prospectId: string | null;
}

interface PreHolding {
  ticker: string;
  asset_class: string;
  value: number;
  unrealized_gain_loss?: number;
}

interface PostHolding {
  model_ticker: string;
  asset_class: string;
  value: number;
  ticker?: string; // legacy ticker when position is kept from a mapped holding
  unrealized_gain_loss?: number;
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
  const totalUnrealized = holdings.reduce((sum, h) => sum + Number(h.unrealized_gain_loss ?? 0), 0);
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
              Unrealized G/L
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
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${Number(row.unrealized_gain_loss ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">
                    ${rows.reduce((sum, r) => sum + Number(r.unrealized_gain_loss ?? 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
        Total Value: ${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} | Total Unrealized G/L: ${totalUnrealized.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (100%)
      </div>
    </div>
  );
}

interface EquivalentUsageRow {
  legacy_ticker: string;
  model_ticker: string;
  grade: number;
  in_product_equivalents: boolean;
  mapping_source?: string;
}

function normalizeTicker(ticker: string): string {
  return (ticker || '').trim().toUpperCase();
}

function effectiveMappingSource(row: EquivalentUsageRow): string {
  if (row.mapping_source) return row.mapping_source;
  if (row.in_product_equivalents) return 'ge_alt';
  if (normalizeTicker(row.legacy_ticker) === 'CASH') return 'cash';
  return 'not_in_ge_alt';
}

function isProposalOnlyMapping(row: EquivalentUsageRow): boolean {
  const source = effectiveMappingSource(row);
  return source === 'manual' || source === 'not_in_ge_alt';
}

function mappingSourceLabel(source: string): string {
  switch (source) {
    case 'manual':
      return 'Set on this proposal (manual)';
    case 'not_in_ge_alt':
      return 'Not in alt file';
    case 'cash':
      return 'Cash (auto-mapped)';
    case 'ge_alt':
      return 'In alt file';
    default:
      return source;
  }
}

function EquivalentUsageTable({
  rows,
  highlightProposalOnly = false,
}: {
  rows: EquivalentUsageRow[];
  highlightProposalOnly?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        None — all mappings used in this transition come from the strategy product equivalents file.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Legacy ticker
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Model ticker
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Grade
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              How mapped
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, index) => {
            const source = effectiveMappingSource(row);
            const isAction = isProposalOnlyMapping(row);
            const emphasize = highlightProposalOnly && isAction;
            return (
              <tr
                key={`${row.legacy_ticker}-${row.model_ticker}-${row.grade}-${index}`}
                className={emphasize ? 'bg-amber-50' : undefined}
              >
                <td
                  className={`px-4 py-3 whitespace-nowrap text-sm ${
                    emphasize ? 'font-semibold text-amber-950' : 'text-gray-900'
                  }`}
                >
                  {row.legacy_ticker}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap text-sm ${
                    emphasize ? 'font-semibold text-amber-950' : 'text-gray-900'
                  }`}
                >
                  {row.model_ticker}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap text-sm ${
                    emphasize ? 'font-semibold text-amber-950' : 'text-gray-600'
                  }`}
                >
                  {row.grade}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  {emphasize ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-300">
                      {mappingSourceLabel(source)}
                    </span>
                  ) : (
                    <span className="text-gray-600">{mappingSourceLabel(source)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface TargetPositionRow {
  model_ticker: string;
  asset_class: string;
  target_allocation: number;
  drift_percentage: number;
}

function TargetPortfolioTable({ positions }: { positions: TargetPositionRow[] }) {
  const byClass = positions.reduce<Record<string, TargetPositionRow[]>>((acc, p) => {
    const key = p.asset_class;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const classes = Object.keys(byClass).sort(
    (a, b) =>
      Math.max(...byClass[b].map((p) => Number(p.target_allocation)))
      - Math.max(...byClass[a].map((p) => Number(p.target_allocation))),
  );

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Model Ticker
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Asset Class
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Target %
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Drift %
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {classes.map((assetClass) => {
            const rows = [...byClass[assetClass]].sort(
              (a, b) => Number(b.target_allocation) - Number(a.target_allocation),
            );
            const subtotal = rows.reduce((sum, r) => sum + Number(r.target_allocation), 0);
            return (
              <Fragment key={assetClass}>
                {rows.map((row) => (
                  <tr key={`${assetClass}-${row.model_ticker}`}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      {row.model_ticker}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                      {row.asset_class}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                      {Number(row.target_allocation).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 text-right">
                      ±{Number(row.drift_percentage).toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {rows.length > 1 && (
                  <tr className="bg-indigo-50 font-medium">
                    <td className="px-4 py-2 text-sm text-gray-900" colSpan={2}>
                      {assetClass} subtotal
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right">
                      {subtotal.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 text-right">—</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-100">
          <tr>
            <td className="px-4 py-2 text-sm font-semibold text-gray-900" colSpan={2}>
              Total
            </td>
            <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
              100.00%
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface TransitionResult {
  strategy_display_name?: string;
  target_positions?: TargetPositionRow[];
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
  equivalent_usage?: EquivalentUsageRow[];
}

const KPI_LABELS = {
  netGainLoss: 'Net realized gain/loss',
  preUnrealized: 'Unrealized gain/loss (pre portfolio)',
  postUnrealized: 'Unrealized gain/loss (post portfolio)',
  cashResidual: 'Cash residual',
} as const;

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
      let equivUsage: EquivalentUsageRow[] | undefined;
      if (data.equivalent_usage != null && data.equivalent_usage !== undefined) {
        const raw =
          typeof data.equivalent_usage === 'string'
            ? JSON.parse(data.equivalent_usage)
            : data.equivalent_usage;
        equivUsage = Array.isArray(raw) ? raw : [];
      }

      let targetPositions: TargetPositionRow[] | undefined;
      if (data.target_positions != null) {
        const raw =
          typeof data.target_positions === 'string'
            ? JSON.parse(data.target_positions)
            : data.target_positions;
        targetPositions = Array.isArray(raw) ? raw : [];
      }

      setResult({
        total_realized_gain_loss: data.total_realized_gain_loss,
        sell_orders: sellOrders,
        buy_orders: buyOrders,
        cash_residual: cashResidual,
        pre_holdings: preHoldings,
        post_holdings: postHoldings,
        equivalent_usage: equivUsage,
        target_positions: targetPositions,
        strategy_display_name: data.strategy_display_name ?? undefined,
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
  const netGainLoss = Number(result.total_realized_gain_loss ?? 0);
  const cashResidual = Number(result.cash_residual ?? 0);
  const preUnrealizedGainLoss = (result.pre_holdings ?? []).reduce(
    (sum, h) => sum + Number(h.unrealized_gain_loss ?? 0),
    0
  );
  const postUnrealizedGainLoss = (result.post_holdings ?? []).reduce(
    (sum, h) => sum + Number(h.unrealized_gain_loss ?? 0),
    0
  );
  const geAltAdds = (result.equivalent_usage ?? []).filter(isProposalOnlyMapping).length;
  const proposalOnlyMappings = (result.equivalent_usage ?? []).filter(isProposalOnlyMapping);
  const geAltFileMappings = (result.equivalent_usage ?? []).filter(
    (row) => effectiveMappingSource(row) === 'ge_alt',
  );
  const sidePocketCount = (result.pre_holdings ?? []).filter((h) => h.asset_class === 'Side Pocket').length;

  const recommendation = netGainLoss > 0
    ? 'Transition is tax-aware but realizes a net gain; review client tax context before execution.'
    : netGainLoss < 0
      ? 'Transition realizes net losses while improving model alignment; this may support tax efficiency.'
      : 'Transition is tax-neutral on realized gain/loss and improves allocation alignment.';

  const preForAlloc =
    result.pre_holdings?.filter((h) => h.asset_class !== 'Side Pocket') ?? [];
  const postForAlloc =
    result.post_holdings?.filter((h) => h.asset_class !== 'Side Pocket') ?? [];

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Tax Summary
      </h2>
      {result.strategy_display_name && (
        <p className="text-sm text-gray-600 mb-4">
          Target strategy: <span className="font-medium text-gray-900">{result.strategy_display_name}</span>
        </p>
      )}
      {!result.strategy_display_name && <div className="mb-4" />}

      <div className="space-y-6">
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-600">Recommendation</p>
          <p className="text-base font-medium text-gray-900 mt-1">
            {recommendation}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{KPI_LABELS.netGainLoss}</p>
              <p className={`text-lg font-bold ${colorClass}`}>
                ${netGainLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{KPI_LABELS.preUnrealized}</p>
              <p className="text-lg font-bold text-gray-700">
                ${preUnrealizedGainLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{KPI_LABELS.postUnrealized}</p>
              <p className="text-lg font-bold text-gray-900">
                ${postUnrealizedGainLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{KPI_LABELS.cashResidual}</p>
              <p className="text-lg font-bold text-gray-900">
                ${cashResidual.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>

        {result.equivalent_usage == null && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Product equivalents mapping report is not available for this saved result. Recalculate the
            proposal to see which equivalents were set on the proposal but are not in the strategy alt file.
          </p>
        )}

        {Array.isArray(result.equivalent_usage) && proposalOnlyMappings.length > 0 && (
          <div
            className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4"
            role="alert"
          >
            <h3 className="text-base font-bold text-amber-950">
              {proposalOnlyMappings.length} mapping
              {proposalOnlyMappings.length === 1 ? '' : 's'} used in this proposal{' '}
              {proposalOnlyMappings.length === 1 ? 'is' : 'are'} not in the strategy alt file
            </h3>
            <p className="mt-2 text-sm text-amber-900">
              These legacy→model pairs were applied to run this transition but do not exist in the
              strategy&apos;s product equivalents file. Add them in Admin → Product Equivalents if they
              should apply to future proposals, or confirm the manual mapping was intentional for this
              client only.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-amber-950">
              {proposalOnlyMappings.map((row, index) => (
                <li key={`alert-${row.legacy_ticker}-${row.model_ticker}-${index}`}>
                  <span className="font-semibold">{row.legacy_ticker}</span>
                  {' → '}
                  <span className="font-semibold">{row.model_ticker}</span>
                  {' (grade '}
                  {row.grade}
                  {') — '}
                  {mappingSourceLabel(effectiveMappingSource(row))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(result.equivalent_usage) && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Proposal mappings not in alt file
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Equivalents set for this proposal that are missing from the strategy product equivalents
                file. These require adviser follow-up before treating the mapping as standard.
              </p>
              <EquivalentUsageTable rows={proposalOnlyMappings} highlightProposalOnly />
            </div>
            {geAltFileMappings.length > 0 && (
              <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-800">
                  Mappings from product equivalents file ({geAltFileMappings.length})
                </summary>
                <div className="mt-3">
                  <EquivalentUsageTable rows={geAltFileMappings} />
                </div>
              </details>
            )}
          </div>
        )}

        {(result.target_positions?.length ?? 0) > 0 && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Target model portfolio</h3>
            <p className="text-sm text-gray-500 mb-3">
              Per-ticker model weights used for this transition (including strategy blends).
            </p>
            <TargetPortfolioTable positions={result.target_positions!} />
          </div>
        )}

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-semibold text-gray-900">Adviser action checklist</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
            <li>
              Review side-pocket positions: <span className="font-semibold">{sidePocketCount}</span>
            </li>
            <li>
              Add legacy-to-model pairs to product equivalents (not in alt file for this proposal):{' '}
              <span className="font-semibold">{geAltAdds}</span>
            </li>
            <li>
              Confirm client tax comfort with net realized amount: <span className="font-semibold">${netGainLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </li>
          </ul>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Trade rationale (decision support)</h3>
          <p className="text-sm text-gray-500 mb-3">
            Use this narrative in meetings; expand for full order-level detail.
          </p>
          <details className="rounded-md border border-gray-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-800">
              Expand trade rationale
            </summary>
            <div className="mt-3 text-sm text-gray-700 space-y-2">
              <p>
                <span className="font-semibold">Sells:</span> positions are reduced or exited based on grade hierarchy and transition rules to fund target allocations.
              </p>
              <p>
                <span className="font-semibold">Buys:</span> proceeds are reallocated to model targets to increase strategy alignment.
              </p>
              <p>
                <span className="font-semibold">Equivalents:</span> the amber alert and
                &quot;Proposal mappings not in alt file&quot; table list pairs used for this run that
                are not in the strategy product equivalents file — add them in Admin or confirm manual
                mapping.
              </p>
            </div>
          </details>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            Trade details
          </h3>
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
        </div>

        {result.pre_holdings?.some((h) => h.asset_class === 'Side Pocket') && (
          <div className="border-t pt-6 mt-6 space-y-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Side pocket holdings (not transitioned)
            </h3>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unrealized G/L
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {result.pre_holdings
                    .filter((h) => h.asset_class === 'Side Pocket')
                    .map((h, index) => (
                      <tr key={`${h.ticker}-${index}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {h.ticker}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                          $
                          {Number(h.value).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                          $
                          {Number(h.unrealized_gain_loss ?? 0).toLocaleString('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      </tr>
                    ))}
                  <tr className="bg-gray-50 font-medium">
                    <td className="px-4 py-3 text-sm text-gray-700">Side pocket subtotal</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      $
                      {result.pre_holdings
                        .filter((h) => h.asset_class === 'Side Pocket')
                        .reduce((sum, h) => sum + Number(h.value), 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      $
                      {result.pre_holdings
                        .filter((h) => h.asset_class === 'Side Pocket')
                        .reduce((sum, h) => sum + Number(h.unrealized_gain_loss ?? 0), 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="border-t pt-6 mt-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            Holdings by Asset Class — Pre vs Post Trades
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            What changed: legacy positions transition toward the strategy model after trades. Side pockets are excluded from this comparison.
          </p>

          {result.pre_holdings && result.post_holdings ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Legacy (Pre) holdings by asset class */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Legacy (Pre-trade)</h4>
                <HoldingsByAssetClassTable
                  pre
                  holdings={preForAlloc}
                />
              </div>
              {/* Proposed (Post) holdings by asset class */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Proposed (Post-trade)</h4>
                <HoldingsByAssetClassTable
                  pre={false}
                  holdings={postForAlloc}
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
