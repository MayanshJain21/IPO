import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'fixtures');

/** Real responses saved from SEBI/NSE/BSE. If a site changes its format, re-save and re-run. */
export const fixtureText = (name: string) => readFileSync(path.join(dir, name), 'utf8');
export const fixtureJson = (name: string): unknown => JSON.parse(fixtureText(name));
