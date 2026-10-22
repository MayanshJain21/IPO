import type { IpoListItem } from '@ipo/shared';
import { formatBand, formatCrore, formatDate, formatTimes } from '@/lib/format';
import { DOC_LABEL, STATUS_STYLE } from '@/lib/labels';

/** Draws the rows it's given. Searching and filtering live in IpoLibrary. */
export function IpoTable({ rows }: { rows: IpoListItem[] }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
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
            {rows.map((ipo) => (
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
                  <div className="flex flex-wrap items-center gap-1">
                    {ipo.docTypes.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                      >
                        {DOC_LABEL[t]}
                      </span>
                    ))}
                    {ipo.parsedCount > 0 ? (
                      <span
                        className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700 ring-1 ring-inset ring-sky-600/20"
                        title="Parsed: pages, sections and tables extracted"
                      >
                        {ipo.parsedCount === 1 ? 'Parsed ✓' : `${ipo.parsedCount} parsed ✓`}
                      </span>
                    ) : (
                      ipo.pdfCount > 0 && (
                        <span
                          className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                          title="PDF downloaded and stored, ready for parsing"
                        >
                          {ipo.pdfCount === 1 ? 'PDF ✓' : `${ipo.pdfCount} PDFs ✓`}
                        </span>
                      )
                    )}
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
    </div>
  );
}
