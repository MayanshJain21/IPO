// Shape of the Python parser's JSON (parser/ipo_parser/model.py). Validated with Zod because it
// comes from another program: if the two sides ever drift apart, this fails loudly.
import { z } from 'zod';

const pageNumber = z.number().int().positive();

export const ParsedPage = z.object({
  page: pageNumber,
  label: z.string().nullable(), // printed footer number, e.g. "36"
  text: z.string(),
});

export const ParsedSection = z.object({
  title: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2)]),
  part: z.string().nullable(),
  printedPage: z.number().int().nullable(),
  pageStart: pageNumber,
  pageEnd: pageNumber,
});

export const ParsedTable = z.object({
  page: pageNumber,
  index: z.number().int().nonnegative(),
  heading: z.string().nullable(),
  bbox: z.array(z.number()).length(4),
  rows: z.array(z.array(z.string())),
  strategy: z.enum(['lines', 'text']),
});

export const ParseResult = z.object({
  schemaVersion: z.literal(1),
  pageCount: pageNumber,
  pages: z.array(ParsedPage),
  sections: z.array(ParsedSection),
  sectionsSource: z.enum(['toc', 'bookmarks', 'none']),
  tables: z.array(ParsedTable),
  warnings: z.array(z.string()),
  timingsMs: z.record(z.string(), z.number()),
  parser: z.object({
    name: z.string(),
    version: z.string(),
    pymupdf: z.string(),
    pdfplumber: z.string(),
  }),
});

export type ParseResult = z.infer<typeof ParseResult>;
export type ParsedSection = z.infer<typeof ParsedSection>;
export type ParsedTable = z.infer<typeof ParsedTable>;
