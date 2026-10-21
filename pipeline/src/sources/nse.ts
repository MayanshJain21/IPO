// NSE JSON APIs (the same ones nseindia.com's own pages call). Mainboard equity = series "EQ";
// the lists also contain SME, debt and other series, which we drop.
import type { Subscription } from '@ipo/shared';
import { z } from 'zod';
import { fetchJson } from '../lib/http';
import { parseRows } from '../lib/rows';
import {
  cleanCompanyName,
  companySlug,
  parseDate,
  parseNumber,
  parsePriceBand,
  parseRupeesToCrore,
  round2,
} from '../lib/values';

const BASE = 'https://www.nseindia.com/api';
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
};
const TEN_MINUTES = 10 * 60 * 1000;

// --- raw response shapes (Zod at the border: fail loudly if NSE renames a field) ---
// Only fields we actually read are listed: a null in a field we ignore shouldn't reject a row.
const CurrentIssue = z.object({
  symbol: z.string(),
  companyName: z.string(),
  series: z.string(),
  issueStartDate: z.string(),
  issueEndDate: z.string(),
  issuePrice: z.string(),
});
const PastIssue = z.object({
  symbol: z.string(),
  company: z.string(),
  securityType: z.string(),
  ipoStartDate: z.string(),
  ipoEndDate: z.string(),
  priceRange: z.string(),
  listingDate: z.string(),
});
const Detail = z.object({
  issueInfo: z.object({
    dataList: z.array(z.object({ title: z.string().nullable(), value: z.unknown() })),
  }),
});
const Category = z.object({
  updateTime: z.string().optional(),
  dataList: z.array(
    z.object({
      category: z.string(),
      srNo: z.string().nullable(),
      noOfTotalMeant: z.string().nullable().optional(),
    }),
  ),
});

// --- normalised output ---
export interface NseIssue {
  symbol: string;
  companyName: string;
  slug: string;
  openDate: string | null;
  closeDate: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  listingDate: string | null;
}

export interface NseDetail {
  lotSize: number | null;
  faceValue: number | null;
  freshIssueCr: number | null;
  ofsCr: number | null;
  issueSizeCr: number | null;
  leadManagers: string[] | null;
  registrar: string | null;
}

function issue(
  symbol: string,
  name: string,
  open: string,
  close: string,
  price: string,
  listing: string | null,
): NseIssue {
  const band = parsePriceBand(price);
  return {
    symbol,
    companyName: cleanCompanyName(name),
    slug: companySlug(name),
    openDate: parseDate(open),
    closeDate: parseDate(close),
    priceBandLow: band?.[0] ?? null,
    priceBandHigh: band?.[1] ?? null,
    listingDate: parseDate(listing),
  };
}

/** /ipo-current-issue and /all-upcoming-issues share this shape. */
export function parseNseCurrent(json: unknown): NseIssue[] {
  return parseRows(CurrentIssue, json, 'nse current')
    .filter((r) => r.series === 'EQ')
    .map((r) =>
      issue(r.symbol, r.companyName, r.issueStartDate, r.issueEndDate, r.issuePrice, null),
    );
}

export function parseNsePast(json: unknown): NseIssue[] {
  return parseRows(PastIssue, json, 'nse past')
    .filter((r) => r.securityType === 'EQ')
    .map((r) =>
      issue(r.symbol, r.company, r.ipoStartDate, r.ipoEndDate, r.priceRange, r.listingDate),
    );
}

/**
 * Splits NSE's "Issue Size" sentence into fresh issue and OFS, in ₹ crore.
 *   "…Fresh Issue aggregating upto Rs. 5000 million and Offer for Sale … Rs. 9,500 million…"
 * Bracketed details are removed first: "(including Employee Reservation … Rs. 5,000 million)"
 * is a sub-portion, not the issue size. A part stated only in shares
 * ("Offer for Sale of up to 1,23,456 equity shares") has no ₹ amount → null, and then so
 * is the total. Exact figures come from the RHP itself later.
 */
export function parseIssueSize(text: string) {
  const main = text.replace(/\([^)]*\)/g, ' ');
  const ofsAt = main.search(/offer for sale/i);
  const hasOfs = ofsAt >= 0;
  const freshPart = hasOfs ? main.slice(0, ofsAt) : main;
  const hasFresh = /fresh issue/i.test(freshPart);
  const freshIssueCr = hasFresh ? parseRupeesToCrore(freshPart) : null;
  const ofsCr = hasOfs ? parseRupeesToCrore(main.slice(ofsAt)) : null;

  // Total only when every part that exists has a ₹ amount.
  const parts = [...(hasFresh ? [freshIssueCr] : []), ...(hasOfs ? [ofsCr] : [])];
  const issueSizeCr =
    parts.length > 0 && parts.every((p) => p !== null)
      ? round2(parts.reduce<number>((sum, p) => sum + p!, 0))
      : null;

  return { freshIssueCr, ofsCr, issueSizeCr };
}

