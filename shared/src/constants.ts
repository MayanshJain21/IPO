// Single source of truth for every fixed list in the project.
// Postgres enums (db/schema.ts), Zod schemas (schemas.ts) and the UI all read these arrays.

/** Lifecycle of a downloaded filing. Each step is idempotent and resumable. */
export const FILING_STATUSES = ['found', 'downloaded', 'parsed', 'indexed', 'failed'] as const;

/** DRHP → RHP → prospectus before listing; MAR (Monitoring Agency Report) and results after. */
export const DOCUMENT_TYPES = ['drhp', 'rhp', 'prospectus', 'addendum', 'mar', 'results'] as const;

export const ISSUE_STATUSES = ['upcoming', 'open', 'closed', 'listed', 'withdrawn'] as const;

/** Every red-flag check resolves to one of these. Never "buy" / "sell". */
export const FLAG_LEVELS = ['green', 'amber', 'red'] as const;

export const PROMISE_CATEGORIES = [
  'use_of_proceeds',
  'capacity',
  'growth',
  'margin',
  'other',
] as const;

export const PROMISE_STATUSES = ['pending', 'kept', 'delayed', 'broken'] as const;

/** How a check reaches its verdict. "rule" means pure code over extracted numbers. */
export const DETECTION_METHODS = ['rule', 'llm', 'rule+llm'] as const;

/** The 12 forensic checks that feed the 0–100 risk score. */
export const FLAG_CHECKS = [
  {
    code: 'ofs_share',
    label: 'Offer for sale share',
    flags: 'Most money going to existing shareholders',
    method: 'rule',
  },
  {
    code: 'debt_repayment',
    label: 'Debt repayment',
    flags: 'Large share of fresh issue repaying loans',
    method: 'rule+llm',
  },
  {
    code: 'related_party',
    label: 'Related-party transactions',
    flags: 'High or rising RPTs with promoter entities',
    method: 'rule+llm',
  },
  {
    code: 'promoter_litigation',
    label: 'Promoter litigation',
    flags: 'Criminal cases, regulatory actions, big tax disputes',
    method: 'llm',
  },
  {
    code: 'customer_concentration',
    label: 'Customer concentration',
    flags: 'Top 5–10 customers form a big share of revenue',
    method: 'rule+llm',
  },
  {
    code: 'supplier_concentration',
    label: 'Supplier concentration',
    flags: 'Dependence on few suppliers',
    method: 'llm',
  },
  {
    code: 'cashflow_vs_profit',
    label: 'Cash flow vs profit',
    flags: 'Profit rising, operating cash flow weak',
    method: 'rule',
  },
  {
    code: 'receivables_growth',
    label: 'Receivables growth',
    flags: 'Receivables growing faster than revenue',
    method: 'rule',
  },
  {
    code: 'auditor_remarks',
    label: 'Auditor remarks',
    flags: 'Qualifications, emphasis of matter, auditor changes',
    method: 'llm',
  },
  {
    code: 'pre_ipo_pricing',
    label: 'Pre-IPO pricing',
    flags: 'Recent share deals far below the IPO price',
    method: 'rule',
  },
  {
    code: 'valuation_vs_peers',
    label: 'Valuation vs peers',
    flags: 'P/E or EV/EBITDA well above listed peers',
    method: 'rule',
  },
  {
    code: 'contingent_liabilities',
    label: 'Contingent liabilities',
    flags: 'Large relative to net worth',
    method: 'rule',
  },
] as const satisfies readonly {
  code: string;
  label: string;
  flags: string;
  method: (typeof DETECTION_METHODS)[number];
}[];

export const FLAG_CHECK_CODES = FLAG_CHECKS.map((c) => c.code) as [
  (typeof FLAG_CHECKS)[number]['code'],
  ...(typeof FLAG_CHECKS)[number]['code'][],
];
