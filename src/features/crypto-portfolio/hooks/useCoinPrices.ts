import { useState, useEffect, useCallback } from 'react';
import { fetchLivePrices } from '../services/coingecko';
import type { LivePrices } from '../types';

/**
 * Hook to fetch and cache live CoinGecko prices.
 * Polls every 30 minutes (matching the Streamlit TTL).
 */
export function useCoinPrices(coinIds: string[]) {
  const [prices, setPrices] = useState<LivePrices>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const idsKey = coinIds.sort().join(',');

  const refresh = useCallback(async () => {
    if (coinIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLivePrices(coinIds);
      setPrices(data);
      setLastFetched(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    refresh();

    // Re-fetch every 30 minutes
    const interval = setInterval(refresh, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { prices, loading, error, lastFetched, refresh };
}
