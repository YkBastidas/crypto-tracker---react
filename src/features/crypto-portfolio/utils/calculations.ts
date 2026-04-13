import type { Transaction, CoinHolding, PortfolioSummary, LivePrices, CoinTargets } from '../types';
import type { CoinMappings } from '../../../shared/types';

/**
 * Compute per-coin investment data from raw transactions.
 * Ports the Python DCA/P&L logic 1:1.
 */
export function computeHoldings(
  transactions: Transaction[],
  coinMappings: CoinMappings,
  livePrices: LivePrices,
  targets: CoinTargets,
): CoinHolding[] {
  // Collect unique crypto tickers (everything except USD)
  const tickers = [...new Set(
    transactions
      .filter((tx) => tx.asset !== 'USD')
      .map((tx) => tx.asset)
  )];

  return tickers.map((ticker) => {
    const txs = transactions.filter((tx) => tx.asset === ticker);

    const bought = sum(txs, 'Buy Crypto');
    const earned = sum(txs, 'Earn (Staking)');
    const sold = sum(txs, 'Sell Crypto');
    const gas = sum(txs, 'Gas (Fee)');

    const currentTokens = bought + earned - sold - gas;

    const totalSpent = sumUsd(txs, 'Buy Crypto');
    const soldUsd = sumUsd(txs, 'Sell Crypto');
    const investedUsd = totalSpent - soldUsd;

    const totalAcquired = bought + earned;
    const dca = totalAcquired > 0 ? totalSpent / totalAcquired : 0;

    const coinGeckoId = coinMappings[ticker.toUpperCase()] ?? null;
    const livePrice = coinGeckoId
      ? (livePrices[coinGeckoId]?.usd ?? 0)
      : 0;

    const currentValue = currentTokens * livePrice;
    const pnl = currentValue - investedUsd;
    const pnlPercent = investedUsd !== 0 ? pnl / investedUsd : 0;

    const t = targets[ticker] ?? { buy: 20, sell: 20 };
    const targetBuyPrice = dca * (1 - t.buy / 100);
    const targetSellPrice = dca * (1 + t.sell / 100);

    let tradeSignal: CoinHolding['tradeSignal'] = 'WATCH';
    if (livePrice > 0) {
      if (livePrice >= targetSellPrice) tradeSignal = 'SELL';
      else if (livePrice <= targetBuyPrice) tradeSignal = 'BUY';
    }

    return {
      ticker,
      coinGeckoId,
      currentTokens,
      totalSpent,
      soldUsd,
      investedUsd,
      dca,
      livePrice,
      currentValue,
      pnl,
      pnlPercent,
      targetBuyPct: t.buy,
      targetSellPct: t.sell,
      targetBuyPrice,
      targetSellPrice,
      tradeSignal,
    };
  });
}

/**
 * Compute global portfolio summary from raw transactions + live crypto value.
 */
export function computePortfolioSummary(
  transactions: Transaction[],
  totalCryptoValue: number,
): PortfolioSummary {
  const totalDeposits = transactions
    .filter((tx) => tx.type === 'Deposit Fiat')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const totalWithdrawals = transactions
    .filter((tx) => tx.type === 'Withdraw Fiat')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const cryptoBought = transactions
    .filter((tx) => tx.type === 'Buy Crypto')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const cryptoSold = transactions
    .filter((tx) => tx.type === 'Sell Crypto')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const fiatBalance = totalDeposits - totalWithdrawals - cryptoBought + cryptoSold;
  const totalPortfolioValue = fiatBalance + totalCryptoValue;
  const netFiatInvested = totalDeposits - totalWithdrawals;
  const totalPnl = totalPortfolioValue - netFiatInvested;

  return {
    totalDeposits,
    totalWithdrawals,
    cryptoBought,
    cryptoSold,
    fiatBalance,
    totalCryptoValue,
    totalPortfolioValue,
    netFiatInvested,
    totalPnl,
  };
}

// ── Internal helpers ──

/** Sum token quantities for a specific transaction type */
function sum(txs: Transaction[], type: Transaction['type']): number {
  return txs
    .filter((tx) => tx.type === type)
    .reduce((acc, tx) => acc + parseFloat(tx.tokens || '0'), 0);
}

/** Sum USD values for a specific transaction type */
function sumUsd(txs: Transaction[], type: Transaction['type']): number {
  return txs
    .filter((tx) => tx.type === type)
    .reduce((acc, tx) => acc + tx.usdValue, 0);
}

/**
 * Format USD value with smart precision:
 * - Tiny amounts (< $0.01): show 4 decimals
 * - Normal amounts: show 2 decimals
 */
export function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (Math.abs(value) < 0.01 && Math.abs(value) > 0) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a token balance with smart precision.
 */
export function formatTokens(value: number, ticker: string): string {
  if (value === 0) return `0.00 ${ticker}`;
  if (Math.abs(value) < 0.0001) {
    return `${value.toFixed(8)} ${ticker}`;
  }
  if (Math.abs(value) < 1) {
    return `${value.toFixed(4)} ${ticker}`;
  }
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${ticker}`;
}
