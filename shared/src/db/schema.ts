// Postgres schema. drizzle-kit reads this file to generate SQL migrations.
// Conventions:
//   - All money columns are ₹ crore (the pipeline normalises lakh/million on the way in).
//   - Every fact derived from a filing keeps the page it came from.
//   - RLS is enabled with no policies: Supabase's public REST API (anon key) sees nothing.
//     Our server and pipeline connect directly as the postgres role, which bypasses RLS.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  DETECTION_METHODS,
  DOCUMENT_TYPES,
  FILING_STATUSES,
  FLAG_CHECK_CODES,
  FLAG_LEVELS,
  ISSUE_STATUSES,
  PROMISE_CATEGORIES,
  PROMISE_STATUSES,
} from '../constants';
import type { PromiseEvidence, Subscription } from '../schemas';

// --- enums ---
export const filingStatus = pgEnum('filing_status', FILING_STATUSES);
export const documentType = pgEnum('document_type', DOCUMENT_TYPES);
export const issueStatus = pgEnum('issue_status', ISSUE_STATUSES);
export const flagLevel = pgEnum('flag_level', FLAG_LEVELS);
export const flagCheck = pgEnum('flag_check', FLAG_CHECK_CODES);
export const detectionMethod = pgEnum('detection_method', DETECTION_METHODS);
export const promiseCategory = pgEnum('promise_category', PROMISE_CATEGORIES);
export const promiseStatus = pgEnum('promise_status', PROMISE_STATUSES);

// --- shared column helpers ---
const crore = (name: string) => numeric(name, { precision: 16, scale: 2, mode: 'number' });
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// --- ipos: one row per company issue; the header of every IPO page ---
export const ipos = pgTable(
  'ipos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(), // URL: /ipo/<slug>
    companyName: text('company_name').notNull(),
    sector: text('sector'),
    status: issueStatus('status').notNull().default('upcoming'),
    nseSymbol: text('nse_symbol'),
    bseCode: text('bse_code'),

    priceBandLow: numeric('price_band_low', { precision: 12, scale: 2, mode: 'number' }),
    priceBandHigh: numeric('price_band_high', { precision: 12, scale: 2, mode: 'number' }),
    faceValue: numeric('face_value', { precision: 10, scale: 2, mode: 'number' }),
    lotSize: integer('lot_size'),
    issueSizeCr: crore('issue_size_cr'),
    freshIssueCr: crore('fresh_issue_cr'),
    ofsCr: crore('ofs_cr'),

    openDate: date('open_date'),
    closeDate: date('close_date'),
    allotmentDate: date('allotment_date'),
    listingDate: date('listing_date'),
    listingPrice: numeric('listing_price', { precision: 12, scale: 2, mode: 'number' }),

    registrar: text('registrar'),
    leadManagers: text('lead_managers').array(),
    subscription: jsonb('subscription').$type<Subscription>(),

    /** 0–100, written by the red-flag engine (commit #10). Cached here for list pages. */
    riskScore: smallint('risk_score'),
    ...timestamps,
  },
  (t) => [index('ipos_status_open_date_idx').on(t.status, t.openDate)],
).enableRLS();

// --- filings: every PDF we know about, and where it is in the pipeline ---
export const filings = pgTable(
  'filings',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    ipoId: integer('ipo_id')
      .notNull()
      .references(() => ipos.id, { onDelete: 'cascade' }),
    docType: documentType('doc_type').notNull(),
    title: text('title'), // raw title from the source, e.g. 'Acme Limited – UDRHP-I'
    sourceUrl: text('source_url').notNull().unique(),
    filedOn: date('filed_on'),

    status: filingStatus('status').notNull().default('found'),
    sha256: char('sha256', { length: 64 }).unique(), // set on download; dedupes re-uploads
    storagePath: text('storage_path'), // Supabase Storage key or local path
    pageCount: integer('page_count'),
    error: text('error'), // last failure message when status = 'failed'
    parsedAt: timestamp('parsed_at', { withTimezone: true }),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('filings_ipo_idx').on(t.ipoId), index('filings_status_idx').on(t.status)],
).enableRLS();

