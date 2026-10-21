// npm run scrape [-- --since 2026-09-01 --pages 4 --dry-run --no-cache]
//
// Finds new IPO filings on SEBI and issue details on BSE and NSE, and upserts them into
// `ipos` and `filings` (status 'found'). Safe to re-run: every write is an upsert.
// Order matters: later sources overwrite earlier ones (non-null values only), so the most
// detailed source (NSE) runs last.
import { parseArgs } from 'node:util';
import { createDb, type Db } from '@ipo/shared/db';
import { setCacheEnabled } from '../lib/http';
import { todayIST } from '../lib/values';
import { fetchBseIssues } from '../sources/bse';
import { fetchNseDetail, fetchNseIssues, fetchNseSubscription } from '../sources/nse';
import { fetchSebiFilings } from '../sources/sebi';
import { deriveIssueStatus, upsertFiling, upsertIpo, type IpoInput } from '../store/ipos';

const { values: args } = parseArgs({
  options: {
    since: { type: 'string' }, // YYYY-MM-DD; default: 30 days ago
    pages: { type: 'string', default: '4' }, // max SEBI pages per list (25 rows each)
    'dry-run': { type: 'boolean', default: false }, // fetch and parse, write nothing
    'no-cache': { type: 'boolean', default: false },
  },
});

const today = todayIST();
const since = args.since ?? todayIST(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--since must be YYYY-MM-DD, got ${since}`);
const maxPages = Number(args.pages);
const dryRun = args['dry-run'];
if (args['no-cache']) setCacheEnabled(false);

interface Stats {
  seen: number;
  iposCreated: number;
  iposUpdated: number;
  filingsCreated: number;
  warnings: number;
  error?: string;
}
const summary: Record<string, Stats> = {};

/** Runs one source in isolation: if it fails, the others still run. */
async function runSource(name: string, fn: (s: Stats) => Promise<void>) {
  const stats: Stats = { seen: 0, iposCreated: 0, iposUpdated: 0, filingsCreated: 0, warnings: 0 };
  summary[name] = stats;
  console.log(`\n[${name}]`);
  try {
    await fn(stats);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`  ${name} failed: ${message}`);
    stats.error = message.split('\n')[0]!.slice(0, 100); // short version for the summary table
  }
}

async function saveIpo(db: Db | null, stats: Stats, input: IpoInput) {
  if (!db) return null;
  const res = await upsertIpo(db, input);
  if (res.created) stats.iposCreated++;
  else stats.iposUpdated++;
  return res;
}

async function main() {
  console.log(`scrape: since ${since}, today ${today}${dryRun ? ' (dry run: no writes)' : ''}`);
  const conn = dryRun ? null : createDb(requireEnv('DATABASE_URL'), { max: 1 });
  const db = conn?.db ?? null;

  await runSource('sebi', async (stats) => {
    const found = await fetchSebiFilings({ since, maxPages });
    stats.seen = found.length;
    for (const f of found) {
      const ipo = await saveIpo(db, stats, { slug: f.slug, companyName: f.companyName });
      if (!db || !ipo) continue;
      const filing = await upsertFiling(db, {
        ipoId: ipo.id,
        docType: f.docType,
        title: f.title,
        filedOn: f.filedOn,
        sourceUrl: f.sourceUrl,
      });
      if (filing.created) stats.filingsCreated++;
    }
    if (dryRun)
      for (const f of found.slice(0, 5))
        console.log(`  ${f.filedOn} ${f.docType.padEnd(10)} ${f.companyName}`);
  });

  await runSource('bse', async (stats) => {
    const issues = (await fetchBseIssues()).filter((i) => (i.closeDate ?? '9999') >= since);
    stats.seen = issues.length;
    for (const i of issues) {
      await saveIpo(db, stats, {
        slug: i.slug,
        companyName: i.companyName,
        openDate: i.openDate,
        closeDate: i.closeDate,
        priceBandLow: i.priceBandLow,
        priceBandHigh: i.priceBandHigh,
        faceValue: i.faceValue,
        status: deriveIssueStatus({ ...i, listingDate: null }, today),
      });
      if (dryRun) console.log(`  ${i.openDate} → ${i.closeDate}  ${i.companyName}`);
    }
  });

  await runSource('nse', async (stats) => {
    const issues = await fetchNseIssues({ since });
    stats.seen = issues.length;
    for (const i of issues) {
      const status = deriveIssueStatus(i, today);
      // Detail and subscription are per-issue calls; one failure shouldn't stop the rest.
      const detail = await fetchNseDetail(i.symbol).catch((err: Error) => {
        stats.warnings++;
        console.warn(`  ${i.symbol}: no detail (${err.message})`);
        return null;
      });
      const recentlyClosed = status === 'closed' && (i.closeDate ?? '') >= daysAgo(7);
      const subscription =
        status === 'open' || recentlyClosed
          ? await fetchNseSubscription(i.symbol).catch(() => {
              stats.warnings++;
              return null;
            })
          : null;

      await saveIpo(db, stats, {
        slug: i.slug,
        companyName: i.companyName,
        nseSymbol: i.symbol,
        status,
        openDate: i.openDate,
        closeDate: i.closeDate,
        listingDate: i.listingDate,
        priceBandLow: i.priceBandLow,
        priceBandHigh: i.priceBandHigh,
        ...(detail ?? {}),
        subscription,
      });
      if (dryRun) {
        const total = subscription?.total != null ? `${subscription.total.toFixed(2)}x` : '-';
        console.log(
          `  ${(status ?? '?').padEnd(8)} ${i.symbol.padEnd(12)} lot ${detail?.lotSize ?? '-'}  ` +
            `₹${detail?.issueSizeCr ?? '-'} cr  sub ${total}  ${i.companyName}`,
        );
      }
    }
  });

  await conn?.sql.end();

  console.log('\nsummary');
  console.table(summary);
  if (Object.values(summary).some((s) => s.error)) process.exitCode = 1;
}

function daysAgo(n: number) {
  return todayIST(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

await main();
