// Where downloaded filings (and their parse results) live, keyed by the PDF's SHA-256.
// For PDFs that's content addressing: the same bytes are stored once and a key proves what's
// inside. Parse results use the same key (the PDF they came from) and can be overwritten when
// the parser improves.
// Local disk for now: Supabase Storage's free tier (1 GB, 50 MB per file) can't hold ~10 MB × 100s
// of DRHPs. A Supabase implementation of FileStore can be added later without changing callers.
import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export interface FileStore {
  /** A fresh temp path inside the store (same disk, so `put` can rename atomically). */
  tempPath(): Promise<string>;
  /**
   * Moves a complete temp file in under the hash. Returns the key, e.g. "ab/abcd….pdf".
   * An existing file is kept (same bytes) unless `overwrite` is set (a newer parse result).
   */
  put(tempFile: string, sha256: string, opts?: { overwrite?: boolean }): Promise<string>;
  /** Copies an outside file in (the original is left alone). Returns the key. */
  putCopy(sourceFile: string, sha256: string): Promise<string>;
  /** Absolute path of a stored file, for readers such as the parser. */
  resolve(key: string): string;
}

const DATA_DIR = path.resolve(import.meta.dirname, '../../../data');
export const DEFAULT_FILINGS_DIR = path.join(DATA_DIR, 'filings');
export const DEFAULT_PARSED_DIR = path.join(DATA_DIR, 'parsed');

export function keyFor(sha256: string, ext = '.pdf'): string {
  return `${sha256.slice(0, 2)}/${sha256}${ext}`;
}

export function localFileStore(root = DEFAULT_FILINGS_DIR, ext = '.pdf'): FileStore {
  const tmpDir = path.join(root, '.tmp');

  const store: FileStore = {
    async tempPath() {
      await mkdir(tmpDir, { recursive: true });
      return path.join(tmpDir, `${randomUUID()}.part`);
    },

    async put(tempFile, sha256, opts = {}) {
      const key = keyFor(sha256, ext);
      const dest = store.resolve(key);
      if (!opts.overwrite && (await exists(dest))) {
        await rm(tempFile, { force: true }); // same bytes already stored
      } else {
        await mkdir(path.dirname(dest), { recursive: true });
        await rename(tempFile, dest); // atomic on the same disk: never a half-written file
      }
      return key;
    },

    async putCopy(sourceFile, sha256) {
      const temp = await store.tempPath();
      await copyFile(sourceFile, temp);
      return store.put(temp, sha256);
    },

    resolve(key) {
      return path.join(root, ...key.split('/'));
    },
  };
  return store;
}

/** Parse results: gzipped JSON next to the PDFs, keyed by the PDF's hash. */
export const parsedStore = () => localFileStore(DEFAULT_PARSED_DIR, '.json.gz');

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
