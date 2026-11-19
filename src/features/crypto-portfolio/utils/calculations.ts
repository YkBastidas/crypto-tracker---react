import type {
  Transaction,
  CoinHolding,
  CryptoGroupKey,
  DipTier,
  PortfolioExposureItem,
  PortfolioSummary,
  LivePrices,
  CoinTargets,
  SmartTradeRecommendation,
  TacticalDipConfig,
  TargetAllocations,
} from '../types';
import type { CoinMappings } from '../../../shared/types';
import {
  DEFAULT_TACTICAL_DIP_CONFIG,
  DEFAULT_TARGET_ALLOCATIONS,
  sanitizeTacticalDipConfig,
} from '../../../shared/lib/storage';

export { DEFAULT_TACTICAL_DIP_CONFIG };

/**
 * Recommends fixed dip-buying tier amounts scaled to monthly income ($900 -> $45 / $70 / $100, DCA $50).
 */
export function recommendTacticalTiersFromIncome(monthlyIncomeUsd: number): TacticalDipConfig {
  const cleanIncome = Number.isFinite(monthlyIncomeUsd) && monthlyIncomeUsd > 0 ? monthlyIncomeUsd : 0;
  if (cleanIncome <= 0) return { ...DEFAULT_TACTICAL_DIP_CONFIG };

  const roundTo5 = (val: number, min = 0) => Math.max(min, Math.round(val / 5) * 5);

  return {
    monthlyIncomeUsd: Number(cleanIncome.toFixed(2)),
    tier1Usd: roundTo5(cleanIncome * (45 / 900), 20),
    tier2Usd: roundTo5(cleanIncome * (70 / 900), 20),
    tier3Usd: roundTo5(cleanIncome * (100 / 900), 20),
    tier3MaxFreeUsdtPct: DEFAULT_TACTICAL_DIP_CONFIG.tier3MaxFreeUsdtPct,
    biweeklyDcaReserveUsd: roundTo5(cleanIncome * (50 / 900), 0),
    cooldownAdditionalDropPct: DEFAULT_TACTICAL_DIP_CONFIG.cooldownAdditionalDropPct,
    tier3EscapeDropPct: DEFAULT_TACTICAL_DIP_CONFIG.tier3EscapeDropPct,
  };
}

function getTierForDropPct(dropPct: number): DipTier {
  if (dropPct >= 22) return 3;
  if (dropPct >= 15) return 2;
  if (dropPct >= 10) return 1;
  return 0;
}

function computeDipCycleMemory(
  txs: Transaction[],
  targetBuyPct: number,
  finalTargetBuyPrice: number,
  livePrice: number,
): {
  highestConsumedDipTier: DipTier;
  lastDipBuyPrice?: number;
  lastDipBuyDate?: string;
  lastDipBuyUsd?: number;
} {
  // If current market price rebounded above Target Buy, reset consumed cooldown cycle
  if (livePrice > 0 && finalTargetBuyPrice > 0 && livePrice > finalTargetBuyPrice) {
    return { highestConsumedDipTier: 0 };
  }

  const ordered = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  let runningSpent = 0;
  let runningAcquired = 0;
  let highestConsumedDipTier: DipTier = 0;
  let lastDipBuyPrice: number | undefined;
  let lastDipBuyDate: string | undefined;
  let lastDipBuyUsd: number | undefined;

  for (const tx of ordered) {
    const qty = parseFloat(tx.tokens || '0') || 0;
    const dcaBefore = runningAcquired > 0 ? runningSpent / runningAcquired : 0;
    const targetBuyBefore = dcaBefore * (1 - targetBuyPct / 100);

    if (tx.type === 'Buy' && qty > 0 && tx.usdValue > 0) {
      const buyPrice = tx.usdValue / qty;
      if (dcaBefore > 0) {
        const dropAtBuyPct = ((dcaBefore - buyPrice) / dcaBefore) * 100;
        const inBuyZoneAtExecution = buyPrice <= targetBuyBefore || dropAtBuyPct >= 10;
        const stillInDipZone =
          finalTargetBuyPrice <= 0 || buyPrice <= finalTargetBuyPrice * 1.01;

        if (inBuyZoneAtExecution && stillInDipZone) {
          const tierAtBuy: DipTier = Math.max(1, getTierForDropPct(dropAtBuyPct)) as DipTier;
          highestConsumedDipTier = Math.max(highestConsumedDipTier, tierAtBuy) as DipTier;
          lastDipBuyPrice = buyPrice;
          lastDipBuyDate = tx.date;
          lastDipBuyUsd = tx.usdValue;
        } else if (buyPrice > targetBuyBefore) {
          highestConsumedDipTier = 0;
          lastDipBuyPrice = undefined;
          lastDipBuyDate = undefined;
          lastDipBuyUsd = undefined;
        }
      }
      runningSpent += tx.usdValue;
      runningAcquired += qty;
    } else if (tx.type === 'Sell' && qty > 0 && tx.usdValue > 0) {
      const sellPrice = tx.usdValue / qty;
      if (dcaBefore > 0 && sellPrice > targetBuyBefore) {
        highestConsumedDipTier = 0;
        lastDipBuyPrice = undefined;
        lastDipBuyDate = undefined;
        lastDipBuyUsd = undefined;
      }
    } else if (tx.type === 'Earn (Staking)') {
      runningAcquired += qty;
    }
  }

  return {
    highestConsumedDipTier,
    lastDipBuyPrice,
    lastDipBuyDate,
    lastDipBuyUsd,
  };
}

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

    const cycleMemory = !isStable
      ? computeDipCycleMemory(txs, t.buy, targetBuyPrice, livePrice)
      : { highestConsumedDipTier: 0 as DipTier };

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
      ...cycleMemory,
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

