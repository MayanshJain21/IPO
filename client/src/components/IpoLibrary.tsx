import type { IpoListItem, IssueStatus } from '@ipo/shared';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { IpoTable } from '@/components/IpoTable';
import { useApi } from '@/lib/api';
import { STATUS_STYLE } from '@/lib/labels';

const STATUS_ORDER: IssueStatus[] = ['open', 'upcoming', 'closed', 'listed', 'withdrawn'];

/** Lower-cases and drops "limited/ltd" so "jio ltd" finds "Jio Platforms Limited". */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(limited|ltd)\b\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function initialQuery(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

/**
 * Searchable list of every IPO. Filtering happens in the browser: the full list is small
 * (hundreds of rows) and already loaded, so each keystroke filters instantly with no request.
 */
export function IpoLibrary() {
  const { data, error, loading } = useApi<IpoListItem[]>('/api/ipos');
  const [query, setQuery] = useState(initialQuery);
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());
  const [pdfOnly, setPdfOnly] = useState(false);

  // Typing stays smooth: React filters with the "deferred" query when it has spare time.
  const deferredQuery = useDeferredValue(query);

  // Mirror the search into the URL (?q=jio) so a filtered view can be bookmarked or shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }, [query]);

  const rows = useMemo(() => {
    const q = normalise(deferredQuery);
    return (data ?? []).filter(
      (r) =>
        (statuses.size === 0 || statuses.has(r.status)) &&
        (!pdfOnly || r.pdfCount > 0) &&
        (!q ||
          normalise(r.companyName).includes(q) ||
          r.nseSymbol?.toLowerCase().includes(q) ||
          r.slug.includes(q.replace(/ /g, '-'))),
    );
  }, [data, deferredQuery, statuses, pdfOnly]);

  if (loading) return <p className="text-sm text-gray-500">Loading IPOs…</p>;
  if (error) return <p className="text-sm text-red-600">Couldn’t load IPOs ({error}).</p>;
  if (!data?.length) {
    return <p className="text-sm text-gray-500">No IPOs yet. Run `npm run scrape`.</p>;
  }

  const toggle = (s: IssueStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const pdfTotal = data.filter((r) => r.pdfCount > 0).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">IPO library</h2>
        <p className="text-sm text-gray-500">
          Showing {rows.length} of {data.length}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company or NSE symbol…"
          aria-label="Search IPOs"
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-500 sm:w-72"
        />
        <div className="flex flex-wrap gap-2 text-xs" role="group" aria-label="Filter by status">
          {STATUS_ORDER.map((s) => {
            const n = data.filter((r) => r.status === s).length;
            if (n === 0) return null;
            const on = statuses.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={on}
                className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${STATUS_STYLE[s]} ${
                  on ? 'font-semibold ring-2' : statuses.size > 0 ? 'opacity-50' : ''
                }`}
              >
                {n} {s}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={pdfOnly} onChange={(e) => setPdfOnly(e.target.checked)} />
          PDF downloaded ({pdfTotal})
        </label>
      </div>

      {rows.length > 0 ? (
        <IpoTable rows={rows} />
      ) : (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No IPO matches these filters.
        </p>
      )}
    </section>
  );
}
