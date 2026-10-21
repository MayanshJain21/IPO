// BSE public issues API (what bseindia.com's Angular app calls). Covers open/recent issues
// only, so it's a cross-check and fallback for NSE, not the main source.
import { z } from 'zod';
import { fetchJson } from '../lib/http';
import { parseRows } from '../lib/rows';
import { cleanCompanyName, companySlug, parseDate, parsePriceBand } from '../lib/values';

const URL_ISSUES =
  'https://api.bseindia.com/BseIndiaAPI/api/GetPublicIssue_par_updated/w?flag=1&status=&exchange=&ir_flag=';
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.bseindia.com/',
  Origin: 'https://www.bseindia.com',
};

const Issue = z.object({
  Scrip_Name: z.string(),
  Start_Dt: z.string().nullable(),
  End_Dt: z.string().nullable(),
  Price_Band: z.string().nullable(),
  Face_Val: z.number().nullable(),
  IR_flag: z.string().nullable(),
  eXCHANGE_PLATFORM: z.string().nullable(),
});
const Response = z.object({ Table: z.array(z.unknown()) });

export interface BseIssue {
  companyName: string;
  slug: string;
  openDate: string | null;
  closeDate: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  faceValue: number | null;
}

/** Keeps mainboard IPOs only (drops rights issues "RI", buybacks, SME, debt). */
export function parseBseIssues(json: unknown): BseIssue[] {
  return parseRows(Issue, Response.parse(json).Table, 'bse issues')
    .filter((r) => r.IR_flag === 'IPO' && r.eXCHANGE_PLATFORM === 'MainBoard')
    .map((r) => {
      const band = parsePriceBand(r.Price_Band);
      return {
        companyName: cleanCompanyName(r.Scrip_Name),
        slug: companySlug(r.Scrip_Name),
        openDate: parseDate(r.Start_Dt),
        closeDate: parseDate(r.End_Dt),
        priceBandLow: band?.[0] ?? null,
        priceBandHigh: band?.[1] ?? null,
        faceValue: r.Face_Val,
      };
    });
}

export async function fetchBseIssues(): Promise<BseIssue[]> {
  const json = await fetchJson(URL_ISSUES, {
    headers: HEADERS,
    lenientHeaders: true, // BSE's edge sends a malformed header line; see lib/http.ts
    cacheTtlMs: 30 * 60 * 1000,
  });
  return parseBseIssues(json);
}
