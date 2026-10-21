import { z } from 'zod';

/**
 * Validates a list response row by row. Bad rows are skipped and counted, so one odd row
 * (say, a 2010 issue with a null price) can't throw away 1,400 good ones. If EVERY row
 * fails, the source changed its format: that throws, loudly.
 */
export function parseRows<T extends z.ZodType>(
  schema: T,
  json: unknown,
  source: string,
): z.infer<T>[] {
  const rows = z.array(z.unknown()).parse(json);
  const good: z.infer<T>[] = [];
  let firstError: z.ZodError | undefined;

  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) good.push(result.data);
    else firstError ??= result.error;
  }

  if (rows.length > 0 && good.length === 0) {
    throw new Error(
      `${source}: no row matched the expected shape. ${z.prettifyError(firstError!)}`,
    );
  }
  const skipped = rows.length - good.length;
  if (skipped > 0) console.warn(`  ${source}: skipped ${skipped} of ${rows.length} malformed rows`);
  return good;
}
