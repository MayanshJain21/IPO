// Row types inferred from the Drizzle tables. Imported with `import type`, so they
// are erased at build time: the browser bundle never contains Drizzle or postgres.
import type { chunks, filings, financials, flags, ipos, promises } from './schema';

export type Ipo = typeof ipos.$inferSelect;
export type NewIpo = typeof ipos.$inferInsert;
export type Filing = typeof filings.$inferSelect;
export type NewFiling = typeof filings.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type Financial = typeof financials.$inferSelect;
export type NewFinancial = typeof financials.$inferInsert;
export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type PromiseRow = typeof promises.$inferSelect; // "Promise" would shadow the JS built-in
export type NewPromiseRow = typeof promises.$inferInsert;
