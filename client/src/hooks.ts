import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import type { Quote } from './types';

const LIVE_REFRESH_MS = 5000;
const LIST_REFRESH_MS = 10000;

// Live quote for one stock, refreshed every few seconds. Used by the chart and the order ticket,
// so the whole dashboard shows one price.
export function useLiveQuote(instrumentId: string | null) {
  const { token } = useAuth();
  const [state, setState] = useState<{ id: string; quote: Quote; at: number } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!instrumentId || !token) return;

    let cancelled = false;

    const load = () => {
      apiFetch(`/api/instruments/${instrumentId}/quote`, token)
        .then((quote: Quote) => {
          if (cancelled) return;
          setState({ id: instrumentId, quote, at: Date.now() });
          setFailure(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setFailure({
            id: instrumentId,
            message: err instanceof Error ? err.message : 'Live price unavailable right now',
          });
        });
    };

    load();
    const timer = setInterval(load, LIVE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [instrumentId, token]);

  // Ignore anything that belongs to a stock the user has already switched away from
  const quote = state && state.id === instrumentId ? state.quote : null;
  const updatedAt = state && state.id === instrumentId ? state.at : null;
  const error = !quote && failure && failure.id === instrumentId ? failure.message : '';

  return { quote, error, updatedAt };
}

// Quotes for many stocks at once (holdings, positions, watchlist), keyed by instrument id
export function useQuotes(instrumentIds: string[]) {
  const { token } = useAuth();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const key = Array.from(new Set(instrumentIds)).sort().join(',');

  useEffect(() => {
    if (!key || !token) return;

    const ids = key.split(',');
    let cancelled = false;

    const load = () => {
      ids.forEach((id) => {
        apiFetch(`/api/instruments/${id}/quote`, token)
          .then((quote: Quote) => {
            if (!cancelled) setQuotes((prev) => ({ ...prev, [id]: quote }));
          })
          .catch(() => undefined);
      });
    };

    load();
    const timer = setInterval(load, LIST_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, token]);

  return quotes;
}
