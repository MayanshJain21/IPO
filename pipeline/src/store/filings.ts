// Filing status transitions after discovery: found → downloaded | duplicate | failed.
import type { DocumentType } from '@ipo/shared';
import { filings, ipos, type Db } from '@ipo/shared/db';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

export interface FilingToDownload {
  id: number;
  docType: DocumentType;
  title: string | null;
  sourceUrl: string;
  pdfUrl: string | null;
  companyName: string;
}

/** Filings waiting for a download, newest first. */
export async function filingsToDownload(
  db: Db,
  opts: { limit: number; types: DocumentType[]; retryFailed: boolean; ipoSlug?: string },
): Promise<FilingToDownload[]> {
  const statuses = opts.retryFailed ? (['found', 'failed'] as const) : (['found'] as const);
  return db
    .select({
      id: filings.id,
      docType: filings.docType,
      title: filings.title,
      sourceUrl: filings.sourceUrl,
      pdfUrl: filings.pdfUrl,
      companyName: ipos.companyName,
    })
    .from(filings)
    .innerJoin(ipos, eq(ipos.id, filings.ipoId))
    .where(
      and(
        inArray(filings.status, [...statuses]),
        inArray(filings.docType, opts.types),
        opts.ipoSlug ? eq(ipos.slug, opts.ipoSlug) : undefined,
      ),
    )
    .orderBy(sql`${filings.filedOn} desc nulls last`, desc(filings.id))
    .limit(opts.limit);
}

/** Id of another filing that already holds this exact file, if any. */
export async function findBySha(db: Db, sha256: string, exceptId?: number) {
  const [row] = await db
    .select({ id: filings.id })
    .from(filings)
    .where(and(eq(filings.sha256, sha256), exceptId ? ne(filings.id, exceptId) : undefined))
    .limit(1);
  return row?.id ?? null;
}

interface StoredFile {
  pdfUrl: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
}

export type DownloadOutcome =
  | ({ kind: 'downloaded' } & StoredFile)
  | ({ kind: 'duplicate'; of: number } & StoredFile)
  | { kind: 'failed'; error: string; pdfUrl: string | null };

export async function recordDownload(db: Db, id: number, outcome: DownloadOutcome) {
  const now = new Date();
  const update =
    outcome.kind === 'failed'
      ? { status: 'failed' as const, error: outcome.error, pdfUrl: outcome.pdfUrl }
      : {
          status: outcome.kind,
          // sha256 is UNIQUE: only the first filing with these bytes owns it.
          sha256: outcome.kind === 'downloaded' ? outcome.sha256 : null,
          error: outcome.kind === 'duplicate' ? `same file as filing #${outcome.of}` : null,
          pdfUrl: outcome.pdfUrl,
          storagePath: outcome.storagePath,
          sizeBytes: outcome.sizeBytes,
          downloadedAt: now,
        };
  await db
    .update(filings)
    .set({ ...update, updatedAt: now })
    .where(eq(filings.id, id));
}

/** Admin fallback: registers a PDF that came from somewhere other than the SEBI list. */
export async function insertUploadedFiling(
  db: Db,
  input: {
    ipoId: number;
    docType: DocumentType;
    title: string | null;
    filedOn: string | null;
    sha256: string;
    sizeBytes: number;
    storagePath: string;
  },
) {
  const [row] = await db
    .insert(filings)
    .values({
      ...input,
      sourceUrl: `upload://sha256/${input.sha256}`, // unique, and says where it came from
      status: 'downloaded',
      downloadedAt: new Date(),
    })
    .returning({ id: filings.id });
  return row!.id;
}
