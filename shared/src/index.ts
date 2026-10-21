// Types and schemas shared by client, server and pipeline.
// Commit #2 adds the Zod schemas for every database table here.

/** Lifecycle of a downloaded DRHP/RHP. Each step is idempotent and resumable. */
export const FILING_STATUSES = ['found', 'downloaded', 'parsed', 'indexed', 'failed'] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

/** Every red-flag check resolves to one of these. Never "buy" / "sell". */
export type FlagLevel = 'green' | 'amber' | 'red';

/** A pointer back into the filing: the core promise of the project. */
export interface Citation {
  page: number;
  section?: string;
}
