import type { FilingStatus, PipelineStatus as Status } from '@ipo/shared';
import { useApi } from '@/lib/api';

// Pipeline order, with what each status means for someone reading the page.
const STEPS: { status: FilingStatus; label: string; className: string }[] = [
  { status: 'found', label: 'found on SEBI', className: 'text-gray-600' },
  { status: 'downloaded', label: 'PDF downloaded', className: 'text-emerald-700' },
  { status: 'parsed', label: 'parsed', className: 'text-sky-700' },
  { status: 'indexed', label: 'indexed for Q&A', className: 'text-indigo-700' },
  { status: 'duplicate', label: 'duplicate', className: 'text-gray-500' },
  { status: 'failed', label: 'failed', className: 'text-red-600' },
];

/** One line: how many filings sit at each step of the offline pipeline. */
export function PipelineStatus() {
  const { data } = useApi<Status>('/api/pipeline');
  if (!data) return null;

  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
      <span>Filings ({total}):</span>
      {STEPS.filter((s) => data[s.status] > 0).map((s) => (
        <span key={s.status} className={s.className}>
          {data[s.status]} {s.label}
        </span>
      ))}
    </p>
  );
}
