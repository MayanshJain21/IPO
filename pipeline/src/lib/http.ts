// Polite HTTP for scrapers: one request at a time per host, a minimum gap between
// requests, retries with backoff, timeouts, and a disk cache so re-runs don't hit the sites.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { gunzipSync } from 'node:zlib';
import pLimit, { type LimitFunction } from 'p-limit';
import { Agent, fetch } from 'undici';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

/** Minimum milliseconds between two requests to the same host. NSE blocks fast scraping. */
const MIN_GAP_MS: Record<string, number> = {
  'www.sebi.gov.in': 1500,
  'www.nseindia.com': 2000,
  'api.bseindia.com': 2000,
};
const DEFAULT_GAP_MS = 1000;

const CACHE_DIR = path.resolve(import.meta.dirname, '../../../data/cache');

const agent = new Agent({
  keepAliveTimeout: 10_000,
  connect: { timeout: 15_000 },
  headersTimeout: 30_000,
  bodyTimeout: 60_000,
});

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

/** An error that retrying can't fix. */
export class FatalError extends Error {}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Form body for POST, already URL-encoded. */
  body?: string;
  headers?: Record<string, string>;
  /** How long a cached response stays fresh. 0 disables the cache for this call. */
  cacheTtlMs?: number;
  retries?: number;
  /**
   * Use Node's https with a lenient header parser instead of undici. Only for hosts that
   * send malformed headers (BSE's Akamai edge sends a header line starting with a space,
   * which undici's strict parser rejects).
   */
  lenientHeaders?: boolean;
}

let cacheEnabled = true;
export function setCacheEnabled(enabled: boolean) {
  cacheEnabled = enabled;
}

const hosts = new Map<string, { limit: LimitFunction; last: number }>();

/** Runs `fn` in the host's queue: one at a time per host, at least MIN_GAP_MS apart. */
function throttled<T>(host: string, fn: () => Promise<T>): Promise<T> {
  let q = hosts.get(host);
  if (!q) {
    q = { limit: pLimit(1), last: 0 };
    hosts.set(host, q);
  }
  const queue = q;
  return queue.limit(async () => {
    const wait = queue.last + (MIN_GAP_MS[host] ?? DEFAULT_GAP_MS) - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      queue.last = Date.now();
    }
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetches a URL as text, politely. Throws HttpError on non-2xx after retries. */
export async function politeFetch(url: string, opts: RequestOptions = {}): Promise<string> {
  const method = opts.method ?? 'GET';
  const ttl = opts.cacheTtlMs ?? 6 * 60 * 60 * 1000;
  const host = new URL(url).host;
  const cacheFile = path.join(
    CACHE_DIR,
    host,
    createHash('sha256')
      .update(`${method} ${url} ${opts.body ?? ''}`)
      .digest('hex')
      .slice(0, 32),
  );

  if (cacheEnabled && ttl > 0) {
    const cached = await readFresh(cacheFile, ttl);
    if (cached !== null) return cached;
  }

  const text = await throttled(host, () =>
    withRetries(opts.retries ?? 3, () => send(url, method, opts)),
  );

  if (cacheEnabled && ttl > 0) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, text, 'utf8');
  }
  return text;
}

/**
 * Streams a file to `destPath`, hashing it on the way: one pass gives the file, its SHA-256
 * and its size, with constant memory whatever the file size. Same queue and retries as
 * politeFetch; never cached (the file store is the cache).
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts: { maxBytes?: number; headers?: Record<string, string> } = {},
): Promise<{ sha256: string; sizeBytes: number }> {
  const maxBytes = opts.maxBytes ?? 200 * 1024 * 1024;

  return throttled(new URL(url).host, () =>
    withRetries(3, async () => {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,*/*', ...opts.headers },
        dispatcher: agent,
      });
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        throw new HttpError(res.status, url);
      }
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > maxBytes) {
        await res.body.cancel();
        throw new FatalError(`File is ${declared} bytes, over the ${maxBytes}-byte limit`);
      }

      const hash = createHash('sha256');
      let size = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _enc, done) {
          size += chunk.length;
          if (size > maxBytes) return done(new FatalError(`Download exceeded ${maxBytes} bytes`));
          hash.update(chunk);
          done(null, chunk);
        },
      });
      // network → meter (hash + size) → disk. pipeline() also cleans up if any stage fails.
      await pipeline(
        Readable.fromWeb(res.body as WebReadableStream),
        meter,
        createWriteStream(destPath),
      );

      if (declared && size !== declared) {
        throw new Error(`Truncated download: got ${size} of ${declared} bytes`); // retryable
      }
      return { sha256: hash.digest('hex'), sizeBytes: size };
    }),
  );
}

export async function fetchJson(url: string, opts: RequestOptions = {}): Promise<unknown> {
  const text = await politeFetch(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 120)}`);
  }
}

async function withRetries<T>(retries: number, attempt: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      // 4xx (except 429) won't fix itself. 403 means we're blocked: back off, don't hammer.
      // A FatalError (file too large, not a PDF) won't fix itself either.
      const retryable =
        !(err instanceof FatalError) &&
        (!(err instanceof HttpError) || err.status === 429 || err.status >= 500);
      if (!retryable || i >= retries) throw err;
      const delay = 2000 * 2 ** i + Math.random() * 500;
      console.warn(
        `  retry ${i + 1}/${retries} in ${Math.round(delay)}ms: ${(err as Error).message}`,
      );
      await sleep(delay);
    }
  }
}

async function send(url: string, method: string, opts: RequestOptions): Promise<string> {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
    ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    ...opts.headers,
  };
  if (opts.lenientHeaders) return sendLenient(url, method, headers, opts.body);

  const res = await fetch(url, { method, headers, body: opts.body, dispatcher: agent });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, url);
  return text;
}

function sendLenient(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: { ...headers, 'Accept-Encoding': 'gzip' },
        insecureHTTPParser: true,
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          if (res.headers['content-encoding'] === 'gzip') buf = gunzipSync(buf);
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) reject(new HttpError(status, url));
          else resolve(buf.toString('utf8'));
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Timeout for ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function readFresh(file: string, ttlMs: number): Promise<string | null> {
  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs > ttlMs) return null;
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}
