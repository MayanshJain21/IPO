// npm run download [-- --limit 10 --types drhp,rhp --ipo <slug> --retry-failed --dry-run]
//
// Downloads each 'found' filing's PDF exactly once: SEBI detail page → PDF URL → stream to
// disk while hashing → verify it's a PDF → store under its SHA-256 → status 'downloaded'
// (or 'duplicate' if another filing already has the same bytes, or 'failed' with the reason).
import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { DocumentType } from '@ipo/shared';
import { createDb } from '@ipo/shared/db';
import { z } from 'zod';
import { localFileStore } from '../lib/file-store';
import { isPdf } from '../lib/files';
import { requireEnv } from '../lib/env';
import { downloadToFile } from '../lib/http';
import { fetchSebiPdfUrl } from '../sources/sebi';
import {
  filingsToDownload,
  findBySha,
  recordDownload,
  type DownloadOutcome,
} from '../store/filings';

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '10' }, // be gentle: ~10 MB each
    types: { type: 'string', default: 'drhp,rhp,prospectus,addendum' },
    ipo: { type: 'string' }, // only this IPO (slug)
    'retry-failed': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false }, // resolve PDF URLs, download nothing
  },
});

const types = z.array(DocumentType).parse(args.types.split(',').map((t) => t.trim()));
const limit = z.coerce.number().int().positive().parse(args.limit);
const dryRun = args['dry-run'];

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const { db, sql } = createDb(requireEnv('DATABASE_URL'), { max: 1 });
  const store = localFileStore();

  const queue = await filingsToDownload(db, {
    limit,
    types,
    retryFailed: args['retry-failed'],
    ipoSlug: args.ipo,
  });
  console.log(
    `download: ${queue.length} filing(s) [${types.join(', ')}]${dryRun ? ' (dry run)' : ''}`,
  );

  const stats = { downloaded: 0, duplicate: 0, failed: 0, bytes: 0 };

  for (const [i, f] of queue.entries()) {
    const label = `[${i + 1}/${queue.length}] #${f.id} ${f.docType.padEnd(10)} ${f.companyName}`;
    let pdfUrl: string | null = f.pdfUrl;
    let outcome: DownloadOutcome;

    try {
      pdfUrl ??= await fetchSebiPdfUrl(f.sourceUrl);
      if (!pdfUrl) throw new Error('No PDF link found on the SEBI page');
      if (dryRun) {
        console.log(`${label}\n    ${pdfUrl}`);
        continue;
      }

      const temp = await store.tempPath();
      try {
        const started = Date.now();
        const { sha256, sizeBytes } = await downloadToFile(pdfUrl, temp);
        if (!(await isPdf(temp))) throw new Error('Downloaded file is not a PDF');

        const of = await findBySha(db, sha256, f.id);
        const storagePath = await store.put(temp, sha256);
        const file = { pdfUrl, sha256, sizeBytes, storagePath };
        outcome = of ? { kind: 'duplicate', of, ...file } : { kind: 'downloaded', ...file };

        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `${label}\n    ${outcome.kind}: ${mb(sizeBytes)} in ${secs}s  sha256 ${sha256.slice(0, 12)}…` +
            (of ? `  (same file as #${of})` : ''),
        );
        stats.bytes += sizeBytes;
      } finally {
        await rm(temp, { force: true }); // gone already if stored; cleans up after a failure
      }
    } catch (err) {
      outcome = { kind: 'failed', error: (err as Error).message, pdfUrl };
      console.error(`${label}\n    failed: ${outcome.error}`);
    }

    await recordDownload(db, f.id, outcome);
    stats[outcome.kind]++;
  }

  await sql.end();
  console.log(
    `\ndone: ${stats.downloaded} downloaded, ${stats.duplicate} duplicate, ${stats.failed} failed, ${mb(stats.bytes)} total`,
  );
  if (stats.failed > 0) process.exitCode = 1;
}

await main();