/** /ipo-detail: a list of {title, value} rows → the fields we keep. */
export function parseNseDetail(json: unknown): NseDetail {
  const rows = new Map<string, string>();
  for (const { title, value } of Detail.parse(json).issueInfo.dataList) {
    if (title)
      rows.set(
        title.trim().toLowerCase(),
        String(value ?? '')
          .replace(/^"|"$/g, '')
          .trim(),
      );
  }
  const get = (key: string) => rows.get(key) ?? null;

  const lot = /([\d,]+)\s*equity shares/i.exec(get('bid lot') ?? '');
  const face = /(\d+(?:\.\d+)?)/.exec(get('face value') ?? '');
  const managers = get('book running lead managers');

  return {
    lotSize: lot ? parseNumber(lot[1]) : null,
    faceValue: face ? parseNumber(face[1]) : null,
    ...parseIssueSize(get('issue size') ?? ''),
    leadManagers: managers
      ? managers
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    registrar: get('name of the registrar'),
  };
}

/** /ipo-active-category: times subscribed per investor category. */
export function parseNseSubscription(json: unknown): Subscription | null {
  const data = Category.parse(json);
  const top = data.dataList.filter(
    (r) => /^\d+$/.test(r.srNo ?? '') || /^total$/i.test(r.category),
  );
  const pick = (re: RegExp) => {
    const row = top.find((r) => re.test(r.category));
    return row ? parseNumber(row.noOfTotalMeant ?? null) : null;
  };

  const sub = {
    qib: pick(/qualified institutional/i),
    nii: pick(/non institutional/i),
    retail: pick(/retail/i),
    employee: pick(/employee/i),
    total: pick(/^total$/i),
  };
  if (Object.values(sub).every((v) => v === null)) return null;
  return { ...sub, updatedAt: parseNseTimestamp(data.updateTime) };
}

/** "Updated as on 21-Oct-2026 16:57:00" (IST) → ISO string. */
function parseNseTimestamp(raw: string | undefined): string {
  const m = /(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{2}:\d{2}:\d{2})/.exec(raw ?? '');
  const day = m ? parseDate(m[1]) : null;
  return day && m ? new Date(`${day}T${m[2]}+05:30`).toISOString() : new Date().toISOString();
}

// --- network ---

/** Current, upcoming and past mainboard issues that closed on/after `since`, one per symbol. */
export async function fetchNseIssues(opts: { since: string }): Promise<NseIssue[]> {
  const current = parseNseCurrent(
    await fetchJson(`${BASE}/ipo-current-issue`, { headers: HEADERS, cacheTtlMs: TEN_MINUTES }),
  );
  const upcoming = parseNseCurrent(
    await fetchJson(`${BASE}/all-upcoming-issues?category=ipo`, {
      headers: HEADERS,
      cacheTtlMs: TEN_MINUTES,
    }),
  );
  const past = parseNsePast(await fetchJson(`${BASE}/public-past-issues`, { headers: HEADERS }));

  // Later entries win: current data is fresher than the past-issues list.
  const bySymbol = new Map<string, NseIssue>();
  for (const i of [...past, ...upcoming, ...current]) {
    const prev = bySymbol.get(i.symbol);
    bySymbol.set(i.symbol, { ...i, listingDate: i.listingDate ?? prev?.listingDate ?? null });
  }
  return [...bySymbol.values()].filter((i) => (i.closeDate ?? i.openDate ?? '9999') >= opts.since);
}

export async function fetchNseDetail(symbol: string): Promise<NseDetail> {
  const url = `${BASE}/ipo-detail?symbol=${encodeURIComponent(symbol)}&series=EQ`;
  return parseNseDetail(await fetchJson(url, { headers: HEADERS }));
}

export async function fetchNseSubscription(symbol: string): Promise<Subscription | null> {
  const url = `${BASE}/ipo-active-category?symbol=${encodeURIComponent(symbol)}`;
  return parseNseSubscription(await fetchJson(url, { headers: HEADERS, cacheTtlMs: TEN_MINUTES }));
}
