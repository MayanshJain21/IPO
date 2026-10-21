// Runtime validators for rows the pipeline writes. Derived from the tables, so a new
// column is validated automatically. JSONB columns get their real shape from schemas.ts.
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { Citation, PromiseEvidence, Subscription } from '../schemas';
import { chunks, filings, financials, flags, ipos, promises } from './schema';

const page = Citation.shape.page;

export const insertIpoSchema = createInsertSchema(ipos, {
  subscription: Subscription.nullable().optional(),
  riskScore: z.number().int().min(0).max(100).nullable().optional(),
});
export const insertFilingSchema = createInsertSchema(filings);
export const insertChunkSchema = createInsertSchema(chunks, {
  pageStart: page,
  pageEnd: page,
});
export const insertFinancialSchema = createInsertSchema(financials, { sourcePage: page });
export const insertFlagSchema = createInsertSchema(flags, {
  page: page.nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});
export const insertPromiseSchema = createInsertSchema(promises, {
  page,
  evidence: z.array(PromiseEvidence).optional(),
});
