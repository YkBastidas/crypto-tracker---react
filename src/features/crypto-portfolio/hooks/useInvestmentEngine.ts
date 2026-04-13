import { useMemo } from 'react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { useCoinPrices } from './useCoinPrices';
import { computeHoldings, computePortfolioSummary } from '../utils/calculations';
import { getCoinTargets } from '../../../shared/lib/storage';

/**
 * Hook that computes the full investment engine output:
 * per-coin holdings + global portfolio summary.
 */
export function useInvestmentEngine() {
  const { transactions, coinMappings, stablecoins } = usePortfolioStore();
  const targets = getCoinTargets();

  // Derive the list of CoinGecko IDs we need to fetch
  const allTickers = useMemo(() => {
    return [...new Set(transactions.map((tx) => tx.asset))];
  }, [transactions]);

  const coinIds = useMemo(() => {
    return allTickers
      .map((t) => coinMappings[t.toUpperCase()])
      .filter(Boolean) as string[];
  }, [allTickers, coinMappings]);

  const { prices, loading, error, lastFetched, refresh } = useCoinPrices(coinIds);

  const holdings = useMemo(
    () => computeHoldings(transactions, coinMappings, prices, targets, stablecoins),
    [transactions, coinMappings, prices, targets, stablecoins],
  );

  const summary = useMemo(
    () => computePortfolioSummary(transactions, holdings),
    [transactions, holdings],
  );

  return {
    holdings,
    summary,
    loading,
    error,
    lastFetched,
    refreshPrices: refresh,
  };
}
