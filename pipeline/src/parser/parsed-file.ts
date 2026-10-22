// The full parse (pages, tables) is saved as gzipped JSON, ~0.5–0.8 MB per filing instead of
// 2–3 MB. Later offline steps (financial extraction, red flags, chunking) read it from here
// instead of re-running the parser.
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type { FileStore } from '../lib/file-store';
import { ParseResult } from './result';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Saves a parse result under the PDF's hash; replaces an older result for the same PDF. */
export async function writeParsed(
  store: FileStore,
  pdfSha256: string,
  result: ParseResult,
): Promise<{ key: string; bytes: number }> {
  const gz = await gzipAsync(Buffer.from(JSON.stringify(result), 'utf8'));
  const temp = await store.tempPath();
  await writeFile(temp, gz);
  const key = await store.put(temp, pdfSha256, { overwrite: true });
  return { key, bytes: gz.length };
}

export async function readParsed(filePath: string): Promise<ParseResult> {
  const json: unknown = JSON.parse((await gunzipAsync(await readFile(filePath))).toString('utf8'));
  return ParseResult.parse(json);
}