function computeBreakEvenForHolding(holding: CoinHolding): {
  breakEvenBuyUsd: number;
  breakEvenBuyTokens: number;
  newDcaAfterBreakEven: number;
} {
  const price = holding.livePrice;
  const dca = holding.dca;
  const q = dca > 0 ? holding.totalSpent / dca : 0;
  const buyPctFrac = holding.targetBuyPct / 100;

  if (
    holding.isStablecoin ||
    price <= 0 ||
    dca <= 0 ||
    q <= 0 ||
    buyPctFrac <= 0 ||
    buyPctFrac >= 1 ||
    price > holding.targetBuyPrice
  ) {
    return { breakEvenBuyUsd: 0, breakEvenBuyTokens: 0, newDcaAfterBreakEven: dca };
  }

  const exactExitUsd = Math.max(0, (q * (holding.targetBuyPrice - price)) / buyPctFrac);
  // Ceiling to 2 decimals + $0.01 ensures newTargetBuyPrice < livePrice strictly after rounding
  const breakEvenBuyUsd = Number((Math.ceil(exactExitUsd * 100) / 100 + 0.01).toFixed(2));
  const breakEvenBuyTokens = breakEvenBuyUsd / price;
  const newDcaAfterBreakEven = (holding.totalSpent + breakEvenBuyUsd) / (q + breakEvenBuyTokens);

  return { breakEvenBuyUsd, breakEvenBuyTokens, newDcaAfterBreakEven };
}

function computeTierInfo(
  dropFromDcaPct: number,
  isBuySignal: boolean,
  config: TacticalDipConfig,
): { dipTier: DipTier; dipTierLabel: string; rawTacticalUsd: number } {
  if (dropFromDcaPct >= 22) {
    return {
      dipTier: 3,
      dipTierLabel: 'Nivel 3 · Caída Profunda (≥22%)',
      rawTacticalUsd: config.tier3Usd,
    };
  }
  if (dropFromDcaPct >= 15) {
    return {
      dipTier: 2,
      dipTierLabel: 'Nivel 2 · Corrección Moderada (15–21.9%)',
      rawTacticalUsd: config.tier2Usd,
    };
  }
  if (dropFromDcaPct >= 10 || isBuySignal) {
    return {
      dipTier: 1,
      dipTierLabel: 'Nivel 1 · Corrección Leve (10–14.9%)',
      rawTacticalUsd: config.tier1Usd,
    };
  }
  return {
    dipTier: 0,
    dipTierLabel: 'Sin caída significativa',
    rawTacticalUsd: 0,
  };
}

const MIN_COIN_ORDER_USD = 20;

const GROUP_OVERWEIGHT_THRESHOLD_PCT = 5;

function computeGroupDriftForHolding(
  holding: CoinHolding,
  allVolatileHoldings: CoinHolding[] | undefined,
  totalVolatileCryptoUsd: number,
  explicitTargets?: TargetAllocations,
): { groupDriftPct?: number; isGroupOverweight: boolean } {
  if (holding.isStablecoin || holding.currentValue <= 0) {
    return { isGroupOverweight: false };
  }

  const pool = (
    allVolatileHoldings && allVolatileHoldings.length > 0 ? allVolatileHoldings : [holding]
  ).filter((h) => !h.isStablecoin && h.currentValue > 0);

  const distinctGroups = new Set(pool.map((h) => classifyCryptoGroup(h.ticker).id));
  // Guard: avoid penalizing isolated single-asset unit checks when no explicit target was supplied
  if (!explicitTargets && distinctGroups.size < 2) {
    return { isGroupOverweight: false };
  }

  const denomUsd =
    allVolatileHoldings && allVolatileHoldings.length > 0
      ? pool.reduce((acc, h) => acc + h.currentValue, 0)
      : Math.max(totalVolatileCryptoUsd, holding.currentValue);
  if (denomUsd <= 0) {
    return { isGroupOverweight: false };
  }

  const targetGroupId = classifyCryptoGroup(holding.ticker).id;
  const targets = explicitTargets ?? DEFAULT_TARGET_ALLOCATIONS;
  const groupTargetPct = targets[targetGroupId] ?? targets[targetGroupId.toUpperCase()];
  if (typeof groupTargetPct !== 'number' || !Number.isFinite(groupTargetPct)) {
    return { isGroupOverweight: false };
  }

  const groupValueUsd =
    allVolatileHoldings && allVolatileHoldings.length > 0
      ? pool
          .filter((h) => classifyCryptoGroup(h.ticker).id === targetGroupId)
          .reduce((acc, h) => acc + h.currentValue, 0)
      : holding.currentValue;

  const groupCurrentPct = (groupValueUsd / denomUsd) * 100;
  const groupDriftPct = Number((groupCurrentPct - groupTargetPct).toFixed(2));
  return {
    groupDriftPct,
    isGroupOverweight: groupDriftPct > GROUP_OVERWEIGHT_THRESHOLD_PCT,
  };
}

