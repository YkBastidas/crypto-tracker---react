import { useMemo } from 'react';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { calculateFundSummaries } from '../../budget/utils/calculations';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { useCoinPrices } from './useCoinPrices';
import { computeHoldings, computePortfolioSummary } from '../utils/calculations';
import { getCoinTargets } from '../../../shared/lib/storage';

/**
 * Hook that computes the full investment engine output:
 * per-coin holdings + global portfolio summary.
 * Synchronizes USDT (Inversiones Binance) and USDC (Fondo Emergencia) live balances from Budget Store when active.
 */
export function useInvestmentEngine() {
  const { transactions, coinMappings, stablecoins, tacticalDipConfig } = usePortfolioStore();
  const movements = useBudgetStore((s) => s.movements);
  const syncCryptoDca = useBudgetStore((s) => s.syncCryptoDca);
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

  const budgetFundSummary = useMemo(
    () => calculateFundSummaries(movements),
    [movements],
  );

  const holdings = useMemo(() => {
    const raw = computeHoldings(
      transactions,
      coinMappings,
      prices,
      targets,
      stablecoins,
      tacticalDipConfig,
    );
    if (!syncCryptoDca || movements.length === 0) return raw;

    const usdtBal = Math.max(
      0,
      Number(
        (
          budgetFundSummary.funds
            .find((f) => f.id === 'inversiones_binance')
            ?.breakdown?.find((b) => b.label === 'USDT')?.amount ?? 0
        ).toFixed(2),
      ),
    );
    const usdcBal = Math.max(
      0,
      Number(
        (
          budgetFundSummary.funds
            .find((f) => f.id === 'fondo_emergencia')
            ?.breakdown?.find((b) => b.label === 'USDC')?.amount ?? 0
        ).toFixed(2),
      ),
    );

    return raw.map((h) => {
      const upper = h.ticker.toUpperCase();
      if (upper === 'USDT') {
        return {
          ...h,
          currentTokens: usdtBal,
          currentValue: usdtBal,
          investedUsd: usdtBal,
          pnl: 0,
          pnlPercent: 0,
        };
      }
      if (upper === 'USDC') {
        return {
          ...h,
          currentTokens: usdcBal,
          currentValue: usdcBal,
          investedUsd: usdcBal,
          pnl: 0,
          pnlPercent: 0,
        };
      }
      return h;
    });
  }, [
    transactions,
    coinMappings,
    prices,
    targets,
    stablecoins,
    tacticalDipConfig,
    syncCryptoDca,
    movements.length,
    budgetFundSummary,
  ]);

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
