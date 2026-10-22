// npm run upload -- --ipo <slug> --type drhp --file path/to/file.pdf [--title "Part 2 of 3"] [--filed-on 2026-10-21]
//
// Admin fallback for filings the scraper can't fetch: a DRHP split into several PDFs, a
// scanned file, a document from elsewhere. Same rules as download: hashed, stored once
// under its SHA-256, registered as a 'downloaded' filing of that IPO.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DocumentType } from '@ipo/shared';
import { createDb, ipos } from '@ipo/shared/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireEnv } from '../lib/env';
import { localFileStore } from '../lib/file-store';
import { hashFile, isPdf } from '../lib/files';
import { findBySha, insertUploadedFiling } from '../store/filings';

const { values: args } = parseArgs({
  options: {
    ipo: { type: 'string' },
    type: { type: 'string' },
    file: { type: 'string' },
    title: { type: 'string' },
    'filed-on': { type: 'string' },
  },
});

const input = z
  .object({
    ipo: z.string().min(1, '--ipo <slug> is required'),
    type: DocumentType,
    file: z.string().min(1, '--file <path.pdf> is required'),
    title: z.string().optional(),
    'filed-on': z.iso.date().optional(),
  })
  .parse(args);

async function main() {
  // npm runs workspace scripts inside pipeline/; INIT_CWD is where you typed the command,
  // so a relative --file path means what you'd expect.
  const file = path.resolve(process.env.INIT_CWD ?? process.cwd(), input.file);
  if (!(await isPdf(file))) throw new Error(`${file} is not a PDF`);
  const { sha256, sizeBytes } = await hashFile(file);

  const { db, sql } = createDb(requireEnv('DATABASE_URL'), { max: 1 });
  try {
    const existing = await findBySha(db, sha256);
    if (existing) {
      console.log(`Already stored as filing #${existing} (same SHA-256). Nothing to do.`);
      return;
    }

    const [ipo] = await db.select({ id: ipos.id }).from(ipos).where(eq(ipos.slug, input.ipo));
    if (!ipo) throw new Error(`No IPO with slug "${input.ipo}". Check GET /api/ipos for slugs.`);

    const storagePath = await localFileStore().putCopy(file, sha256);
    const id = await insertUploadedFiling(db, {
      ipoId: ipo.id,
      docType: input.type,
      title: input.title ?? null,
      filedOn: input['filed-on'] ?? null,
      sha256,
      sizeBytes,
      storagePath,
    });
    console.log(`Stored as filing #${id}: ${storagePath} (${(sizeBytes / 1048576).toFixed(1)} MB)`);
  } finally {
    await sql.end();
  }
}

await main();