function evaluateCooldown(
  holding: CoinHolding,
  dipTier: DipTier,
  config: TacticalDipConfig,
): {
  isCooldownLocked: boolean;
  isTier3EscapeUnlocked?: boolean;
  nextUnlockPrice?: number;
  cooldownReason?: string;
} {
  const consumedTier = holding.highestConsumedDipTier ?? 0;
  const lastBuyPrice = holding.lastDipBuyPrice;
  const price = holding.livePrice;

  if (consumedTier <= 0 || !lastBuyPrice || lastBuyPrice <= 0 || price <= 0) {
    return { isCooldownLocked: false };
  }

  const additionalDropReq = config.cooldownAdditionalDropPct;
  const decimals = lastBuyPrice < 1 ? 4 : 2;
  const nextUnlockPrice = Number(
    (lastBuyPrice * (1 - additionalDropReq / 100)).toFixed(decimals),
  );
  const dropSinceLastBuyPct = ((lastBuyPrice - price) / lastBuyPrice) * 100;

  const deeperTierOk = dipTier > consumedTier;
  const additionalDropOk = dropSinceLastBuyPct >= additionalDropReq;

  if (deeperTierOk && additionalDropOk) {
    return { isCooldownLocked: false, nextUnlockPrice };
  }

  if (consumedTier >= 3) {
    const escapeDropReq = config.tier3EscapeDropPct ?? 15;
    const escapeUnlockPrice = Number(
      (lastBuyPrice * (1 - escapeDropReq / 100)).toFixed(decimals),
    );
    if (dipTier >= 3 && dropSinceLastBuyPct >= escapeDropReq) {
      return {
        isCooldownLocked: false,
        isTier3EscapeUnlocked: true,
        nextUnlockPrice: escapeUnlockPrice,
      };
    }
    return {
      isCooldownLocked: true,
      nextUnlockPrice: escapeUnlockPrice,
      cooldownReason: `Cooldown Nivel 3 cumplido (${formatUsd(lastBuyPrice)}). Desbloquea al rebotar sobre Target Buy o por capitulación (-${escapeDropReq}% extra ≤ ${formatUsd(escapeUnlockPrice)}).`,
    };
  }

  const nextTier = consumedTier + 1;
  let cooldownReason: string;
  if (!deeperTierOk && !additionalDropOk) {
    cooldownReason = `Cooldown Nivel ${consumedTier} cumplido (${formatUsd(lastBuyPrice)}). Desbloquea en Nivel ${nextTier} y ≤ ${formatUsd(nextUnlockPrice)} (-${additionalDropReq}% extra).`;
  } else if (!deeperTierOk) {
    cooldownReason = `Cooldown Nivel ${consumedTier} cumplido (${formatUsd(lastBuyPrice)}). Requiere entrar en Nivel ${nextTier} para nuevo disparo.`;
  } else {
    cooldownReason = `Cooldown Nivel ${nextTier}: falta caída adicional (-${Math.max(0, dropSinceLastBuyPct).toFixed(1)}% vs -${additionalDropReq}% desde ${formatUsd(lastBuyPrice)}, ≤ ${formatUsd(nextUnlockPrice)}).`;
  }

  return {
    isCooldownLocked: true,
    nextUnlockPrice,
    cooldownReason,
  };
}

