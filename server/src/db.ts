import { createDb } from '@ipo/shared/db';

// One pool per process. Null until DATABASE_URL is set, so the API still boots without a DB.
export const database = process.env.DATABASE_URL ? createDb(process.env.DATABASE_URL) : null;

export type DbStatus = 'connected' | 'error' | 'not_configured';

export async function checkDb(): Promise<DbStatus> {
  if (!database) return 'not_configured';
  try {
    await database.sql`select 1`;
    return 'connected';
  } catch {
    return 'error';
  }
}
