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
  const { transactions, coinMappings } = usePortfolioStore();
  const targets = getCoinTargets();

  // Derive the list of CoinGecko IDs we need to fetch
  const cryptoTickers = useMemo(() => {
    return [...new Set(
      transactions
        .filter((tx) => tx.asset !== 'USD')
        .map((tx) => tx.asset)
    )];
  }, [transactions]);

  const coinIds = useMemo(() => {
    return cryptoTickers
      .map((t) => coinMappings[t.toUpperCase()])
      .filter(Boolean) as string[];
  }, [cryptoTickers, coinMappings]);

  const { prices, loading, error, lastFetched, refresh } = useCoinPrices(coinIds);

  const holdings = useMemo(
    () => computeHoldings(transactions, coinMappings, prices, targets),
    [transactions, coinMappings, prices, targets],
  );

  const totalCryptoValue = useMemo(
    () => holdings.reduce((acc, h) => acc + h.currentValue, 0),
    [holdings],
  );

  const summary = useMemo(
    () => computePortfolioSummary(transactions, totalCryptoValue),
    [transactions, totalCryptoValue],
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
