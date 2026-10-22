import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { keyFor, localFileStore } from '../src/lib/file-store';
import { hashFile, isPdf } from '../src/lib/files';
import { parseSebiDetail } from '../src/sources/sebi';
import { fixtureText } from './helpers';

describe('parseSebiDetail', () => {
  const pageUrl =
    'https://www.sebi.gov.in/filings/public-issues/oct-2026/hunger-pangs-limited-drhp_105347.html';

  it('takes the PDF from the viewer iframe, not the abridged prospectus link', () => {
    assert.equal(
      parseSebiDetail(fixtureText('sebi-detail-drhp.html'), pageUrl),
      'https://www.sebi.gov.in/sebi_data/attachdocs/oct-2026/1792579400603.pdf',
    );
  });

  it('returns null when there is no PDF iframe', () => {
    assert.equal(parseSebiDetail('<html><body>Page not found</body></html>', pageUrl), null);
  });
});

describe('files and the content-addressed store', () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ipo-store-'));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('hashes a file (SHA-256 of "hello")', async () => {
    const f = path.join(dir, 'hello.txt');
    await writeFile(f, 'hello');
    assert.deepEqual(await hashFile(f), {
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      sizeBytes: 5,
    });
  });

  it('recognises a PDF by its first bytes, not its name', async () => {
    const real = path.join(dir, 'real.pdf');
    const fake = path.join(dir, 'error-page.pdf');
    await writeFile(real, '%PDF-1.7\n...');
    await writeFile(fake, '<html>Service unavailable</html>');
    assert.equal(await isPdf(real), true);
    assert.equal(await isPdf(fake), false);
  });

  it('stores the same bytes once, under their hash', async () => {
    const store = localFileStore(path.join(dir, 'filings'));
    const sha = 'ab'.repeat(32);

    for (let i = 0; i < 2; i++) {
      const temp = await store.tempPath();
      await writeFile(temp, '%PDF-same bytes');
      assert.equal(await store.put(temp, sha), keyFor(sha)); // "ab/abab….pdf"
    }

    assert.deepEqual(await readdir(path.join(dir, 'filings', 'ab')), [`${sha}.pdf`]);
    assert.deepEqual(await readdir(path.join(dir, 'filings', '.tmp')), []); // no leftovers
  });
});
