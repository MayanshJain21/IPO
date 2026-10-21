const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "2026-10-21" → "21 Oct 2026". Parsed as a calendar date, so time zones can't shift it. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(y!, m! - 1, d!));
}

/** 1450 → "₹1,450 cr" (Indian digit grouping). */
export const formatCrore = (n: number | null) => (n === null ? '—' : `₹${numFmt.format(n)} cr`);

export function formatBand(low: number | null, high: number | null): string {
  if (low === null || high === null) return '—';
  return low === high ? `₹${numFmt.format(low)}` : `₹${numFmt.format(low)}–${numFmt.format(high)}`;
}

/** Times subscribed: 135.9 → "135.90×". */
export const formatTimes = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}×`);
