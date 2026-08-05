import { useEffect, useState } from 'react';
import { prospectsAPI } from '../../services/api';

export interface ClassifyResult {
  side_pocket_count: number;
  rebalanceable_count: number;
}

interface HoldingRow {
  id: string;
  ticker: string;
  value: string | number;
  unrealized_gain_loss: string | number;
  is_side_pocket: boolean;
}

interface Props {
  prospectId: string;
  onComplete: (result: ClassifyResult) => void;
}

const fmtMoney = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const ClassifyHoldingsPanel = ({ prospectId, onComplete }: Props) => {
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [sidePocketIds, setSidePocketIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await prospectsAPI.getHoldings(prospectId);
        const rows = res.data as HoldingRow[];
        if (cancelled) return;
        setHoldings(rows);
        setSidePocketIds(
          new Set(rows.filter((h) => h.is_side_pocket).map((h) => h.id))
        );
      } catch (e: any) {
        if (!cancelled) {
          setError(e.response?.data?.detail || e.message || 'Failed to load holdings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectId]);

  const toggleSidePocket = (id: string) => {
    setSidePocketIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await prospectsAPI.classify(
        prospectId,
        Array.from(sidePocketIds)
      );
      onComplete({
        side_pocket_count: res.data.side_pocket_count,
        rebalanceable_count: res.data.rebalanceable_count,
      });
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to save classification');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-gray-600">Loading holdings…</p>
    );
  }

  if (error && holdings.length === 0) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
    );
  }

  const spCount = sidePocketIds.size;
  const rbCount = holdings.length - spCount;
  const totalValue = holdings.reduce((sum, h) => sum + (Number(h.value) || 0), 0);
  const sidePocketValue = holdings
    .filter((h) => sidePocketIds.has(h.id))
    .reduce((sum, h) => sum + (Number(h.value) || 0), 0);

  const selectNone = () => setSidePocketIds(new Set());
  const selectAll = () => setSidePocketIds(new Set(holdings.map((h) => h.id)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Mark holdings that should stay in the <strong>side pocket</strong> (excluded from transition
        math). Leave unchecked for holdings you will associate to the model in the next step. You can
        revisit this any time before the final proposal.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-700">
          Side pocket: <strong>{spCount}</strong> (${fmtMoney(sidePocketValue)}) · To associate:{' '}
          <strong>{rbCount}</strong> (${fmtMoney(totalValue - sidePocketValue)})
        </p>
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            disabled={saving}
            onClick={selectNone}
            className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            Clear all
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={selectAll}
            className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            Mark all side pocket
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"
              >
                Side pocket
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ticker
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value ($)
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unrealized G/L ($)
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {holdings.map((h) => (
              <tr
                key={h.id}
                className={sidePocketIds.has(h.id) ? 'bg-amber-50/40' : undefined}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    disabled={saving}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={sidePocketIds.has(h.id)}
                    onChange={() => toggleSidePocket(h.id)}
                    aria-label={`Side pocket ${h.ticker}`}
                  />
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{h.ticker}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                  {fmtMoney(h.value)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                  {fmtMoney(h.unrealized_gain_loss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={saving || holdings.length === 0}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save classification & continue'}
      </button>
    </div>
  );
};

export default ClassifyHoldingsPanel;
