import type { DocumentType, IpoListItem, IssueStatus } from '@ipo/shared';
import { useApi } from '@/lib/api';
import { formatBand, formatCrore, formatDate, formatTimes } from '@/lib/format';

const STATUS_STYLE: Record<IssueStatus, string> = {
  open: 'bg-green-50 text-green-700 ring-green-600/20',
  upcoming: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  closed: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  listed: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  withdrawn: 'bg-red-50 text-red-700 ring-red-600/20',
};

const DOC_LABEL: Record<DocumentType, string> = {
  drhp: 'DRHP',
  rhp: 'RHP',
  prospectus: 'Prospectus',
  addendum: 'Addendum',
  mar: 'MAR',
  results: 'Results',
};

const STATUS_ORDER: IssueStatus[] = ['open', 'upcoming', 'closed', 'listed', 'withdrawn'];

export function IpoTable() {
  const { data, error, loading } = useApi<IpoListItem[]>('/api/ipos');

  if (loading) return <p className="text-sm text-gray-500">Loading IPOs…</p>;
  if (error) return <p className="text-sm text-red-600">Couldn’t load IPOs ({error}).</p>;
  if (!data?.length) {
    return <p className="text-sm text-gray-500">No IPOs yet. Run `npm run scrape`.</p>;
  }

  const counts = STATUS_ORDER.map((s) => [s, data.filter((r) => r.status === s).length] as const);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">IPOs in the database ({data.length})</h2>
        <p className="flex flex-wrap gap-2 text-xs">
          {counts
            .filter(([, n]) => n > 0)
            .map(([s, n]) => (
              <span
                key={s}
                className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${STATUS_STYLE[s]}`}
              >
                {n} {s}
              </span>
            ))}
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Issue dates</th>
              <th className="px-3 py-2 text-right font-medium">Price band</th>
              <th className="px-3 py-2 text-right font-medium">Lot</th>
              <th className="px-3 py-2 text-right font-medium">Issue size</th>
              <th className="px-3 py-2 text-right font-medium">Subscribed</th>
              <th className="px-3 py-2 font-medium">Filings on SEBI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((ipo) => (
              <tr key={ipo.slug} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-medium">{ipo.companyName}</div>
                  {ipo.nseSymbol && (
                    <div className="font-mono text-xs text-gray-500">{ipo.nseSymbol}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${STATUS_STYLE[ipo.status]}`}
                  >
                    {ipo.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                  {ipo.openDate
                    ? `${formatDate(ipo.openDate)} – ${formatDate(ipo.closeDate)}`
                    : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatBand(ipo.priceBandLow, ipo.priceBandHigh)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{ipo.lotSize ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatCrore(ipo.issueSizeCr)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTimes(ipo.subscription?.total)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {ipo.docTypes.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                      >
                        {DOC_LABEL[t]}
                      </span>
                    ))}
                  </div>
                  {ipo.lastFiledOn && (
                    <div className="mt-0.5 text-xs text-gray-500">
                      {formatDate(ipo.lastFiledOn)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        “—” means the source didn’t state it in ₹ (for example, an offer given only in shares).
        Exact figures come from the filing itself in a later step.
      </p>
    </section>
  );
}
