/** Numeric sort key from last 4 digits (e.g. *****5290 -> 5290). */
export function accountLast4SortKey(value: string | null | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits;
  const n = parseInt(last4, 10);
  return Number.isNaN(n) ? null : n;
}

export function compareAccountLast4(
  a: string | null | undefined,
  b: string | null | undefined,
  mult: 1 | -1
): number {
  const ak = accountLast4SortKey(a);
  const bk = accountLast4SortKey(b);
  if (ak === null && bk === null) return 0;
  if (ak === null) return 1;
  if (bk === null) return -1;
  return mult * (ak - bk);
}