function allocatePriorityDipBudget(
  activeBuyHoldings: CoinHolding[],
  allVolatileHoldings: CoinHolding[] | undefined,
  totalVolatileCryptoUsd: number,
  maxSpendable: number,
  config: TacticalDipConfig,
  explicitTargets?: TargetAllocations,
): {
  allocations: Record<string, number>;
  ranks: Record<string, number>;
  blockedReasons: Record<string, string>;
  overweightFlags: Record<string, boolean>;
  globalTierBudgetUsd: number;
  activeCoinCount: number;
} {
  const candidates = activeBuyHoldings.map((h) => {
    const drop = h.dca > 0 && h.livePrice > 0 ? ((h.dca - h.livePrice) / h.dca) * 100 : 0;
    const { rawTacticalUsd } = computeTierInfo(drop, true, config);
    const { groupDriftPct, isGroupOverweight } = computeGroupDriftForHolding(
      h,
      allVolatileHoldings ?? activeBuyHoldings,
      totalVolatileCryptoUsd,
      explicitTargets,
    );
    const effectiveTacticalUsd = isGroupOverweight
      ? Number((Math.max(0, rawTacticalUsd) * 0.5).toFixed(2))
      : Number(Math.max(0, rawTacticalUsd).toFixed(2));
    return {
      ticker: h.ticker.toUpperCase(),
      displayTicker: h.ticker,
      drop,
      investedUsd: h.investedUsd,
      groupDriftPct,
      isGroupOverweight,
      effectiveTacticalUsd,
    };
  });

  // Priority queue: underweight/balanced groups before overweight (>+5%), then deepest drop -> lowest drift -> investedUsd desc
  const prioritized = [...candidates].sort(
    (a, b) =>
      Number(a.isGroupOverweight) - Number(b.isGroupOverweight) ||
      b.drop - a.drop ||
      (a.groupDriftPct ?? 0) - (b.groupDriftPct ?? 0) ||
      b.investedUsd - a.investedUsd ||
      a.ticker.localeCompare(b.ticker),
  );

  const globalTierBudgetUsd = Number(
    Math.min(maxSpendable, Math.max(...prioritized.map((c) => c.effectiveTacticalUsd), 0)).toFixed(
      2,
    ),
  );

  const allocations: Record<string, number> = {};
  const ranks: Record<string, number> = {};
  const blockedReasons: Record<string, string> = {};
  const overweightFlags: Record<string, boolean> = {};
  let remainingBudget = globalTierBudgetUsd;
  let leaderTicker: string | null = null;
  let fundedCount = 0;

  prioritized.forEach((item, index) => {
    ranks[item.ticker] = index + 1;
    overweightFlags[item.ticker] = item.isGroupOverweight;
    const desired = Number(Math.min(item.effectiveTacticalUsd, remainingBudget).toFixed(2));

    if (desired < MIN_COIN_ORDER_USD) {
      allocations[item.ticker] = 0;
      blockedReasons[item.ticker] = leaderTicker
        ? `Prioridad asignada a ${leaderTicker} · Remanente < $${MIN_COIN_ORDER_USD}`
        : item.isGroupOverweight
          ? `Sobreponderado (+${(item.groupDriftPct ?? 0).toFixed(1)}%) · Monto reducido < $${MIN_COIN_ORDER_USD}`
          : `Esperar mayor caída / Monto < $${MIN_COIN_ORDER_USD}`;
      return;
    }

    allocations[item.ticker] = desired;
    remainingBudget = Number(Math.max(0, remainingBudget - desired).toFixed(2));
    if (!leaderTicker) leaderTicker = item.displayTicker;
    fundedCount += 1;
  });

  return {
    allocations,
    ranks,
    blockedReasons,
    overweightFlags,
    globalTierBudgetUsd,
    activeCoinCount: fundedCount,
  };
}

/**
 * Fixed-tier Tactical Dip-Buying engine with Dual-Filter Cooldown, Group Overweight Guard & Priority Queue.
 * - Uses fixed blocks anchored to monthly income ($45 / $70 / $100) bounded by free Binance USDT (after DCA reserve).
 * - Halves tactical block (-50%) and deprioritizes assets whose strategic group exceeds target by > +5%.
 * - Never uses breakEvenBuyUsd to size or cap orders (informational only).
 * - Discards micro-orders (< $20) instead of inflating them.
 */