// --- chunks: section-sized pieces of filing text; mirrored as Qdrant points (commit #12) ---
export const chunks = pgTable(
  'chunks',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    filingId: integer('filing_id')
      .notNull()
      .references(() => filings.id, { onDelete: 'cascade' }),
    ipoId: integer('ipo_id')
      .notNull()
      .references(() => ipos.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(), // position within the filing
    section: text('section'),
    pageStart: integer('page_start').notNull(),
    pageEnd: integer('page_end').notNull(),
    text: text('text').notNull(),
    tokenCount: integer('token_count'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('chunks_filing_ordinal_uq').on(t.filingId, t.ordinal),
    index('chunks_ipo_idx').on(t.ipoId),
  ],
).enableRLS();

// --- financials: one row per reporting period, extracted from the restated statements ---
export const financials = pgTable(
  'financials',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    ipoId: integer('ipo_id')
      .notNull()
      .references(() => ipos.id, { onDelete: 'cascade' }),
    filingId: integer('filing_id')
      .notNull()
      .references(() => filings.id, { onDelete: 'cascade' }),
    periodLabel: text('period_label').notNull(), // 'FY25', '9M FY26'
    periodEnd: date('period_end').notNull(),
    months: smallint('months').notNull().default(12), // stub periods are 3/6/9
    consolidated: boolean('consolidated').notNull().default(true),

    revenueFromOps: crore('revenue_from_ops'),
    otherIncome: crore('other_income'),
    totalIncome: crore('total_income'),
    ebitda: crore('ebitda'),
    pat: crore('pat'),
    totalAssets: crore('total_assets'),
    netWorth: crore('net_worth'),
    totalBorrowings: crore('total_borrowings'),
    cashAndEquivalents: crore('cash_and_equivalents'),
    tradeReceivables: crore('trade_receivables'),
    inventories: crore('inventories'),
    operatingCashFlow: crore('operating_cash_flow'),
    capex: crore('capex'),
    contingentLiabilities: crore('contingent_liabilities'),

    /** Page of the restated statement each number was read from. */
    sourcePage: integer('source_page').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('financials_period_uq').on(t.ipoId, t.periodLabel, t.consolidated),
    index('financials_ipo_idx').on(t.ipoId),
  ],
).enableRLS();

// --- flags: the latest result of each of the 12 checks for an IPO ---
export const flags = pgTable(
  'flags',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    ipoId: integer('ipo_id')
      .notNull()
      .references(() => ipos.id, { onDelete: 'cascade' }),
    check: flagCheck('check').notNull(),
    level: flagLevel('level').notNull(),
    method: detectionMethod('method').notNull(),
    reason: text('reason').notNull(), // one line, shown on the scorecard
    value: numeric('value', { precision: 16, scale: 4, mode: 'number' }), // e.g. OFS % = 78.5
    page: integer('page'), // null only when a check passes with nothing to cite
    section: text('section'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  // One row per (ipo, check): re-running the engine upserts instead of piling up rows
  (t) => [uniqueIndex('flags_ipo_check_uq').on(t.ipoId, t.check)],
).enableRLS();

// --- promises: commitments from the prospectus, tracked after listing ---
export const promises = pgTable(
  'promises',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    ipoId: integer('ipo_id')
      .notNull()
      .references(() => ipos.id, { onDelete: 'cascade' }),
    filingId: integer('filing_id')
      .notNull()
      .references(() => filings.id, { onDelete: 'cascade' }),
    category: promiseCategory('category').notNull(),
    description: text('description').notNull(),
    targetAmountCr: crore('target_amount_cr'),
    targetDate: date('target_date'),
    page: integer('page').notNull(),
    section: text('section'),

    status: promiseStatus('status').notNull().default('pending'),
    evidence: jsonb('evidence')
      .$type<PromiseEvidence[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('promises_ipo_idx').on(t.ipoId)],
).enableRLS();
