/**
 * Format a calendar date (YYYY-MM-DD) for display without UTC timezone shift.
 * `new Date('2026-07-01')` parses as UTC midnight and shows as the prior day in US timezones.
 */
export function formatIsoDate(
  iso: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return '—';
  const datePart = iso.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', options);
}
