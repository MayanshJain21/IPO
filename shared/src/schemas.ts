import { z } from 'zod';
import {
  DETECTION_METHODS,
  DOCUMENT_TYPES,
  FILING_STATUSES,
  FLAG_CHECK_CODES,
  FLAG_LEVELS,
  ISSUE_STATUSES,
  PROMISE_CATEGORIES,
  PROMISE_STATUSES,
} from './constants';

// --- enums ---
export const FilingStatus = z.enum(FILING_STATUSES);
export const DocumentType = z.enum(DOCUMENT_TYPES);
export const IssueStatus = z.enum(ISSUE_STATUSES);
export const FlagLevel = z.enum(FLAG_LEVELS);
export const FlagCheckCode = z.enum(FLAG_CHECK_CODES);
export const PromiseCategory = z.enum(PROMISE_CATEGORIES);
export const PromiseStatus = z.enum(PROMISE_STATUSES);
export const DetectionMethod = z.enum(DETECTION_METHODS);

export type FilingStatus = z.infer<typeof FilingStatus>;
export type DocumentType = z.infer<typeof DocumentType>;
export type IssueStatus = z.infer<typeof IssueStatus>;
export type FlagLevel = z.infer<typeof FlagLevel>;
export type FlagCheckCode = z.infer<typeof FlagCheckCode>;
export type PromiseCategory = z.infer<typeof PromiseCategory>;
export type PromiseStatus = z.infer<typeof PromiseStatus>;
export type DetectionMethod = z.infer<typeof DetectionMethod>;

// --- JSONB shapes (Postgres can't validate inside JSONB, so Zod does) ---

/** A pointer back into the filing: the core promise of the project. */
export const Citation = z.object({
  page: z.number().int().positive(),
  section: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

/** Live subscription, in "times subscribed" per investor category. */
export const Subscription = z.object({
  qib: z.number().nonnegative().nullable(),
  nii: z.number().nonnegative().nullable(),
  retail: z.number().nonnegative().nullable(),
  employee: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Subscription = z.infer<typeof Subscription>;

/** One piece of post-listing evidence for a promise (from a MAR or a results filing). */
export const PromiseEvidence = z.object({
  filingId: z.number().int(),
  page: z.number().int().positive(),
  asOf: z.iso.date(),
  note: z.string(),
  amountUtilisedCr: z.number().nullable().optional(),
});
export type PromiseEvidence = z.infer<typeof PromiseEvidence>;
