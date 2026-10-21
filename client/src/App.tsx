import { useEffect, useState } from 'react';

type Health = { ok: boolean; time: string } | null;

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export default function App() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">IPO Red-Flag &amp; Promise Tracker</h1>
      <p className="mt-2 text-gray-600">
        Forensic checks on Indian mainboard IPO filings. Not investment advice.
      </p>
      <p className="mt-6 text-sm">
        API status:{' '}
        {error ? (
          <span className="text-red-600">unreachable (is `npm run dev:server` running?)</span>
        ) : health ? (
          <span className="text-green-700">ok</span>
        ) : (
          'checking…'
        )}
      </p>
    </main>
  );
}
