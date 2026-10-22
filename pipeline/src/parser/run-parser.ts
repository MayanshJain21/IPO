// Runs the Python parser as a child process. The contract (see parser/README.md):
//   stdout = one JSON document, stderr = progress and warnings, exit 0 = parsed / 1 = failed.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { ParseResult } from './result';

const PARSER_DIR = path.resolve(import.meta.dirname, '../../../parser');

/** Children still running, so Ctrl+C can stop them too (Windows doesn't do it for us). */
export const runningParsers = new Set<ChildProcess>();

export interface RunOptions {
  /** Kill the parser if it takes longer than this. */
  timeoutMs?: number;
  /** Receives each stderr line (progress, warnings) as it arrives. */
  onLog?: (line: string) => void;
}

export function runParser(pdfPath: string, opts: RunOptions = {}): Promise<ParseResult> {
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const child = spawn(
      'uv',
      ['run', '--directory', PARSER_DIR, 'python', '-m', 'ipo_parser', pdfPath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
    );
    runningParsers.add(child);

    const stdout: Buffer[] = [];
    let lastLog = '';
    let pending = '';

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      // stderr arrives in arbitrary chunks: only hand out complete lines
      pending += chunk.toString('utf8');
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines.filter(Boolean)) {
        lastLog = line;
        opts.onLog?.(line);
      }
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`parser timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timer);
      runningParsers.delete(child);
    };

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish();
      reject(
        err.code === 'ENOENT'
          ? new Error('`uv` not found. Install uv, then run `uv sync` in parser/ (see parser/README.md)')
          : err,
      );
    });

    child.on('close', (code) => {
      finish();
      if (pending) lastLog = pending;
      if (code !== 0) {
        reject(new Error(`parser exited with code ${code}: ${lastLog || 'no message'}`));
        return;
      }
      try {
        const json: unknown = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        resolve(ParseResult.parse(json)); // Zod at the border between Python and Node
      } catch (err) {
        reject(new Error(`parser output was not valid: ${(err as Error).message.slice(0, 300)}`));
      }
    });
  });
}
