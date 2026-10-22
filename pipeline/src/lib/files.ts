import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

/** SHA-256 and size of a file on disk, streamed (constant memory). */
export async function hashFile(filePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
    sizeBytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), sizeBytes };
}

/**
 * True if the file starts with the PDF signature "%PDF-". Catches servers that answer
 * 200 OK with an HTML error page instead of the document.
 */
export async function isPdf(filePath: string): Promise<boolean> {
  const fh = await open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(5), 0, 5, 0);
    return bytesRead === 5 && buffer.toString('latin1') === '%PDF-';
  } finally {
    await fh.close();
  }
}
