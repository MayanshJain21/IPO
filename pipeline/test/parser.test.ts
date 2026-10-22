// Contract tests between Node and the Python parser: real child process, real JSON, Zod on top.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { localFileStore } from '../src/lib/file-store';
import { readParsed, writeParsed } from '../src/parser/parsed-file';
import { runParser } from '../src/parser/run-parser';

const PARSER_DIR = path.resolve(import.meta.dirname, '../../parser');

function hasUv(): boolean {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('runParser (Node → Python → Node)', { skip: !hasUv() && 'uv is not installed' }, () => {
  let dir: string;
  let samplePdf: string;

  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ipo-parser-'));
    samplePdf = path.join(dir, 'sample-drhp.pdf');
    // Reuse the parser's own test generator, so both sides test against the same document.
    execFileSync(
      'uv',
      [
        'run',
        '--directory',
        PARSER_DIR,
        'python',
        '-c',
        'import sys, pathlib; from tests.conftest import build_sample_pdf; build_sample_pdf(pathlib.Path(sys.argv[1]))',
        samplePdf,
      ],
      { stdio: 'ignore' },
    );
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns a validated result with pages, sections and the borderless table', async () => {
    const logs: string[] = [];
    const r = await runParser(samplePdf, { onLog: (l) => logs.push(l) });

    assert.equal(r.pageCount, 8);
    assert.equal(r.sectionsSource, 'toc');
    assert.deepEqual(
      r.sections.map((s) => [s.title, s.pageStart, s.pageEnd]),
      [
        ['GENERAL', 3, 4],
        ['DEFINITIONS AND ABBREVIATIONS', 3, 4],
        ['RISK FACTORS', 5, 6],
        ['FINANCIAL INFORMATION', 7, 8],
        ['RESTATED FINANCIAL INFORMATION', 7, 8],
      ],
    );
    const table = r.tables.find((t) => t.page === 7);
    assert.equal(table?.strategy, 'text');
    assert.deepEqual(table?.rows[1], [
      'Revenue from Operations',
      '537.26',
      '1,554.97',
      '1,060.99',
      '719.15',
    ]);
    assert.ok(
      logs.some((l) => l.startsWith('parsed 8 pages')),
      'stderr lines reach onLog',
    );
  });

  it('rejects with the parser message when the PDF is missing', async () => {
    await assert.rejects(runParser(path.join(dir, 'nope.pdf')), /exited with code 1: error:/);
  });

  it('round-trips through the gzipped parsed store and replaces older results', async () => {
    const store = localFileStore(path.join(dir, 'parsed'), '.json.gz');
    const r = await runParser(samplePdf);
    const sha = 'cd'.repeat(32);

    const first = await writeParsed(store, sha, r);
    assert.equal(first.key, `cd/${sha}.json.gz`);
    assert.deepEqual(await readParsed(store.resolve(first.key)), r);

    const changed = { ...r, warnings: ['re-parsed with a newer parser'] };
    await writeParsed(store, sha, changed);
    assert.deepEqual((await readParsed(store.resolve(first.key))).warnings, changed.warnings);
  });
});
