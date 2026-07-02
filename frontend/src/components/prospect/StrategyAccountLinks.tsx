import { useEffect, useState } from 'react';
import { prospectsAPI } from '../../services/api';

type AccountLink = {
  strategy_id: string;
  strategy_name: string | null;
  monitored_account_id: string | null;
  account_display: string | null;
};

type LinkableAccount = {
  id: string;
  synthetic_id: string;
  friendly_name: string | null;
  account_display: string | null;
};

interface Props {
  prospectId: string;
}

const StrategyAccountLinks = ({ prospectId }: Props) => {
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [optionsByStrategy, setOptionsByStrategy] = useState<Record<string, LinkableAccount[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await prospectsAPI.getStrategyAccountLinks(prospectId);
      const rows: AccountLink[] = res.data || [];
      setLinks(rows);
      const opts: Record<string, LinkableAccount[]> = {};
      await Promise.all(
        rows.map(async (row) => {
          const accRes = await prospectsAPI.getLinkableAccounts(prospectId, row.strategy_id);
          opts[row.strategy_id] = accRes.data || [];
        })
      );
      setOptionsByStrategy(opts);
    } catch (err) {
      console.error('Failed to load strategy account links:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [prospectId]);

  const handleChange = (strategyId: string, accountId: string) => {
    setLinks((prev) =>
      prev.map((row) =>
        row.strategy_id === strategyId
          ? {
              ...row,
              monitored_account_id: accountId || null,
              account_display: null,
            }
          : row
      )
    );
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await prospectsAPI.updateStrategyAccountLinks(
        prospectId,
        links.map((l) => ({
          strategy_id: l.strategy_id,
          monitored_account_id: l.monitored_account_id,
        }))
      );
      await load();
      setMessage('Account links saved.');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save account links');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading account links…</p>;
  }

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Link funded accounts (optional)</h3>
        <p className="text-xs text-gray-500 mt-1">
          After the client funds, each strategy typically has its own Envestnet account number.
          Link each target strategy to the matching monitored account.
        </p>
      </div>
      {links.map((row) => (
        <div key={row.strategy_id} className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-800 min-w-[140px]">
            {row.strategy_name || row.strategy_id}
          </span>
          <select
            className="min-w-[240px] rounded-md border-gray-300 shadow-sm text-sm"
            value={row.monitored_account_id || ''}
            onChange={(e) => handleChange(row.strategy_id, e.target.value)}
          >
            <option value="">— Not linked —</option>
            {(optionsByStrategy[row.strategy_id] || []).map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.friendly_name || acc.synthetic_id}
                {acc.account_display ? ` (${acc.account_display})` : ''}
              </option>
            ))}
          </select>
          {(optionsByStrategy[row.strategy_id] || []).length === 0 && (
            <span className="text-xs text-amber-700">No monitored accounts for this strategy</span>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="py-1.5 px-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save account links'}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
      </div>
    </div>
  );
};

export default StrategyAccountLinks;
