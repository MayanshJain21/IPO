import type { IpoListItem } from '@ipo/shared';
import { filings, ipos } from '@ipo/shared/db';
import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { database } from '../db';

export const iposRouter = Router();

/** GET /api/ipos: every IPO with a summary of its filings, newest activity first. */
iposRouter.get('/', async (_req, res) => {
  if (!database) {
    res.status(503).json({ error: 'Database not configured' });
    return;
  }

  // One query: IPOs LEFT JOIN filings, grouped, so each row carries its filing summary.
  const rows: IpoListItem[] = await database.db
    .select({
      slug: ipos.slug,
      companyName: ipos.companyName,
      status: ipos.status,
      nseSymbol: ipos.nseSymbol,
      openDate: ipos.openDate,
      closeDate: ipos.closeDate,
      listingDate: ipos.listingDate,
      priceBandLow: ipos.priceBandLow,
      priceBandHigh: ipos.priceBandHigh,
      lotSize: ipos.lotSize,
      issueSizeCr: ipos.issueSizeCr,
      subscription: ipos.subscription,
      filingCount: sql<number>`count(${filings.id})::int`,
      docTypes: sql<
        IpoListItem['docTypes']
      >`coalesce(array_agg(distinct ${filings.docType}::text) filter (where ${filings.id} is not null), '{}')`,
      lastFiledOn: sql<string | null>`max(${filings.filedOn})::text`,
      pdfCount: sql<number>`count(${filings.storagePath})::int`,
      parsedCount: sql<number>`(count(*) filter (where ${filings.status} in ('parsed', 'indexed')))::int`,
    })
    .from(ipos)
    .leftJoin(filings, eq(filings.ipoId, ipos.id))
    .groupBy(ipos.id)
    .orderBy(sql`greatest(${ipos.openDate}, max(${filings.filedOn})) desc nulls last`);

  res.json(rows);
});
