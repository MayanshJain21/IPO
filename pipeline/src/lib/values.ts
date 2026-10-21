// Turns the many ways SEBI, NSE and BSE write the same fact into one standard form.

// --- company names ---

/**
 * Normalises a company name so the same company matches across sources:
 * "NATCO PHARMA LTD", "Natco Pharma Limited" and "Natco Pharma Ltd." → "natco pharma".
 */
export function normaliseCompanyName(raw: string): string {
  return raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\((formerly|earlier)[^)]*\)/g, ' ') // "(formerly known as …)"
    .replace(/&/g, ' and ')
    .replace(/\b(limited|ltd|private|pvt)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** URL-safe key used to match one company across all sources: "natco-pharma". */
export function companySlug(raw: string): string {
  return normaliseCompanyName(raw).replace(/ /g, '-');
}

/** Display name: trims, collapses whitespace, drops "(formerly …)". Keeps the source's casing. */
export function cleanCompanyName(raw: string): string {
  return raw
    .replace(/\((formerly|earlier)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- dates ---

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Parses the date formats the three sources use into "YYYY-MM-DD" (what Postgres `date` wants).
 * Returns null for placeholders like "-" or "".
 */
export function parseDate(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s || s === '-') return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); // 2026-10-21T00:00:00 (BSE)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s); // 21-Oct-2026 / 21-OCT-2026 (NSE)
  if (m) return build(m[3]!, m[2]!, m[1]!);

  m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})$/.exec(s); // Oct 21, 2026 (SEBI)
  if (m) return build(m[3]!, m[1]!, m[2]!);

  return null;
}

function build(year: string, mon: string, day: string): string | null {
  const mm = MONTHS[mon.toLowerCase()];
  return mm ? `${year}-${mm}-${day.padStart(2, '0')}` : null;
}

// --- numbers and money ---

/** "1,20,83,316" → 12083316, "1.2083331E7" → 12083331, "9,500.50" → 9500.5. */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = raw?.replace(/,/g, '').trim();
  if (!s || s === '-' || s.toUpperCase() === 'NA') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNIT_TO_CRORE: Record<string, number> = {
  crore: 1,
  crores: 1,
  cr: 1,
  million: 0.1,
  mn: 0.1,
  lakh: 0.01,
  lakhs: 0.01,
  billion: 100,
};

/** "Rs. 5000 million" → 500 (₹ crore). Returns null if no amount with a unit is found. */
export function parseRupeesToCrore(text: string): number | null {
  const m = /(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)\s*(crores?|cr|million|mn|lakhs?|billion)\b/i.exec(
    text,
  );
  if (!m) return null;
  const n = parseNumber(m[1]);
  const factor = UNIT_TO_CRORE[m[2]!.toLowerCase()];
  return n === null || factor === undefined ? null : round2(n * factor);
}

/** "Rs.660 to Rs.693", "Rs. 660/- to Rs. 693/-", "1065.00 - 1119.00", "750.00" → [low, high]. */
export function parsePriceBand(raw: string | null | undefined): [number, number] | null {
  const nums = (raw ?? '').match(/\d+(?:,\d+)*(?:\.\d+)?/g)?.map((x) => parseNumber(x)!) ?? [];
  if (nums.length === 0) return null;
  const low = nums[0]!;
  const high = nums[1] ?? low; // fixed-price issue: one number
  return low <= high ? [low, high] : [high, low];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today's date as YYYY-MM-DD in India (the exchanges' time zone). */
export function todayIST(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}