export function computeSmartTradeRecommendation(params: {
  holding: CoinHolding;
  eligibleCapitalUsd: number;
  totalVolatileCryptoUsd: number;
  allVolatileHoldings?: CoinHolding[];
  tacticalConfig?: Partial<TacticalDipConfig>;
  targetAllocations?: TargetAllocations;
}): SmartTradeRecommendation {
  const {
    holding,
    eligibleCapitalUsd,
    totalVolatileCryptoUsd,
    allVolatileHoldings,
    tacticalConfig,
    targetAllocations,
  } = params;
  const config = sanitizeTacticalDipConfig({
    ...DEFAULT_TACTICAL_DIP_CONFIG,
    ...tacticalConfig,
  });
  const cleanEligible = Math.max(0, Number(eligibleCapitalUsd.toFixed(2)));
  const freeTacticalUsdtUsd = Number(
    Math.max(0, cleanEligible - config.biweeklyDcaReserveUsd).toFixed(2),
  );
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

  const { breakEvenBuyUsd, breakEvenBuyTokens, newDcaAfterBreakEven } =
    computeBreakEvenForHolding(holding);
  const { dipTier, dipTierLabel, rawTacticalUsd } = computeTierInfo(
    dropFromDcaPct,
    holding.tradeSignal === 'BUY',
    config,
  );
  const cooldown = evaluateCooldown(holding, dipTier, config);
  const { groupDriftPct, isGroupOverweight } = computeGroupDriftForHolding(
    holding,
    allVolatileHoldings,
    totalVolatileCryptoUsd,
    targetAllocations,
  );

  const maxSpendable = Number(
    Math.min(
      freeTacticalUsdtUsd,
      cleanEligible * (config.tier3MaxFreeUsdtPct / 100),
    ).toFixed(2),
  );

  let tacticalBuyUsd = 0;
  let tacticalBuyTokens = 0;
  let newDcaAfterTactical = dca;
  let blockedReason: string | undefined;
  let isCooldownLocked = false;
  let isGroupOverweightTrimmed = false;
  let priorityRank: number | undefined;
  let sharedAmongBuyCount: number | undefined;
  let globalTierBudgetUsd: number | undefined;

  if (holding.tradeSignal === 'BUY' && price > 0) {
    if (cooldown.isCooldownLocked) {
      isCooldownLocked = true;
      blockedReason = cooldown.cooldownReason;
    } else if (freeTacticalUsdtUsd < MIN_COIN_ORDER_USD) {
      blockedReason =
        cleanEligible < MIN_COIN_ORDER_USD
          ? 'USDT digital libre < $20 (esperar próxima quincena)'
          : `Se reservan $${config.biweeklyDcaReserveUsd} para tu DCA quincenal (esperar liquidez)`;
    } else if (maxSpendable < MIN_COIN_ORDER_USD) {
      blockedReason = `Tope del ${config.tier3MaxFreeUsdtPct}% sobre USDT libre es < $${MIN_COIN_ORDER_USD}`;
    } else {
      const activeBuyPeers = (allVolatileHoldings ?? []).filter((h) => {
        if (h.isStablecoin || h.tradeSignal !== 'BUY' || h.livePrice <= 0) return false;
        const peerDrop = h.dca > 0 ? ((h.dca - h.livePrice) / h.dca) * 100 : 0;
        const peerTier = computeTierInfo(peerDrop, true, config).dipTier;
        return !evaluateCooldown(h, peerTier, config).isCooldownLocked;
      });

      if (activeBuyPeers.length > 1) {
        const shared = allocatePriorityDipBudget(
          activeBuyPeers,
          allVolatileHoldings,
          totalVolatileCryptoUsd,
          maxSpendable,
          config,
          targetAllocations,
        );
        const key = holding.ticker.toUpperCase();
        tacticalBuyUsd = shared.allocations[key] ?? 0;
        priorityRank = shared.ranks[key];
        isGroupOverweightTrimmed = Boolean(shared.overweightFlags[key] && tacticalBuyUsd > 0);
        sharedAmongBuyCount = shared.activeCoinCount > 1 ? shared.activeCoinCount : undefined;
        globalTierBudgetUsd = shared.globalTierBudgetUsd;
        if (tacticalBuyUsd === 0) {
          blockedReason = shared.blockedReasons[key];
        }
      } else {
        const effectiveRaw = isGroupOverweight
          ? Number((rawTacticalUsd * 0.5).toFixed(2))
          : rawTacticalUsd;
        const candidateUsd = Number(Math.min(effectiveRaw, maxSpendable).toFixed(2));
        globalTierBudgetUsd = candidateUsd;
        if (candidateUsd < MIN_COIN_ORDER_USD) {
          tacticalBuyUsd = 0;
          blockedReason = isGroupOverweight
            ? `Sobreponderado (+${(groupDriftPct ?? 0).toFixed(1)}%) · Monto reducido < $${MIN_COIN_ORDER_USD}`
            : `Esperar mayor caída / Monto < $${MIN_COIN_ORDER_USD}`;
        } else {
          tacticalBuyUsd = candidateUsd;
          isGroupOverweightTrimmed = isGroupOverweight;
          priorityRank = 1;
        }
      }

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
    freeTacticalUsdtUsd,
    residualAfterBuyUsd,
    isCappedByBreakEven: false,
    isCooldownLocked,
    isTier3EscapeUnlocked: cooldown.isTier3EscapeUnlocked,
    isGroupOverweightTrimmed,
    groupDriftPct,
    highestConsumedDipTier: holding.highestConsumedDipTier,
    lastDipBuyPrice: holding.lastDipBuyPrice,
    lastDipBuyDate: holding.lastDipBuyDate,
    nextUnlockPrice: cooldown.nextUnlockPrice,
    priorityRank,
    sharedAmongBuyCount,
    globalTierBudgetUsd,
    blockedReason,
    concentrationWarning,
    suggestedSellTokens,
    suggestedSellUsd,
  };
}

const CRYPTO_GROUP_META: Record<CryptoGroupKey, string> = {
  'GROUP:BTC': 'BTC Core',
  'GROUP:ETH': 'ETH & Staking',
  'GROUP:SOL': 'SOL & Staking',
  'GROUP:GOLD': 'Oro (PAXG)',
  'GROUP:ALTS': 'Altcoins & Otros',
};

export function classifyCryptoGroup(ticker: string): { id: CryptoGroupKey; label: string } {
  const upper = ticker.toUpperCase().trim();
  if (upper === 'BTC' || upper === 'WBTC') {
    return { id: 'GROUP:BTC', label: CRYPTO_GROUP_META['GROUP:BTC'] };
  }
  if (upper === 'ETH' || upper === 'WBETH' || upper === 'STETH') {
    return { id: 'GROUP:ETH', label: CRYPTO_GROUP_META['GROUP:ETH'] };
  }
  if (upper === 'SOL' || upper === 'BNSOL' || upper === 'MSOL' || upper === 'JITOSOL') {
    return { id: 'GROUP:SOL', label: CRYPTO_GROUP_META['GROUP:SOL'] };
  }
  if (upper === 'PAXG' || upper === 'XAUT') {
    return { id: 'GROUP:GOLD', label: CRYPTO_GROUP_META['GROUP:GOLD'] };
  }
  return { id: 'GROUP:ALTS', label: CRYPTO_GROUP_META['GROUP:ALTS'] };
}

/**
 * Computes portfolio exposure breakdown (by strategic group or individual coin),
 * optionally including free digital USDT liquidity, alongside target drift and dollar rebalance deltas.
 */
export function computePortfolioExposure(params: {
  holdings: CoinHolding[];
  mode: 'group' | 'coin';
  includeDigitalUsdt?: boolean;
  digitalUsdtUsd?: number;
  targetAllocations?: TargetAllocations;
}): { items: PortfolioExposureItem[]; totalBaseUsd: number } {
  const {
    holdings,
    mode,
    includeDigitalUsdt = false,
    digitalUsdtUsd = 0,
    targetAllocations,
  } = params;

  const volatileHoldings = holdings.filter(
    (h) => !h.isStablecoin && (h.currentValue > 0.01 || h.currentTokens > 0),
  );

  interface Bucket {
    id: string;
    label: string;
    tickers: string[];
    valueUsd: number;
    investedUsd: number;
    pnlUsd: number;
    isLiquidity?: boolean;
  }

  const bucketMap = new Map<string, Bucket>();

  for (const h of volatileHoldings) {
    const tickerUpper = h.ticker.toUpperCase();
    const { id, label } =
      mode === 'group' ? classifyCryptoGroup(tickerUpper) : { id: tickerUpper, label: tickerUpper };

    const existing = bucketMap.get(id);
    if (existing) {
      if (!existing.tickers.includes(tickerUpper)) existing.tickers.push(tickerUpper);
      existing.valueUsd += h.currentValue;
      existing.investedUsd += h.investedUsd;
      existing.pnlUsd += h.pnl;
    } else {
      bucketMap.set(id, {
        id,
        label,
        tickers: [tickerUpper],
        valueUsd: h.currentValue,
        investedUsd: h.investedUsd,
        pnlUsd: h.pnl,
      });
    }
  }

  // Ensure configured group targets with > 0% appear even if current balance is $0
  if (mode === 'group' && targetAllocations) {
    for (const [key, pct] of Object.entries(targetAllocations)) {
      const upperKey = key.toUpperCase() as CryptoGroupKey;
      if (upperKey in CRYPTO_GROUP_META && pct > 0 && !bucketMap.has(upperKey)) {
        bucketMap.set(upperKey, {
          id: upperKey,
          label: CRYPTO_GROUP_META[upperKey],
          tickers: [],
          valueUsd: 0,
          investedUsd: 0,
          pnlUsd: 0,
        });
      }
    }
  }

  const cleanUsdt = includeDigitalUsdt ? Math.max(0, Number(digitalUsdtUsd.toFixed(2))) : 0;
  const volatileBuckets = [...bucketMap.values()].sort(
    (a, b) => b.valueUsd - a.valueUsd || a.label.localeCompare(b.label),
  );

  if (cleanUsdt > 0) {
    volatileBuckets.push({
      id: 'USDT_LIQUID',
      label: 'Liquidez USDT',
      tickers: ['USDT'],
      valueUsd: cleanUsdt,
      investedUsd: cleanUsdt,
      pnlUsd: 0,
      isLiquidity: true,
    });
  }

  const totalBaseUsd = Number(
    volatileBuckets.reduce((acc, b) => acc + b.valueUsd, 0).toFixed(2),
  );

  const items: PortfolioExposureItem[] = volatileBuckets.map((b) => {
    const cleanValue = Number(b.valueUsd.toFixed(2));
    const currentPct =
      totalBaseUsd > 0 ? Number(((cleanValue / totalBaseUsd) * 100).toFixed(2)) : 0;
    const rawTarget =
      targetAllocations?.[b.id] ?? targetAllocations?.[b.id.toUpperCase()];
    const hasTarget = typeof rawTarget === 'number' && Number.isFinite(rawTarget);

    if (!hasTarget) {
      return {
        id: b.id,
        label: b.label,
        tickers: b.tickers,
        valueUsd: cleanValue,
        investedUsd: Number(b.investedUsd.toFixed(2)),
        pnlUsd: Number(b.pnlUsd.toFixed(2)),
        currentPct,
        targetPct: null,
        deltaPct: null,
        rebalanceDeltaUsd: null,
        rebalanceStatus: 'NO_TARGET',
        isLiquidity: b.isLiquidity,
      };
    }

    const targetPct = Number(rawTarget.toFixed(2));
    const deltaPct = Number((currentPct - targetPct).toFixed(2));
    const targetValueUsd = (targetPct / 100) * totalBaseUsd;
    const rebalanceDeltaUsd = Number((targetValueUsd - cleanValue).toFixed(2));
    const rebalanceStatus: PortfolioExposureItem['rebalanceStatus'] =
      deltaPct < -2 ? 'UNDERWEIGHT' : deltaPct > 2 ? 'OVERWEIGHT' : 'BALANCED';

    return {
      id: b.id,
      label: b.label,
      tickers: b.tickers,
      valueUsd: cleanValue,
      investedUsd: Number(b.investedUsd.toFixed(2)),
      pnlUsd: Number(b.pnlUsd.toFixed(2)),
      currentPct,
      targetPct,
      deltaPct,
      rebalanceDeltaUsd,
      rebalanceStatus,
      isLiquidity: b.isLiquidity,
    };
  });

  return { items, totalBaseUsd };
}

function formatExposureStatusLabel(item: PortfolioExposureItem): string {
  if (item.targetPct === null || item.rebalanceDeltaUsd === null) return 'Sin meta';
  if (item.rebalanceStatus === 'UNDERWEIGHT') {
    return `Subponderado (Faltan +${formatUsd(Math.max(0, item.rebalanceDeltaUsd))})`;
  }
  if (item.rebalanceStatus === 'OVERWEIGHT') {
    return `Sobreponderado (Exceso -${formatUsd(Math.max(0, -item.rebalanceDeltaUsd))})`;
  }
  return 'Balanceado (±2%)';
}

export function buildAiPortfolioReportMarkdown(params: {
  generatedAt?: string;
  holdings: CoinHolding[];
  archivedHoldings?: CoinHolding[];
  eligibleCapital: {
    ahorroEnvelopeUsd: number;
    unassignedUsdtUsd: number;
    totalEligibleUsd: number;
    excludedPhysicalCashUsd: number;
  };
  tacticalConfig: TacticalDipConfig;
  recommendations: Record<string, SmartTradeRecommendation>;
  groupExposure: { items: PortfolioExposureItem[]; totalBaseUsd: number };
  coinExposure: { items: PortfolioExposureItem[]; totalBaseUsd: number };
}): string {
  const {
    generatedAt = new Date().toISOString().slice(0, 10),
    holdings,
    archivedHoldings = [],
    eligibleCapital,
    tacticalConfig,
    recommendations,
    groupExposure,
    coinExposure,
  } = params;

  const totalCryptoUsd = holdings.reduce((acc, h) => acc + h.currentValue, 0);
  const freeTacticalUsdt = Math.max(
    0,
    Number((eligibleCapital.totalEligibleUsd - tacticalConfig.biweeklyDcaReserveUsd).toFixed(2)),
  );

  const lines: string[] = [
    `# Resumen de Portafolio Crypto y Liquidez para Análisis (${generatedAt})`,
    '',
    '## 1. Liquidez Disponible y Parámetros del Motor Táctico',
    `- **Valor total en activos crypto volátiles:** ${formatUsd(totalCryptoUsd)}`,
    `- **USDT digital libre en Binance:** ${formatUsd(eligibleCapital.totalEligibleUsd)} (${formatUsd(eligibleCapital.ahorroEnvelopeUsd)} en Ahorro e Inversión Binance + ${formatUsd(eligibleCapital.unassignedUsdtUsd)} USDT sin sobre)`,
    `- **Reserva protegida para próximo DCA quincenal:** -${formatUsd(tacticalConfig.biweeklyDcaReserveUsd)}`,
    `- **Liquidez táctica neta disponible hoy:** ${formatUsd(freeTacticalUsdt)} (Efectivo físico excluido: ${formatUsd(eligibleCapital.excludedPhysicalCashUsd)})`,
    `- **Parámetros tácticos (Ingreso base ${formatUsd(tacticalConfig.monthlyIncomeUsd)}/mes):** Nivel 1 (10–14.9%): ${formatUsd(tacticalConfig.tier1Usd)} | Nivel 2 (15–21.9%): ${formatUsd(tacticalConfig.tier2Usd)} | Nivel 3 (≥22%): ${formatUsd(tacticalConfig.tier3Usd)} (tope ${tacticalConfig.tier3MaxFreeUsdtPct}% USDT libre) | Cooldown: +${tacticalConfig.cooldownAdditionalDropPct}% caída adicional`,
    '',
    `## 2. Exposición y Balanceo por Grupo (Base: ${formatUsd(groupExposure.totalBaseUsd)})`,
    '| Grupo | Monedas | Valor USD | % Actual | % Objetivo | Ajuste / Estado |',
    '| :--- | :--- | ---: | ---: | ---: | :--- |',
  ];

  for (const item of groupExposure.items) {
    lines.push(
      `| ${item.label} | ${item.tickers.join(', ') || '—'} | ${formatUsd(item.valueUsd)} | ${item.currentPct.toFixed(1)}% | ${item.targetPct !== null ? `${item.targetPct.toFixed(1)}%` : '—'} | ${formatExposureStatusLabel(item)} |`,
    );
  }

  lines.push(
    '',
    `## 3. Exposición por Moneda Individual (Base: ${formatUsd(coinExposure.totalBaseUsd)})`,
    '| Activo | Valor USD | % Actual | % Objetivo | P&L | Ajuste / Estado |',
    '| :--- | ---: | ---: | ---: | ---: | :--- |',
  );

  for (const item of coinExposure.items) {
    lines.push(
      `| ${item.label} | ${formatUsd(item.valueUsd)} | ${item.currentPct.toFixed(1)}% | ${item.targetPct !== null ? `${item.targetPct.toFixed(1)}%` : '—'} | ${item.pnlUsd >= 0 ? '+' : ''}${formatUsd(item.pnlUsd)} | ${formatExposureStatusLabel(item)} |`,
    );
  }

  lines.push(
    '',
    '## 4. Detalle de Posiciones Activas y Señales Hoy',
    '| Activo | Tokens | DCA | Precio Actual | Valor | P&L (%) | Target Buy / Sell | Señal | Acción / Cooldown Hoy |',
    '| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- | :--- |',
  );

  for (const h of holdings) {
    const rec = recommendations[h.ticker.toUpperCase()];
    let actionNote = 'Mantener (fuera de rango)';
    if (h.tradeSignal === 'BUY' && rec) {
      actionNote =
        rec.tacticalBuyUsd > 0
          ? `COMPRAR ${formatUsd(rec.tacticalBuyUsd)} (${rec.dipTierLabel.split(' · ')[0]}${rec.priorityRank ? ` #${rec.priorityRank}` : ''})`
          : rec.blockedReason ?? 'En espera';
    } else if (h.tradeSignal === 'SELL' && rec) {
      actionNote = `VENDER 25% (${formatTokens(rec.suggestedSellTokens, h.ticker)} ≈ ${formatUsd(rec.suggestedSellUsd)})`;
    }

    lines.push(
      `| ${h.ticker} | ${formatTokens(h.currentTokens, h.ticker)} | ${formatUsd(h.dca)} | ${formatUsd(h.livePrice)} | ${formatUsd(h.currentValue)} | ${h.pnl >= 0 ? '+' : ''}${formatUsd(h.pnl)} (${(h.pnlPercent * 100).toFixed(1)}%) | ${formatUsd(h.targetBuyPrice)} (-${h.targetBuyPct}%) / ${formatUsd(h.targetSellPrice)} (+${h.targetSellPct}%) | ${h.tradeSignal} | ${actionNote} |`,
    );
  }

  if (archivedHoldings.length > 0) {
    const closedTotal = archivedHoldings.reduce((acc, h) => acc + h.pnl, 0);
    lines.push(
      '',
      `## 5. Posiciones Cerradas (Balance realizado: ${closedTotal >= 0 ? '+' : ''}${formatUsd(closedTotal)})`,
      ...archivedHoldings.map(
        (h) =>
          `- **${h.ticker}:** Invertido ${formatUsd(h.totalSpent)} · Vendido ${formatUsd(h.soldUsd)} · P&L ${h.pnl >= 0 ? '+' : ''}${formatUsd(h.pnl)}`,
      ),
    );
  }

  lines.push(
    '',
    '## Prompt para la IA',
    '> Analiza este portafolio crypto y mi liquidez disponible hoy. Considerando mis pesos objetivo por grupo/moneda, mis precios DCA vs. mercado, el estado de Cooldown y la reserva protegida para DCA quincenal: (1) ¿Ves riesgo de concentración o sobreexposición en algún activo?, (2) ¿Qué ajustes recomiendas priorizar con el USDT táctico disponible sin descapitalizarme?, y (3) ¿Ajustarías alguno de los % Target Buy/Sell o metas de distribución?',
  );

  return lines.join('\n');
}
