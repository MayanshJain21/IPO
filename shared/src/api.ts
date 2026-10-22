// Shapes of API responses. The server builds them, the client reads them: one definition.
import type { Ipo } from './db/types';
import type { DocumentType, FilingStatus } from './schemas';

/** GET /api/ipos: one row per IPO, with a summary of its filings. */
export type IpoListItem = Pick<
  Ipo,
  | 'slug'
  | 'companyName'
  | 'status'
  | 'nseSymbol'
  | 'openDate'
  | 'closeDate'
  | 'listingDate'
  | 'priceBandLow'
  | 'priceBandHigh'
  | 'lotSize'
  | 'issueSizeCr'
  | 'subscription'
> & {
  filingCount: number;
  docTypes: DocumentType[];
  lastFiledOn: string | null;
  /** Filings whose PDF is stored (downloaded or duplicate of a stored one). */
  pdfCount: number;
  /** Filings the parser has processed (sections are in the database). */
  parsedCount: number;
};

/** GET /api/pipeline: how many filings sit at each step of the offline pipeline. */
export type PipelineStatus = Record<FilingStatus, number>;
