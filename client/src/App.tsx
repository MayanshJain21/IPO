import { useEffect, useState } from 'react';
import { FLAG_CHECKS } from '@ipo/shared';

type Health = { ok: boolean; db: 'connected' | 'error' | 'not_configured'; time: string };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const DB_LABEL: Record<Health['db'], { text: string; className: string }> = {
  connected: { text: 'connected', className: 'text-green-700' },
  error: { text: 'error (check DATABASE_URL)', className: 'text-red-600' },
  not_configured: {
    text: 'not configured (set DATABASE_URL in .env)',
    className: 'text-amber-600',
  },
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">IPO Red-Flag &amp; Promise Tracker</h1>
      <p className="mt-2 text-gray-600">
        Forensic checks on Indian mainboard IPO filings. Not investment advice.
      </p>

      <section className="mt-6 rounded-lg border border-gray-200 p-4 text-sm">
        <h2 className="font-medium">System status</h2>
        <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1">
          <dt className="text-gray-500">API</dt>
          <dd>
            {error ? (
              <span className="text-red-600">unreachable (is `npm run dev:server` running?)</span>
            ) : health ? (
              <span className="text-green-700">ok</span>
            ) : (
              'checking…'
            )}
          </dd>
          <dt className="text-gray-500">Database</dt>
          <dd>
            {health ? (
              <span className={DB_LABEL[health.db].className}>{DB_LABEL[health.db].text}</span>
            ) : (
              '—'
            )}
          </dd>
        </dl>
      </section>

      {/* Read straight from @ipo/shared: the same list the pipeline will run */}
      <section className="mt-6">
        <h2 className="font-medium">The 12 red-flag checks</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {FLAG_CHECKS.map((c, i) => (
            <li key={c.code} className="rounded-lg border border-gray-200 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {i + 1}. {c.label}
                </span>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                  {c.method}
                </span>
              </div>
              <p className="mt-1 text-gray-600">{c.flags}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
