import { useApi } from '@/lib/api';

type Health = { ok: boolean; db: 'connected' | 'error' | 'not_configured' };

const DB_LABEL: Record<Health['db'], { text: string; className: string }> = {
  connected: { text: 'connected', className: 'text-green-700' },
  error: { text: 'error (check DATABASE_URL / WARP)', className: 'text-red-600' },
  not_configured: { text: 'not configured (set DATABASE_URL)', className: 'text-amber-600' },
};

export function StatusCard() {
  const { data, error } = useApi<Health>('/api/health');

  return (
    <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
      <span>
        API:{' '}
        {error ? (
          <span className="text-red-600">unreachable</span>
        ) : data ? (
          <span className="text-green-700">ok</span>
        ) : (
          'checking…'
        )}
      </span>
      <span>
        Database:{' '}
        {data ? <span className={DB_LABEL[data.db].className}>{DB_LABEL[data.db].text}</span> : '—'}
      </span>
    </p>
  );
}
