import { useEffect, useState } from 'react';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type State<T> =
  { data: T; error: null } | { data: null; error: string } | { data: null; error: null };

/** Minimal GET hook. Replaced by TanStack Query (caching, refetching) in commit #7. */
export function useApi<T>(path: string): State<T> & { loading: boolean } {
  const [state, setState] = useState<State<T>>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}${path}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as T;
      })
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((e: Error) => !cancelled && setState({ data: null, error: e.message }));
    return () => {
      cancelled = true; // ignore a response that arrives after the component unmounts
    };
  }, [path]);

  return { ...state, loading: state.data === null && state.error === null };
}
