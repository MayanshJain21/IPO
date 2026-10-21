import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't read .env itself; Node's built-in loader does it without dotenv.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './shared/src/db/schema.ts',
  out: './supabase/migrations',
  migrations: { prefix: 'supabase' }, // timestamped file names the Supabase CLI also accepts
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
