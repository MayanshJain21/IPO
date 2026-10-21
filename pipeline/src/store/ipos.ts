// Writes scraped data. Every write is an upsert, so re-running the scraper is always safe.
import type { IssueStatus } from '@ipo/shared';
import {
  filings,
  insertFilingSchema,
  insertIpoSchema,
  ipos,
  type Db,
  type NewFiling,
  type NewIpo,
} from '@ipo/shared/db';
import { getTableColumns, sql, type SQL } from 'drizzle-orm';

export type IpoInput = Pick<NewIpo, 'slug' | 'companyName'> &
  Partial<Omit<NewIpo, 'id' | 'slug' | 'companyName' | 'createdAt' | 'updatedAt'>>;

export interface UpsertResult {
  id: number;
  created: boolean;
}

/**
 * Inserts an IPO, or merges into the existing row with the same slug.
 * Merge rule: a column is only overwritten when the new value is not null, so a source
 * that doesn't know (say) the lot size can't erase what another source found.
 */
export async function upsertIpo(db: Db, input: IpoInput): Promise<UpsertResult> {
  const row = insertIpoSchema.parse(input); // Zod at the border, before anything is written
  const columns = getTableColumns(ipos);

  const set: Record<string, SQL> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || key === 'slug' || key === 'companyName') continue;
    const column = columns[key as keyof typeof columns];
    set[key] = sql.raw(`excluded."${column.name}"`); // "excluded" = the row we tried to insert
  }
  // Keep a properly cased name over an ALL-CAPS one (SEBI often writes "ACME LIMITED").
  set.companyName = sql.raw(
    `case when "ipos"."company_name" = upper("ipos"."company_name") then excluded."company_name" else "ipos"."company_name" end`,
  );
  set.updatedAt = sql`now()`;

  const [result] = await db
    .insert(ipos)
    .values(row)
    .onConflictDoUpdate({ target: ipos.slug, set })
    // xmax = 0 only for a freshly inserted row: a cheap way to tell insert from update
    .returning({ id: ipos.id, created: sql<boolean>`(xmax = 0)` });
  return result!;
}

/** Logs a filing once per source URL. Never touches `status`: that belongs to later steps. */
export async function upsertFiling(
  db: Db,
  input: Pick<NewFiling, 'ipoId' | 'docType' | 'title' | 'filedOn' | 'sourceUrl'>,
): Promise<UpsertResult> {
  const row = insertFilingSchema.parse(input);
  const [result] = await db
    .insert(filings)
    .values(row)
    .onConflictDoUpdate({
      target: filings.sourceUrl,
      set: {
        title: sql`excluded."title"`,
        filedOn: sql`excluded."filed_on"`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: filings.id, created: sql<boolean>`(xmax = 0)` });
  return result!;
}

/** Issue status from dates. Returns undefined when the dates can't tell (leave it as is). */
export function deriveIssueStatus(
  d: { openDate: string | null; closeDate: string | null; listingDate: string | null },
  today: string,
): IssueStatus | undefined {
  if (d.listingDate && d.listingDate <= today) return 'listed';
  if (!d.openDate || !d.closeDate) return undefined;
  if (today < d.openDate) return 'upcoming';
  if (today <= d.closeDate) return 'open';
  return 'closed';
}
