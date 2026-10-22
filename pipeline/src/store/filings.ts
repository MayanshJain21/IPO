// Filing status transitions after discovery:
//   found → downloaded | duplicate | failed   (download step)
//   downloaded → parsed | failed             (parse step)
import type { DocumentType } from '@ipo/shared';
import { filingSections, filings, ipos, type Db, type NewFilingSection } from '@ipo/shared/db';
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';

export interface FilingToDownload {
  id: number;
  docType: DocumentType;
  title: string | null;
  sourceUrl: string;
  pdfUrl: string | null;
  companyName: string;
}

/**
 * 'failed' means different things at different steps; the stored file tells them apart:
 * no storage_path = the download failed; a storage_path = a later step (parsing) failed.
 */
const downloadFailed = and(eq(filings.status, 'failed'), isNull(filings.storagePath));
const parseFailed = and(eq(filings.status, 'failed'), isNotNull(filings.storagePath));

/** Filings waiting for a download, newest first. */
export async function filingsToDownload(
  db: Db,
  opts: { limit: number; types: DocumentType[]; retryFailed: boolean; ipoSlug?: string },
): Promise<FilingToDownload[]> {
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
        opts.retryFailed
          ? or(eq(filings.status, 'found'), downloadFailed)
          : eq(filings.status, 'found'),
        inArray(filings.docType, opts.types),
        opts.ipoSlug ? eq(ipos.slug, opts.ipoSlug) : undefined,
      ),
    )
    .orderBy(sql`${filings.filedOn} desc nulls last`, desc(filings.id))
    .limit(opts.limit);
}

export interface FilingToParse {
  id: number;
  ipoId: number;
  docType: DocumentType;
  sha256: string;
  storagePath: string;
  companyName: string;
}

/**
 * Downloaded filings waiting for the parser, newest first. `retryFailed` adds earlier parse
 * failures; `reparse` adds already-parsed ones (after a parser improvement).
 * Duplicates are skipped: their file is parsed once, under the filing that owns it.
 */
export async function filingsToParse(
  db: Db,
  opts: { limit: number; retryFailed: boolean; reparse: boolean; ipoSlug?: string },
): Promise<FilingToParse[]> {
  const rows = await db
    .select({
      id: filings.id,
      ipoId: filings.ipoId,
      docType: filings.docType,
      sha256: filings.sha256,
      storagePath: filings.storagePath,
      companyName: ipos.companyName,
    })
    .from(filings)
    .innerJoin(ipos, eq(ipos.id, filings.ipoId))
    .where(
      and(
        or(
          eq(filings.status, 'downloaded'),
          opts.retryFailed ? parseFailed : undefined,
          opts.reparse ? eq(filings.status, 'parsed') : undefined,
        ),
        isNotNull(filings.sha256),
        isNotNull(filings.storagePath),
        opts.ipoSlug ? eq(ipos.slug, opts.ipoSlug) : undefined,
      ),
    )
    .orderBy(sql`${filings.filedOn} desc nulls last`, desc(filings.id))
    .limit(opts.limit);
  return rows.map((r) => ({ ...r, sha256: r.sha256!, storagePath: r.storagePath! }));
}

/**
 * Saves a parse in one transaction: replace the filing's sections, then mark it parsed.
 * Either all of it lands or none of it does: never sections without a 'parsed' status.
 */
export async function recordParsed(
  db: Db,
  filing: FilingToParse,
  parse: {
    sections: Omit<NewFilingSection, 'id' | 'filingId' | 'ipoId' | 'ordinal'>[];
    pageCount: number;
    tableCount: number;
    warnings: string[];
    parserVersion: string;
    parsePath: string;
  },
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(filingSections).where(eq(filingSections.filingId, filing.id));
    if (parse.sections.length > 0) {
      await tx.insert(filingSections).values(
        parse.sections.map((s, ordinal) => ({
          ...s,
          filingId: filing.id,
          ipoId: filing.ipoId,
          ordinal,
        })),
      );
    }
    await tx
      .update(filings)
      .set({
        status: 'parsed',
        error: null,
        parsedAt: now,
        pageCount: parse.pageCount,
        tableCount: parse.tableCount,
        parseWarnings: parse.warnings,
        parserVersion: parse.parserVersion,
        parsePath: parse.parsePath,
        updatedAt: now,
      })
      .where(eq(filings.id, filing.id));
  });
}

export async function recordParseFailed(db: Db, id: number, error: string) {
  await db
    .update(filings)
    .set({ status: 'failed', error: `parse: ${error}`, updatedAt: new Date() })
    .where(eq(filings.id, id));
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
