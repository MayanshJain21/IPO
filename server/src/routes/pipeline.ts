import { FILING_STATUSES, type PipelineStatus } from '@ipo/shared';
import { filings } from '@ipo/shared/db';
import { count } from 'drizzle-orm';
import { Router } from 'express';
import { database } from '../db';

export const pipelineRouter = Router();

/** GET /api/pipeline: filings per status. Every status is present, zeros included. */
pipelineRouter.get('/', async (_req, res) => {
  if (!database) {
    res.status(503).json({ error: 'Database not configured' });
    return;
  }
  const rows = await database.db
    .select({ status: filings.status, n: count() })
    .from(filings)
    .groupBy(filings.status);

  const status = Object.fromEntries(FILING_STATUSES.map((s) => [s, 0])) as PipelineStatus;
  for (const r of rows) status[r.status] = r.n;
  res.json(status);
});
