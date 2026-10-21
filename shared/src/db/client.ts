import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Creates a Drizzle client. `prepare: false` keeps it compatible with Supabase's
 * transaction pooler (port 6543), which doesn't support prepared statements.
 */
export function createDb(databaseUrl: string, options: { max?: number } = {}) {
  const sql = postgres(databaseUrl, { prepare: false, max: options.max ?? 5 });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>['db'];
