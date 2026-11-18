import type {
  Transaction,
  CoinHolding,
  DipTier,
  PortfolioSummary,
  LivePrices,
  CoinTargets,
  SmartTradeRecommendation,
} from '../types';
import type { CoinMappings } from '../../../shared/types';

/**
 * Compute per-coin investment data from raw transactions.
 * Unified model: all tickers (BTC, USDT, etc.) are treated as assets.
 */
export function computeHoldings(
  transactions: Transaction[],
  coinMappings: CoinMappings,
  livePrices: LivePrices,
  targets: CoinTargets,
  stablecoins: string[],
): CoinHolding[] {
  // Collect ALL unique tickers
  const tickers = [...new Set(transactions.map((tx) => tx.asset))];

  const stableSet = new Set(stablecoins.map((s) => s.toUpperCase()));

  return tickers.map((ticker) => {
    const txs = transactions.filter((tx) => tx.asset === ticker);
    const isStable = stableSet.has(ticker.toUpperCase());

    // Token balance: deposits + buys + earned - withdrawals - sells - gas
    const deposited = sum(txs, 'Deposit');
    const bought = sum(txs, 'Buy');
    const earned = sum(txs, 'Earn (Staking)');
    const withdrawn = sum(txs, 'Withdraw');
    const sold = sum(txs, 'Sell');
    const gas = sum(txs, 'Gas (Fee)');

    const currentTokens = deposited + bought + earned - withdrawn - sold - gas;

    // Cost basis: only Buy transactions contribute to cost for volatile assets
    // For stablecoins, Deposits are effectively "Buys" (inflows) and Withdrawals are "Sells" (outflows)
    // This perfectly neutralizes P&L to $0 for stablecoins.
    const totalSpent = sumUsd(txs, 'Buy') + (isStable ? deposited : 0);
    const soldUsd = sumUsd(txs, 'Sell') + (isStable ? withdrawn : 0);
    const investedUsd = totalSpent - soldUsd;

    // DCA = totalSpent / (bought + earned)  — deposits are not "purchases"
    const totalAcquired = bought + earned;
    const dca = totalAcquired > 0 ? totalSpent / totalAcquired : 0;

    const coinGeckoId = coinMappings[ticker.toUpperCase()] ?? null;

    // For stablecoins, default to $1 if no price data
    let livePrice = coinGeckoId
      ? (livePrices[coinGeckoId]?.usd ?? 0)
      : 0;
    if (isStable && livePrice === 0) livePrice = 1;

    const currentValue = currentTokens * livePrice;
    const pnl = currentValue - investedUsd;
    const pnlPercent = investedUsd !== 0 ? pnl / investedUsd : 0;

    const t = targets[ticker] ?? { buy: 20, sell: 20 };
    const targetBuyPrice = dca * (1 - t.buy / 100);
    const targetSellPrice = dca * (1 + t.sell / 100);

    let tradeSignal: CoinHolding['tradeSignal'] = 'WATCH';
    if (livePrice > 0 && !isStable) {
      if (livePrice >= targetSellPrice) tradeSignal = 'SELL';
      else if (livePrice <= targetBuyPrice) tradeSignal = 'BUY';
    }

    return {
      ticker,
      coinGeckoId,
      isStablecoin: isStable,
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
 * Compute global portfolio summary from raw transactions + holdings.
 * Separates volatile crypto from stablecoin value for risk reporting.
 */
export function computePortfolioSummary(
  transactions: Transaction[],
  holdings: CoinHolding[],
): PortfolioSummary {
  const totalDeposits = transactions
    .filter((tx) => tx.type === 'Deposit')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const totalWithdrawals = transactions
    .filter((tx) => tx.type === 'Withdraw')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const assetsBought = transactions
    .filter((tx) => tx.type === 'Buy')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const assetsSold = transactions
    .filter((tx) => tx.type === 'Sell')
    .reduce((acc, tx) => acc + tx.usdValue, 0);

  const totalCryptoValue = holdings
    .filter((h) => !h.isStablecoin)
    .reduce((acc, h) => acc + h.currentValue, 0);

  const totalStableValue = holdings
    .filter((h) => h.isStablecoin)
    .reduce((acc, h) => acc + h.currentValue, 0);

  const totalPortfolioValue = totalCryptoValue + totalStableValue;
  const netFiatInvested = totalDeposits - totalWithdrawals;
  const totalPnl = totalPortfolioValue - netFiatInvested;

  return {
    totalDeposits,
    totalWithdrawals,
    assetsBought,
    assetsSold,
    totalCryptoValue,
    totalStableValue,
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

/**
 * Smart Dip-Buying & DCA Break-Even recommendation engine.
 * - Break-even buy: exact USD needed so newTargetBuyPrice < livePrice.
 * - Tactical buy: 3-tier dip allocation strictly bounded by eligible capital and a $25 residual reserve.
 */
export function computeSmartTradeRecommendation(params: {
  holding: CoinHolding;
  eligibleCapitalUsd: number;
  totalVolatileCryptoUsd: number;
}): SmartTradeRecommendation {
  const { holding, eligibleCapitalUsd, totalVolatileCryptoUsd } = params;
  const cleanEligible = Math.max(0, Number(eligibleCapitalUsd.toFixed(2)));
  const price = holding.livePrice;
  const dca = holding.dca;
  const q = dca > 0 ? holding.totalSpent / dca : 0;

  const dropFromDcaPct =
    dca > 0 && price > 0 ? ((dca - price) / dca) * 100 : 0;
  const pumpFromDcaPct = -dropFromDcaPct;

  // Concentration guard (>35% of volatile portfolio outside BTC)
  const concentrationWarning =
    !holding.isStablecoin &&
    holding.ticker.toUpperCase() !== 'BTC' &&
    totalVolatileCryptoUsd > 0 &&
    holding.currentValue / totalVolatileCryptoUsd > 0.35
      ? 'Alta concentración (>35% del portafolio volátil)'
      : undefined;

  // Break-even buy to shift DCA out of Target Buy zone
  let breakEvenBuyUsd = 0;
  let breakEvenBuyTokens = 0;
  let newDcaAfterBreakEven = dca;
  const buyPctFrac = holding.targetBuyPct / 100;

  if (
    !holding.isStablecoin &&
    price > 0 &&
    dca > 0 &&
    q > 0 &&
    buyPctFrac > 0 &&
    buyPctFrac < 1 &&
    price <= holding.targetBuyPrice
  ) {
    const exactExitUsd = Math.max(0, (q * (holding.targetBuyPrice - price)) / buyPctFrac);
    // Ceiling to 2 decimals + $0.01 ensures newTargetBuyPrice < livePrice strictly after rounding
    breakEvenBuyUsd = Number((Math.ceil(exactExitUsd * 100) / 100 + 0.01).toFixed(2));
    breakEvenBuyTokens = breakEvenBuyUsd / price;
    newDcaAfterBreakEven = (holding.totalSpent + breakEvenBuyUsd) / (q + breakEvenBuyTokens);
  }

  // Dip tier classification (8-12%, 12.1-18%, >18%)
  let dipTier: DipTier = 0;
  let dipTierLabel = 'Sin caída significativa';
  let rawTacticalUsd = 0;

  if (dropFromDcaPct > 18) {
    dipTier = 3;
    dipTierLabel = 'Nivel 3 · Caída Profunda (>18%)';
    rawTacticalUsd = cleanEligible * 0.6;
  } else if (dropFromDcaPct > 12) {
    dipTier = 2;
    dipTierLabel = 'Nivel 2 · Corrección Moderada (12–18%)';
    rawTacticalUsd = Math.min(cleanEligible * 0.5, Math.max(cleanEligible * 0.4, 65));
  } else if (dropFromDcaPct >= 8 || holding.tradeSignal === 'BUY') {
    dipTier = 1;
    dipTierLabel = 'Nivel 1 · Corrección Leve (8–12%)';
    rawTacticalUsd = Math.min(cleanEligible * 0.35, Math.max(cleanEligible * 0.25, 50));
  }

  // Safety filter + $20 minimum trade + $25 residual reserve rule
  const MIN_TRADE_USD = 20;
  const MIN_RESIDUAL_USD = 25;
  const maxSpendable = Math.max(
    0,
    Math.min(cleanEligible - MIN_RESIDUAL_USD, cleanEligible * 0.6),
  );

  let tacticalBuyUsd = 0;
  let tacticalBuyTokens = 0;
  let newDcaAfterTactical = dca;
  let blockedReason: string | undefined;

  if (holding.tradeSignal === 'BUY' && price > 0) {
    if (cleanEligible < MIN_TRADE_USD) {
      blockedReason = 'Capital elegible < $20 (esperar próxima quincena)';
    } else if (maxSpendable < MIN_TRADE_USD) {
      blockedReason = 'Se reserva al menos $25 para DCA quincenal (esperar liquidez)';
    } else {
      tacticalBuyUsd = Number(Math.min(rawTacticalUsd, maxSpendable).toFixed(2));
      tacticalBuyTokens = tacticalBuyUsd / price;
      newDcaAfterTactical =
        q + tacticalBuyTokens > 0
          ? (holding.totalSpent + tacticalBuyUsd) / (q + tacticalBuyTokens)
          : price;
    }
  }

  const residualAfterBuyUsd = Number(Math.max(0, cleanEligible - tacticalBuyUsd).toFixed(2));

  // Staged profit-taking on SELL (25% trim)
  const suggestedSellTokens =
    holding.tradeSignal === 'SELL' && holding.currentTokens > 0
      ? holding.currentTokens * 0.25
      : 0;
  const suggestedSellUsd =
    suggestedSellTokens > 0 && price > 0
      ? Number((suggestedSellTokens * price).toFixed(2))
      : 0;

  return {
    ticker: holding.ticker,
    signal: holding.tradeSignal,
    dropFromDcaPct,
    pumpFromDcaPct,
    breakEvenBuyUsd,
    breakEvenBuyTokens,
    newDcaAfterBreakEven,
    dipTier,
    dipTierLabel,
    tacticalBuyUsd,
    tacticalBuyTokens,
    newDcaAfterTactical,
    eligibleCapitalUsd: cleanEligible,
    residualAfterBuyUsd,
    blockedReason,
    concentrationWarning,
    suggestedSellTokens,
    suggestedSellUsd,
  };
}
