import { FLAG_CHECKS } from '@ipo/shared';

/** The 12 red-flag checks, read from @ipo/shared: the same list the pipeline will run. */
export function ChecksGrid() {
  return (
    <section>
      <h2 className="text-lg font-semibold">The 12 red-flag checks</h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
  );
}
