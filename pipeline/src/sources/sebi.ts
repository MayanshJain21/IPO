// SEBI → Filings → Public Issues. Server-rendered HTML lists, 25 rows per page, newest first.
// Page N comes from an AJAX POST (getnewslistinfo.jsp) with nextValue = N - 1.
import type { DocumentType } from '@ipo/shared';
import * as cheerio from 'cheerio';
import { politeFetch } from '../lib/http';
import { cleanCompanyName, companySlug, parseDate } from '../lib/values';

/** The three Public Issues sub-lists we read, keyed by the doc type they mostly contain. */
export const SEBI_LISTS = { drhp: 10, rhp: 11, prospectus: 12 } as const;
type SebiList = keyof typeof SEBI_LISTS;

const LIST_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=';
const AJAX_URL = 'https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp';

export interface SebiFiling {
  companyName: string;
  slug: string;
  docType: DocumentType;
  /** Raw title, e.g. "Paramotor Digital Technology Limited – UDRHP-I" */
  title: string;
  filedOn: string;
  /** SEBI detail page; the PDF link inside it is resolved when downloading (commit #4). */
  sourceUrl: string;
}

// Trusts and funds also file offer documents with SEBI; they aren't company IPOs.
const NOT_A_COMPANY = /\b(invit|reit|investment trust|mutual fund)\b/i;

/** Pure parser: one listing page (full page or AJAX fragment) → filings. */
export function parseSebiListing(html: string, list: SebiList): SebiFiling[] {
  const $ = cheerio.load(html);
  const out: SebiFiling[] = [];

  $('tr[role=row]').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return; // header row uses <th>

    const filedOn = parseDate(cells.eq(0).text());
    // The row's first <a> is the filing; a nested <a> (abridged prospectus) follows it.
    const link = cells.eq(1).find('a').first();
    const href = link.attr('href');
    const title = link.contents().first().text().replace(/\s+/g, ' ').trim();
    if (!filedOn || !href || !title) return;

    const parsed = splitTitle(title);
    if (NOT_A_COMPANY.test(parsed.company)) return;

    out.push({
      companyName: cleanCompanyName(parsed.company),
      slug: companySlug(parsed.company),
      docType: docTypeFromLabel(parsed.label, list),
      title,
      filedOn,
      sourceUrl: new URL(href, 'https://www.sebi.gov.in').toString(),
    });
  });

  return out;
}

/**
 * "Acme Limited – UDRHP-I" → { company: "Acme Limited", label: "UDRHP-I" }.
 * Titles are typed by hand, so the separator varies: "Acme Limited- DRHP", "Acme Limited : RHP".
 * A separator is a dash or colon with whitespace on at least one side, which keeps hyphens
 * inside names ("A-One Steels") intact. Splits on the FIRST one: labels can contain dashes
 * ("Addendum - II to DRHP"). Some titles have no label at all: label is then "".
 */
export function splitTitle(title: string): { company: string; label: string } {
  const m = /^(.*?\S)(?:\s*[–—:-]\s+|\s+[–—-]\s*)(.+)$/.exec(title);
  return m ? { company: m[1]!, label: m[2]! } : { company: title.trim(), label: '' };
}

/** Order matters: "Addendum to DRHP" contains "DRHP"; "Draft Red Herring Prospectus" contains "Prospectus". */
export function docTypeFromLabel(label: string, list: SebiList): DocumentType {
  if (/addendum|corrigendum/i.test(label)) return 'addendum';
  if (/\bu?drhp\b|draft red herring|draft offer/i.test(label)) return 'drhp';
  if (/\brhp\b|red herring/i.test(label)) return 'rhp';
  if (/prospectus/i.test(label)) return 'prospectus';
  return list;
}

function ajaxBody(smid: number, pageIndex: number): string {
  return new URLSearchParams({
    nextValue: String(pageIndex),
    next: 'n',
    search: '',
    fromDate: '',
    toDate: '',
    fromYear: '',
    toYear: '',
    deptId: '-1',
    sid: '3',
    ssid: '15',
    smid: String(smid),
    ssidhidden: '15',
    intmid: '-1',
    sText: 'Filings',
    ssText: '-1',
    smText: '',
    doDirect: '-1',
  }).toString();
}

/**
 * Walks each list newest → oldest until it reaches filings older than `since` or `maxPages`.
 * Returns every filing on or after `since` (YYYY-MM-DD).
 */
export async function fetchSebiFilings(opts: {
  since: string;
  maxPages: number;
}): Promise<SebiFiling[]> {
  const all: SebiFiling[] = [];

  for (const [list, smid] of Object.entries(SEBI_LISTS) as [SebiList, number][]) {
    for (let page = 1; page <= opts.maxPages; page++) {
      const html = await politeFetch(AJAX_URL, {
        method: 'POST',
        body: ajaxBody(smid, page - 1),
        headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: LIST_URL + smid },
        cacheTtlMs: 3 * 60 * 60 * 1000,
      });
      const rows = parseSebiListing(html, list);
      if (rows.length === 0) break;

      all.push(...rows.filter((r) => r.filedOn >= opts.since));
      const oldest = rows.at(-1)!.filedOn;
      console.log(`  sebi ${list} page ${page}: ${rows.length} rows (back to ${oldest})`);
      if (oldest < opts.since) break; // lists are newest first: nothing newer further down
    }
  }

  return all;
}
