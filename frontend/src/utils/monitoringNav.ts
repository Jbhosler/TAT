const MONITORING_TABS = [
  'totalfirm',
  'heatmap',
  'concentration',
  'byadviser',
  'uploadchanges',
  'unusedequivalents',
  'equivalentreview',
] as const;

export type MonitoringTab = (typeof MONITORING_TABS)[number];

export function parseMonitoringTab(value: string | null): MonitoringTab {
  if (value && (MONITORING_TABS as readonly string[]).includes(value)) {
    return value as MonitoringTab;
  }
  return 'totalfirm';
}

/** Build /monitoring path preserving tab and historical context. */
export function monitoringListPath(params: URLSearchParams): string {
  const tab = params.get('tab');

  const next = new URLSearchParams();
  if (tab) next.set('tab', tab);
  const adviser = params.get('adviser');
  if (adviser) next.set('adviser', adviser);
  const asOfDate = params.get('as_of_date');
  if (asOfDate) next.set('as_of_date', asOfDate);
  const q = next.toString();
  return q ? `/monitoring?${q}` : '/monitoring';
}

/** Build account drill-down path with return context in query string. */
export function monitoringAccountPath(accountId: string, returnParams: URLSearchParams): string {
  const next = new URLSearchParams(returnParams);
  if (!next.get('tab')) next.set('tab', 'byadviser');
  const q = next.toString();
  return q ? `/monitoring/account/${accountId}?${q}` : `/monitoring/account/${accountId}`;
}
