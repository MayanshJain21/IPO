// npm run process:new [-- --limit 10 --concurrency 2 --ipo <slug> --retry-failed --reparse --dry-run]
//
// The offline pipeline, run on your laptop: picks up every downloaded filing and takes it
// through each step. Today: parse (Python) → gzipped JSON on disk + sections in Supabase.
// Later commits add steps to this same command: extract financials (#8), red flags (#10),
// index chunks in Qdrant (#12). Safe to re-run: each step only picks filings it hasn't done.
import { parseArgs } from 'node:util';
import { createDb } from '@ipo/shared/db';
import pLimit from 'p-limit';
import { z } from 'zod';
import { requireEnv } from '../lib/env';
import { localFileStore, parsedStore } from '../lib/file-store';
import { writeParsed } from '../parser/parsed-file';
import { runningParsers, runParser } from '../parser/run-parser';
import { filingsToParse, recordParsed, recordParseFailed } from '../store/filings';

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '10' },
    concurrency: { type: 'string', default: '2' }, // parsers run side by side (1 CPU core each)
    ipo: { type: 'string' },
    'retry-failed': { type: 'boolean', default: false },
    reparse: { type: 'boolean', default: false }, // parse again (after a parser improvement)
    'dry-run': { type: 'boolean', default: false },
  },
});

const limit = z.coerce.number().int().positive().parse(args.limit);
const concurrency = z.coerce.number().int().min(1).max(8).parse(args.concurrency);

// Ctrl+C: Windows doesn't stop child processes with the parent, so stop the parsers ourselves.
// The interrupted filings stay 'downloaded' and are picked up next run.
process.on('SIGINT', () => {
  console.log(`\nstopping ${runningParsers.size} running parser(s)…`);
  for (const child of runningParsers) child.kill();
  process.exit(130);
});

async function main() {
  const { db, sql } = createDb(requireEnv('DATABASE_URL'), { max: concurrency + 1 });
  const pdfs = localFileStore();
  const parsed = parsedStore();

  const queue = await filingsToParse(db, {
    limit,
    retryFailed: args['retry-failed'],
    reparse: args.reparse,
    ipoSlug: args.ipo,
  });
  console.log(`process:new: ${queue.length} filing(s) to parse, ${concurrency} at a time`);
  console.log('steps: parse  (extract #8, red flags #10, index #12 come later)\n');

  if (args['dry-run']) {
    for (const f of queue) console.log(`  #${f.id} ${f.docType.padEnd(10)} ${f.companyName}`);
    await sql.end();
    return;
  }

  const stats = { parsed: 0, failed: 0, pages: 0, tables: 0, bytes: 0 };
  let done = 0;
  const started = Date.now();
  const run = pLimit(concurrency);

  await Promise.all(
    queue.map((f) =>
      run(async () => {
        const t0 = Date.now();
        try {
          const result = await runParser(pdfs.resolve(f.storagePath), {
            onLog: (line) => {
              if (!line.startsWith('parsed ')) console.log(`    #${f.id} │ ${line}`);
            },
          });
          const file = await writeParsed(parsed, f.sha256, result);
          await recordParsed(db, f, {
            sections: result.sections,
            pageCount: result.pageCount,
            tableCount: result.tables.length,
            warnings: result.warnings,
            parserVersion: result.parser.version,
            parsePath: file.key,
          });

          stats.parsed++;
          stats.pages += result.pageCount;
          stats.tables += result.tables.length;
          stats.bytes += file.bytes;
          console.log(
            `[${++done}/${queue.length}] #${f.id} ${f.docType.padEnd(10)} ${f.companyName}\n` +
              `    parsed: ${result.pageCount} pages, ${result.sections.length} sections ` +
              `(${result.sectionsSource}), ${result.tables.length} tables in ` +
              `${((Date.now() - t0) / 1000).toFixed(0)}s → ${(file.bytes / 1024).toFixed(0)} KB`,
          );
        } catch (err) {
          const message = (err as Error).message;
          await recordParseFailed(db, f.id, message);
          stats.failed++;
          console.error(
            `[${++done}/${queue.length}] #${f.id} ${f.companyName}\n    failed: ${message}`,
          );
        }
      }),
    ),
  );

  await sql.end();
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  console.log(
    `\ndone in ${minutes} min: ${stats.parsed} parsed, ${stats.failed} failed, ` +
      `${stats.pages} pages, ${stats.tables} tables, ${(stats.bytes / 1048576).toFixed(1)} MB on disk`,
  );
  if (stats.failed > 0) process.exitCode = 1;
}

await main();
