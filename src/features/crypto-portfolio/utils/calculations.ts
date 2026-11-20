import type {
  Transaction,
  CoinHolding,
  CryptoGroupKey,
  DipTier,
  LimitOrderRecommendation,
  PortfolioExposureItem,
  PortfolioSummary,
  LivePrices,
  CoinTargets,
  SmartTradeRecommendation,
  TacticalDipConfig,
  TacticalProfilePresetId,
  TargetAllocations,
  VolatilityProfileId,
} from '../types';
import type { CoinMappings } from '../../../shared/types';
import {
  DEFAULT_TACTICAL_DIP_CONFIG,
  DEFAULT_TARGET_ALLOCATIONS,
  sanitizeTacticalDipConfig,
} from '../../../shared/lib/storage';

export { DEFAULT_TACTICAL_DIP_CONFIG };

export type PresetKey = Exclude<TacticalProfilePresetId, 'personalizado'>;

const PRESET_DEFINITIONS: Record<
  PresetKey,
  {
    tier1BaseUsd: number;
    tier2BaseUsd: number;
    tier3BaseUsd: number;
    tier3MaxFreeUsdtPct: number;
    minOrderUsd: number;
    temporalCooldownHours: number;
    multiAssetFirstPassMaxSharePct: number;
    groupOverweightThresholdPct: number;
    cooldownAdditionalDropPct: number;
    tier3EscapeDropPct: number;
    goldCooldownAdditionalDropPct: number;
    goldTier3EscapeDropPct: number;
    cryptoTier1MinDropPct: number;
    cryptoTier2MinDropPct: number;
    cryptoTier3MinDropPct: number;
    goldTier1MinDropPct: number;
    goldTier2MinDropPct: number;
    goldTier3MinDropPct: number;
    limitOrderProximityPct: number;
  }
> = {
  conservador: {
    tier1BaseUsd: 30,
    tier2BaseUsd: 50,
    tier3BaseUsd: 75,
    tier3MaxFreeUsdtPct: 25,
    minOrderUsd: 25,
    temporalCooldownHours: 72,
    multiAssetFirstPassMaxSharePct: 50,
    groupOverweightThresholdPct: 3,
    cooldownAdditionalDropPct: 10,
    tier3EscapeDropPct: 18,
    goldCooldownAdditionalDropPct: 5,
    goldTier3EscapeDropPct: 10,
    cryptoTier1MinDropPct: 12,
    cryptoTier2MinDropPct: 18,
    cryptoTier3MinDropPct: 25,
    goldTier1MinDropPct: 6,
    goldTier2MinDropPct: 10,
    goldTier3MinDropPct: 15,
    limitOrderProximityPct: 2,
  },
  equilibrado: {
    tier1BaseUsd: 45,
    tier2BaseUsd: 70,
    tier3BaseUsd: 100,
    tier3MaxFreeUsdtPct: 40,
    minOrderUsd: 20,
    temporalCooldownHours: 48,
    multiAssetFirstPassMaxSharePct: 60,
    groupOverweightThresholdPct: 5,
    cooldownAdditionalDropPct: 7.5,
    tier3EscapeDropPct: 15,
    goldCooldownAdditionalDropPct: 3.5,
    goldTier3EscapeDropPct: 8,
    cryptoTier1MinDropPct: 10,
    cryptoTier2MinDropPct: 15,
    cryptoTier3MinDropPct: 22,
    goldTier1MinDropPct: 5,
    goldTier2MinDropPct: 8,
    goldTier3MinDropPct: 12,
    limitOrderProximityPct: 3,
  },
  agresivo: {
    tier1BaseUsd: 60,
    tier2BaseUsd: 90,
    tier3BaseUsd: 130,
    tier3MaxFreeUsdtPct: 65,
    minOrderUsd: 15,
    temporalCooldownHours: 24,
    multiAssetFirstPassMaxSharePct: 75,
    groupOverweightThresholdPct: 8,
    cooldownAdditionalDropPct: 5,
    tier3EscapeDropPct: 10,
    goldCooldownAdditionalDropPct: 2.5,
    goldTier3EscapeDropPct: 6,
    cryptoTier1MinDropPct: 8,
    cryptoTier2MinDropPct: 13,
    cryptoTier3MinDropPct: 18,
    goldTier1MinDropPct: 4,
    goldTier2MinDropPct: 7,
    goldTier3MinDropPct: 10,
    limitOrderProximityPct: 5,
  },
};

/**
 * Builds a complete TacticalDipConfig from a named profile preset, scaled to the given monthly income.
 */
export function buildPresetTacticalConfig(
  presetId: PresetKey,
  monthlyIncomeUsd: number = DEFAULT_TACTICAL_DIP_CONFIG.monthlyIncomeUsd,
  customDcaReserveUsd?: number,
): TacticalDipConfig {
  const def = PRESET_DEFINITIONS[presetId] ?? PRESET_DEFINITIONS.equilibrado;
  const cleanIncome =
    Number.isFinite(monthlyIncomeUsd) && monthlyIncomeUsd > 0
      ? monthlyIncomeUsd
      : DEFAULT_TACTICAL_DIP_CONFIG.monthlyIncomeUsd;
  const roundTo5 = (val: number, min = 0) => Math.max(min, Math.round(val / 5) * 5);
  const scale = cleanIncome / 900;
  const reserve =
    customDcaReserveUsd !== undefined
      ? Math.max(0, Number(customDcaReserveUsd.toFixed(2)))
      : roundTo5(50 * scale, 0);

  return sanitizeTacticalDipConfig({
    presetId,
    monthlyIncomeUsd: Number(cleanIncome.toFixed(2)),
    tier1Usd: roundTo5(def.tier1BaseUsd * scale, def.minOrderUsd),
    tier2Usd: roundTo5(def.tier2BaseUsd * scale, def.minOrderUsd),
    tier3Usd: roundTo5(def.tier3BaseUsd * scale, def.minOrderUsd),
    tier3MaxFreeUsdtPct: def.tier3MaxFreeUsdtPct,
    biweeklyDcaReserveUsd: reserve,
    minOrderUsd: def.minOrderUsd,
    temporalCooldownHours: def.temporalCooldownHours,
    multiAssetFirstPassMaxSharePct: def.multiAssetFirstPassMaxSharePct,
    groupOverweightThresholdPct: def.groupOverweightThresholdPct,
    cooldownAdditionalDropPct: def.cooldownAdditionalDropPct,
    tier3EscapeDropPct: def.tier3EscapeDropPct,
    goldCooldownAdditionalDropPct: def.goldCooldownAdditionalDropPct,
    goldTier3EscapeDropPct: def.goldTier3EscapeDropPct,
    cryptoTier1MinDropPct: def.cryptoTier1MinDropPct,
    cryptoTier2MinDropPct: def.cryptoTier2MinDropPct,
    cryptoTier3MinDropPct: def.cryptoTier3MinDropPct,
    goldTier1MinDropPct: def.goldTier1MinDropPct,
    goldTier2MinDropPct: def.goldTier2MinDropPct,
    goldTier3MinDropPct: def.goldTier3MinDropPct,
    limitOrderProximityPct: def.limitOrderProximityPct,
  });
}

/**
 * Recommends fixed dip-buying tier amounts scaled to monthly income ($900 -> $45 / $70 / $100, DCA $50).
 */
export function recommendTacticalTiersFromIncome(
  monthlyIncomeUsd: number,
  presetId: PresetKey = 'equilibrado',
): TacticalDipConfig {
  const cleanIncome = Number.isFinite(monthlyIncomeUsd) && monthlyIncomeUsd > 0 ? monthlyIncomeUsd : 0;
  if (cleanIncome <= 0) {
    return buildPresetTacticalConfig(presetId, DEFAULT_TACTICAL_DIP_CONFIG.monthlyIncomeUsd);
  }
  return buildPresetTacticalConfig(presetId, cleanIncome);
}

export interface VolatilityTierThresholds {
  profile: VolatilityProfileId;
  label: string;
  tier1MinDropPct: number;
  tier2MinDropPct: number;
  tier3MinDropPct: number;
  cooldownAdditionalDropPct: number;
  tier3EscapeDropPct: number;
}

/**
 * Selects the tactical volatility strategy for a ticker from persisted configuration.
 * Gold-backed tokens (PAXG/XAUT) use narrower drawdown bands and shorter cooldowns than volatile crypto.
 */
export function getVolatilityProfile(
  ticker: string,
  config: TacticalDipConfig = DEFAULT_TACTICAL_DIP_CONFIG,
): VolatilityTierThresholds {
  if (classifyCryptoGroup(ticker).id === 'GROUP:GOLD') {
    const t1 = config.goldTier1MinDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.goldTier1MinDropPct ?? 5;
    const t2 = Math.max(
      t1,
      config.goldTier2MinDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.goldTier2MinDropPct ?? 8,
    );
    const t3 = Math.max(
      t2,
      config.goldTier3MinDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.goldTier3MinDropPct ?? 12,
    );
    return {
      profile: 'defensive_gold',
      label: 'Oro Defensivo',
      tier1MinDropPct: t1,
      tier2MinDropPct: t2,
      tier3MinDropPct: t3,
      cooldownAdditionalDropPct:
        config.goldCooldownAdditionalDropPct ??
        DEFAULT_TACTICAL_DIP_CONFIG.goldCooldownAdditionalDropPct ??
        3.5,
      tier3EscapeDropPct:
        config.goldTier3EscapeDropPct ??
        DEFAULT_TACTICAL_DIP_CONFIG.goldTier3EscapeDropPct ??
        8,
    };
  }

  const t1 = config.cryptoTier1MinDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.cryptoTier1MinDropPct ?? 10;
  const t2 = Math.max(
    t1,
    config.cryptoTier2MinDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.cryptoTier2MinDropPct ?? 15,
  );
  const t3 = Math.max(
    t2,
    config.cryptoTier3MinDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.cryptoTier3MinDropPct ?? 22,
  );
  return {
    profile: 'crypto',
    label: 'Crypto',
    tier1MinDropPct: t1,
    tier2MinDropPct: t2,
    tier3MinDropPct: t3,
    cooldownAdditionalDropPct: config.cooldownAdditionalDropPct,
    tier3EscapeDropPct:
      config.tier3EscapeDropPct ?? DEFAULT_TACTICAL_DIP_CONFIG.tier3EscapeDropPct ?? 15,
  };
}

function getTierForDropPct(
  dropPct: number,
  ticker: string,
  config: TacticalDipConfig = DEFAULT_TACTICAL_DIP_CONFIG,
): DipTier {
  const profile = getVolatilityProfile(ticker, config);
  if (dropPct >= profile.tier3MinDropPct) return 3;
  if (dropPct >= profile.tier2MinDropPct) return 2;
  if (dropPct >= profile.tier1MinDropPct) return 1;
  return 0;
}

function computeDipCycleMemory(
  txs: Transaction[],
  ticker: string,
  targetBuyPct: number,
  finalTargetBuyPrice: number,
  livePrice: number,
  config: TacticalDipConfig = DEFAULT_TACTICAL_DIP_CONFIG,
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

  const profile = getVolatilityProfile(ticker, config);
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
        const inBuyZoneAtExecution =
          buyPrice <= targetBuyBefore || dropAtBuyPct >= profile.tier1MinDropPct;
        const stillInDipZone =
          finalTargetBuyPrice <= 0 || buyPrice <= finalTargetBuyPrice * 1.01;

        if (inBuyZoneAtExecution && stillInDipZone) {
          const tierAtBuy: DipTier = Math.max(
            1,
            getTierForDropPct(dropAtBuyPct, ticker, config),
          ) as DipTier;
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
  tacticalConfig?: Partial<TacticalDipConfig>,
): CoinHolding[] {
  const resolvedTacticalConfig = tacticalConfig
    ? sanitizeTacticalDipConfig({ ...DEFAULT_TACTICAL_DIP_CONFIG, ...tacticalConfig })
    : DEFAULT_TACTICAL_DIP_CONFIG;
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
      ? computeDipCycleMemory(txs, ticker, t.buy, targetBuyPrice, livePrice, resolvedTacticalConfig)
      : { highestConsumedDipTier: 0 as DipTier };

    return {
      ticker,
      coinGeckoId,
      isStablecoin: isStable,
      currentTokens,
      gasTokens: gas > 0 ? gas : undefined,
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

function formatDropPctLabel(val: number): string {
  const clean = Number(val.toFixed(1));
  return Number.isInteger(clean) ? clean.toFixed(0) : clean.toFixed(1);
}

function formatUpperBandLabel(nextMin: number, currentMin: number): string {
  const raw = Number(Math.max(currentMin, nextMin - 0.1).toFixed(1));
  return Number.isInteger(raw) ? raw.toFixed(0) : raw.toFixed(1);
}

function computeTierInfo(
  dropFromDcaPct: number,
  isBuySignal: boolean,
  config: TacticalDipConfig,
  ticker: string,
): { dipTier: DipTier; dipTierLabel: string; rawTacticalUsd: number } {
  const profile = getVolatilityProfile(ticker, config);
  const isGold = profile.profile === 'defensive_gold';
  const t1 = formatDropPctLabel(profile.tier1MinDropPct);
  const t1Upper = formatUpperBandLabel(profile.tier2MinDropPct, profile.tier1MinDropPct);
  const t2 = formatDropPctLabel(profile.tier2MinDropPct);
  const t2Upper = formatUpperBandLabel(profile.tier3MinDropPct, profile.tier2MinDropPct);
  const t3 = formatDropPctLabel(profile.tier3MinDropPct);

  if (dropFromDcaPct >= profile.tier3MinDropPct) {
    return {
      dipTier: 3,
      dipTierLabel: isGold
        ? `Nivel 3 · Caída Profunda Oro (≥${t3}%)`
        : `Nivel 3 · Caída Profunda (≥${t3}%)`,
      rawTacticalUsd: config.tier3Usd,
    };
  }
  if (dropFromDcaPct >= profile.tier2MinDropPct) {
    return {
      dipTier: 2,
      dipTierLabel: isGold
        ? `Nivel 2 · Corrección Moderada Oro (${t2}–${t2Upper}%)`
        : `Nivel 2 · Corrección Moderada (${t2}–${t2Upper}%)`,
      rawTacticalUsd: config.tier2Usd,
    };
  }
  if (dropFromDcaPct >= profile.tier1MinDropPct || isBuySignal) {
    return {
      dipTier: 1,
      dipTierLabel: isGold
        ? `Nivel 1 · Corrección Leve Oro (${t1}–${t1Upper}%)`
        : `Nivel 1 · Corrección Leve (${t1}–${t1Upper}%)`,
      rawTacticalUsd: config.tier1Usd,
    };
  }
  return {
    dipTier: 0,
    dipTierLabel: 'Sin caída significativa',
    rawTacticalUsd: 0,
  };
}

const DEFAULT_MIN_ORDER_USD = 20;
const DEFAULT_GROUP_OVERWEIGHT_THRESHOLD_PCT = 5;
const DEFAULT_GROUP_UNDERWEIGHT_THRESHOLD_PCT = -2;
const DEFAULT_TEMPORAL_COOLDOWN_HOURS = 48;
const DEFAULT_MULTI_ASSET_FIRST_PASS_MAX_SHARE_PCT = 60;
const DEFAULT_LIMIT_ORDER_PROXIMITY_PCT = 3;
const LIMIT_ORDER_EXPIRY_RULE =
  'Mantener abierta máx. 48h–72h (o cancelar si rebota sobre Target Buy para liberar USDT)';

const FLASH_CRASH_ELIGIBLE_GROUPS = new Set<CryptoGroupKey>([
  'GROUP:BTC',
  'GROUP:ETH',
  'GROUP:SOL',
  'GROUP:GOLD',
]);

function parseTransactionTimestampMs(dateStr?: string): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = Number(match[4] ?? 0);
    const minute = Number(match[5] ?? 0);
    const second = Number(match[6] ?? 0);
    const ms = new Date(year, month, day, hour, minute, second).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const fallback = Date.parse(trimmed);
  return Number.isFinite(fallback) ? fallback : null;
}

function getDriftPriorityBucket(
  groupDriftPct: number | undefined,
  overweightThresholdPct: number = DEFAULT_GROUP_OVERWEIGHT_THRESHOLD_PCT,
): number {
  if (groupDriftPct === undefined) return 1;
  if (groupDriftPct < DEFAULT_GROUP_UNDERWEIGHT_THRESHOLD_PCT) return 0;
  if (groupDriftPct <= overweightThresholdPct) return 1;
  return 2;
}

function computeGroupDriftForHolding(
  holding: CoinHolding,
  allVolatileHoldings: CoinHolding[] | undefined,
  totalVolatileCryptoUsd: number,
  explicitTargets?: TargetAllocations,
  overweightThresholdPct: number = DEFAULT_GROUP_OVERWEIGHT_THRESHOLD_PCT,
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
    isGroupOverweight: groupDriftPct > overweightThresholdPct,
  };
}

function evaluateCooldown(
  holding: CoinHolding,
  dipTier: DipTier,
  config: TacticalDipConfig,
  nowMs: number,
): {
  isCooldownLocked: boolean;
  isTimeCooldownLocked?: boolean;
  timeCooldownRemainingHours?: number;
  flashCrashUnlockPrice?: number;
  isFlashCrashOverrideUnlocked?: boolean;
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

  const profile = getVolatilityProfile(holding.ticker, config);
  const groupId = classifyCryptoGroup(holding.ticker).id;
  const additionalDropReq = profile.cooldownAdditionalDropPct;
  const decimals = lastBuyPrice < 1 ? 4 : 2;
  const nextUnlockPrice = Number(
    (lastBuyPrice * (1 - additionalDropReq / 100)).toFixed(decimals),
  );
  const dropSinceLastBuyPct = ((lastBuyPrice - price) / lastBuyPrice) * 100;

  const flashCrashEligible = FLASH_CRASH_ELIGIBLE_GROUPS.has(groupId);
  const flashCrashDropReq = profile.tier3EscapeDropPct;
  const flashCrashUnlockPrice = flashCrashEligible
    ? Number((lastBuyPrice * (1 - flashCrashDropReq / 100)).toFixed(decimals))
    : undefined;

  // Rule 2: Temporal lock window after any executed dip buy with asset-class Flash Crash Override
  const temporalCooldownHours = config.temporalCooldownHours ?? DEFAULT_TEMPORAL_COOLDOWN_HOURS;
  const buyTs = parseTransactionTimestampMs(holding.lastDipBuyDate);
  if (temporalCooldownHours > 0 && buyTs !== null) {
    const cooldownMs = temporalCooldownHours * 60 * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - buyTs);
    if (elapsedMs < cooldownMs) {
      const remainingHours = Math.max(
        1,
        Math.min(
          Math.ceil(temporalCooldownHours),
          Math.ceil((cooldownMs - elapsedMs) / (60 * 60 * 1000)),
        ),
      );
      if (flashCrashEligible && dropSinceLastBuyPct >= flashCrashDropReq) {
        return {
          isCooldownLocked: false,
          isFlashCrashOverrideUnlocked: true,
          isTier3EscapeUnlocked: consumedTier >= 3 ? true : undefined,
          flashCrashUnlockPrice,
          nextUnlockPrice: flashCrashUnlockPrice,
        };
      }
      if (flashCrashEligible) {
        return {
          isCooldownLocked: true,
          isTimeCooldownLocked: true,
          timeCooldownRemainingHours: remainingHours,
          flashCrashUnlockPrice,
          nextUnlockPrice: flashCrashUnlockPrice,
          cooldownReason: `Cooldown ${temporalCooldownHours}h (faltan ${remainingHours}h) · Escape flash crash ≤ ${formatUsd(flashCrashUnlockPrice!)} (-${flashCrashDropReq}%).`,
        };
      }
      return {
        isCooldownLocked: true,
        isTimeCooldownLocked: true,
        timeCooldownRemainingHours: remainingHours,
        cooldownReason: `Cooldown ${temporalCooldownHours}h estricto (faltan ${remainingHours}h · sin escape flash crash en Altcoins).`,
      };
    }
  }

  const deeperTierOk = dipTier > consumedTier;
  const additionalDropOk = dropSinceLastBuyPct >= additionalDropReq;

  const nextTierMinDrop =
    consumedTier === 1 ? profile.tier2MinDropPct : profile.tier3MinDropPct;
  const tierUnlockPrice =
    holding.dca > 0 ? holding.dca * (1 - nextTierMinDrop / 100) : nextUnlockPrice;
  const effectiveNextUnlockPrice = Number(
    Math.min(nextUnlockPrice, tierUnlockPrice).toFixed(decimals),
  );

  if (deeperTierOk && additionalDropOk) {
    return {
      isCooldownLocked: false,
      nextUnlockPrice: effectiveNextUnlockPrice,
      flashCrashUnlockPrice,
    };
  }

  if (consumedTier >= 3) {
    const escapeDropReq = profile.tier3EscapeDropPct;
    const escapeUnlockPrice = Number(
      (lastBuyPrice * (1 - escapeDropReq / 100)).toFixed(decimals),
    );
    if (dipTier >= 3 && dropSinceLastBuyPct >= escapeDropReq) {
      return {
        isCooldownLocked: false,
        isTier3EscapeUnlocked: true,
        nextUnlockPrice: escapeUnlockPrice,
        flashCrashUnlockPrice,
      };
    }
    return {
      isCooldownLocked: true,
      nextUnlockPrice: escapeUnlockPrice,
      flashCrashUnlockPrice,
      cooldownReason: `Cooldown Nivel 3 cumplido (${formatUsd(lastBuyPrice)}). Desbloquea al rebotar sobre Target Buy o por capitulación (-${escapeDropReq}% extra ≤ ${formatUsd(escapeUnlockPrice)}).`,
    };
  }

  const nextTier = consumedTier + 1;
  let cooldownReason: string;
  if (!deeperTierOk && !additionalDropOk) {
    cooldownReason = `Cooldown Nivel ${consumedTier} cumplido (${formatUsd(lastBuyPrice)}). Desbloquea en Nivel ${nextTier} y ≤ ${formatUsd(effectiveNextUnlockPrice)} (-${additionalDropReq}% extra).`;
  } else if (!deeperTierOk) {
    cooldownReason = `Cooldown Nivel ${consumedTier} cumplido (${formatUsd(lastBuyPrice)}). Requiere entrar en Nivel ${nextTier} (≤ ${formatUsd(effectiveNextUnlockPrice)}) para nuevo disparo.`;
  } else {
    cooldownReason = `Cooldown Nivel ${nextTier}: falta caída adicional (-${Math.max(0, dropSinceLastBuyPct).toFixed(1)}% vs -${additionalDropReq}% desde ${formatUsd(lastBuyPrice)}, ≤ ${formatUsd(effectiveNextUnlockPrice)}).`;
  }

  return {
    isCooldownLocked: true,
    nextUnlockPrice: effectiveNextUnlockPrice,
    flashCrashUnlockPrice,
    cooldownReason,
  };
}

interface BudgetAllocationCandidate {
  ticker: string;
  displayTicker: string;
  dipTier: DipTier;
  drop: number;
  investedUsd: number;
  groupDriftPct?: number;
  driftBucket: number;
  isGroupOverweight: boolean;
  effectiveTacticalUsd: number;
}

function allocateTacticalBudgetEntries(
  candidates: BudgetAllocationCandidate[],
  availableCapUsd: number,
  config: TacticalDipConfig,
): {
  allocations: Record<string, number>;
  ranks: Record<string, number>;
  blockedReasons: Record<string, string>;
  overweightFlags: Record<string, boolean>;
  globalTierBudgetUsd: number;
  activeCoinCount: number;
  totalAllocatedUsd: number;
} {
  const minOrderUsd = config.minOrderUsd ?? DEFAULT_MIN_ORDER_USD;
  const multiAssetMinDailyCapUsd = Number((minOrderUsd * 2).toFixed(2));
  const firstPassMaxShare = Math.min(
    1,
    Math.max(
      0.1,
      (config.multiAssetFirstPassMaxSharePct ??
        DEFAULT_MULTI_ASSET_FIRST_PASS_MAX_SHARE_PCT) / 100,
    ),
  );

  const prioritized = [...candidates].sort(
    (a, b) =>
      a.driftBucket - b.driftBucket ||
      b.dipTier - a.dipTier ||
      b.drop - a.drop ||
      (a.groupDriftPct ?? 0) - (b.groupDriftPct ?? 0) ||
      b.investedUsd - a.investedUsd ||
      a.ticker.localeCompare(b.ticker),
  );

  const allocations: Record<string, number> = {};
  const ranks: Record<string, number> = {};
  const blockedReasons: Record<string, string> = {};
  const overweightFlags: Record<string, boolean> = {};

  prioritized.forEach((item, index) => {
    ranks[item.ticker] = index + 1;
    overweightFlags[item.ticker] = item.isGroupOverweight;
    allocations[item.ticker] = 0;
  });

  const fundable = prioritized.filter(
    (c) => c.effectiveTacticalUsd > 0 && c.effectiveTacticalUsd >= minOrderUsd,
  );

  if (fundable.length >= 2 && availableCapUsd >= multiAssetMinDailyCapUsd) {
    let remaining = availableCapUsd;
    const perAssetPass1Cap = Number((availableCapUsd * firstPassMaxShare).toFixed(2));
    const leaderPass1Cap = Number(
      Math.min(perAssetPass1Cap, Math.max(minOrderUsd, availableCapUsd - minOrderUsd)).toFixed(2),
    );

    fundable.forEach((item, idx) => {
      const cap = idx === 0 ? leaderPass1Cap : perAssetPass1Cap;
      const grant = Number(Math.min(item.effectiveTacticalUsd, cap, remaining).toFixed(2));
      if (grant > 0 && grant >= minOrderUsd) {
        allocations[item.ticker] = grant;
        remaining = Number(Math.max(0, remaining - grant).toFixed(2));
      }
    });

    if (remaining > 0.009) {
      for (const item of fundable) {
        if (remaining <= 0.009) break;
        const current = allocations[item.ticker] ?? 0;
        if (current > 0) {
          const headroom = Number(Math.max(0, item.effectiveTacticalUsd - current).toFixed(2));
          if (headroom > 0) {
            const extra = Number(Math.min(headroom, remaining).toFixed(2));
            allocations[item.ticker] = Number((current + extra).toFixed(2));
            remaining = Number(Math.max(0, remaining - extra).toFixed(2));
          }
        } else if (remaining >= minOrderUsd) {
          const grant = Number(Math.min(item.effectiveTacticalUsd, remaining).toFixed(2));
          if (grant > 0 && grant >= minOrderUsd) {
            allocations[item.ticker] = grant;
            remaining = Number(Math.max(0, remaining - grant).toFixed(2));
          }
        }
      }
    }
  } else if (fundable.length >= 1) {
    const leader = fundable[0];
    const grant = Number(Math.min(leader.effectiveTacticalUsd, availableCapUsd).toFixed(2));
    if (grant > 0 && grant >= minOrderUsd) {
      allocations[leader.ticker] = grant;
    }
  }

  let leaderTicker: string | null = null;
  let activeCoinCount = 0;
  let totalAllocatedUsd = 0;

  for (const item of prioritized) {
    const granted = allocations[item.ticker] ?? 0;
    if (granted > 0 && granted >= minOrderUsd) {
      if (!leaderTicker) leaderTicker = item.displayTicker;
      activeCoinCount += 1;
      totalAllocatedUsd = Number((totalAllocatedUsd + granted).toFixed(2));
    } else {
      allocations[item.ticker] = 0;
      if (item.effectiveTacticalUsd < minOrderUsd) {
        blockedReasons[item.ticker] = item.isGroupOverweight
          ? `Sobreponderado (+${(item.groupDriftPct ?? 0).toFixed(1)}%) · Monto reducido < $${minOrderUsd}`
          : `Esperar mayor caída / Monto < $${minOrderUsd}`;
      } else if (leaderTicker && availableCapUsd < multiAssetMinDailyCapUsd) {
        blockedReasons[item.ticker] =
          `Prioridad asignada a ${leaderTicker} · Cupo diario < $${multiAssetMinDailyCapUsd} para dividir`;
      } else if (leaderTicker) {
        blockedReasons[item.ticker] =
          `Prioridad asignada a ${leaderTicker} · Remanente < $${minOrderUsd}`;
      } else {
        blockedReasons[item.ticker] = `Esperar mayor caída / Monto < $${minOrderUsd}`;
      }
    }
  }

  return {
    allocations,
    ranks,
    blockedReasons,
    overweightFlags,
    globalTierBudgetUsd: totalAllocatedUsd > 0 ? totalAllocatedUsd : availableCapUsd,
    activeCoinCount,
    totalAllocatedUsd,
  };
}

function buildBudgetCandidates(
  holdingsList: CoinHolding[],
  allVolatileHoldings: CoinHolding[] | undefined,
  totalVolatileCryptoUsd: number,
  config: TacticalDipConfig,
  explicitTargets?: TargetAllocations,
  overrideMetrics?: Record<string, { dipTier: DipTier; drop: number; rawTacticalUsd: number }>,
): BudgetAllocationCandidate[] {
  const overweightThresholdPct =
    config.groupOverweightThresholdPct ?? DEFAULT_GROUP_OVERWEIGHT_THRESHOLD_PCT;

  return holdingsList.map((h) => {
    const key = h.ticker.toUpperCase();
    const override = overrideMetrics?.[key];
    const drop =
      override?.drop ??
      (h.dca > 0 && h.livePrice > 0 ? ((h.dca - h.livePrice) / h.dca) * 100 : 0);
    const tierInfo = override
      ? { dipTier: override.dipTier, rawTacticalUsd: override.rawTacticalUsd }
      : computeTierInfo(drop, true, config, h.ticker);

    const { groupDriftPct, isGroupOverweight } = computeGroupDriftForHolding(
      h,
      allVolatileHoldings ?? holdingsList,
      totalVolatileCryptoUsd,
      explicitTargets,
      overweightThresholdPct,
    );
    const driftBucket = getDriftPriorityBucket(groupDriftPct, overweightThresholdPct);
    const effectiveTacticalUsd = isGroupOverweight
      ? Number((Math.max(0, tierInfo.rawTacticalUsd) * 0.5).toFixed(2))
      : Number(Math.max(0, tierInfo.rawTacticalUsd).toFixed(2));

    return {
      ticker: key,
      displayTicker: h.ticker,
      dipTier: tierInfo.dipTier,
      drop,
      investedUsd: h.investedUsd,
      groupDriftPct,
      driftBucket,
      isGroupOverweight,
      effectiveTacticalUsd,
    };
  });
}

function allocatePriorityDipBudget(
  activeBuyHoldings: CoinHolding[],
  allVolatileHoldings: CoinHolding[] | undefined,
  totalVolatileCryptoUsd: number,
  dailyCapUsd: number,
  config: TacticalDipConfig,
  explicitTargets?: TargetAllocations,
) {
  const candidates = buildBudgetCandidates(
    activeBuyHoldings,
    allVolatileHoldings,
    totalVolatileCryptoUsd,
    config,
    explicitTargets,
  );
  return allocateTacticalBudgetEntries(candidates, dailyCapUsd, config);
}

interface LimitCandidateMeta {
  holding: CoinHolding;
  limitPrice: number;
  distancePct: number;
  dropAtLimitPct: number;
  dipTier: DipTier;
  dipTierLabel: string;
  rawTacticalUsd: number;
  unlockTriggerLabel: string;
}

function evaluateLimitOrderCandidate(
  holding: CoinHolding,
  config: TacticalDipConfig,
  nowMs: number,
): LimitCandidateMeta | null {
  if (
    holding.isStablecoin ||
    holding.livePrice <= 0 ||
    holding.dca <= 0 ||
    holding.tradeSignal === 'SELL'
  ) {
    return null;
  }

  const maxProximityPct =
    config.limitOrderProximityPct ?? DEFAULT_LIMIT_ORDER_PROXIMITY_PCT;
  if (maxProximityPct <= 0) return null;

  const dropFromDcaPct = ((holding.dca - holding.livePrice) / holding.dca) * 100;
  const { dipTier } = computeTierInfo(
    dropFromDcaPct,
    holding.tradeSignal === 'BUY',
    config,
    holding.ticker,
  );
  const cooldown = evaluateCooldown(holding, dipTier, config, nowMs);

  // Rule 1.1: Assets already generating an immediate BUY receive an immediate BUY order, not LIMIT
  if (holding.tradeSignal === 'BUY' && !cooldown.isCooldownLocked) {
    return null;
  }

  // Rule 1.2: Never suggest LIMIT on flash-crash escape while 48h temporal cooldown is active
  if (cooldown.isTimeCooldownLocked) {
    return null;
  }

  let rawUnlockPrice = 0;
  let unlockTriggerLabel = 'Target Buy';
  if (holding.tradeSignal === 'WATCH') {
    rawUnlockPrice = holding.targetBuyPrice;
    unlockTriggerLabel = 'Target Buy';
  } else if (holding.tradeSignal === 'BUY' && cooldown.isCooldownLocked) {
    const consumedTier = holding.highestConsumedDipTier ?? 0;
    rawUnlockPrice = cooldown.nextUnlockPrice ?? 0;
    unlockTriggerLabel =
      consumedTier >= 3 ? 'Capitulación Nivel 3' : `Desbloqueo Nivel ${consumedTier + 1}`;
  }

  if (!Number.isFinite(rawUnlockPrice) || rawUnlockPrice <= 0) return null;

  const decimals = rawUnlockPrice < 1 ? 4 : 2;
  const limitPrice = Number(rawUnlockPrice.toFixed(decimals));
  if (limitPrice <= 0 || holding.livePrice <= limitPrice) return null;

  // Rule 1.3: Stalking Zone proximity filter ((livePrice - unlockPrice) / livePrice * 100 <= maxProximityPct)
  const rawDistancePct = ((holding.livePrice - limitPrice) / holding.livePrice) * 100;
  if (rawDistancePct <= 0 || rawDistancePct > maxProximityPct + 1e-6) {
    return null;
  }

  const dropAtLimitPct = ((holding.dca - limitPrice) / holding.dca) * 100;
  const { dipTier: limitDipTier, dipTierLabel, rawTacticalUsd } = computeTierInfo(
    dropAtLimitPct,
    true,
    config,
    holding.ticker,
  );

  return {
    holding,
    limitPrice,
    distancePct: Number(rawDistancePct.toFixed(2)),
    dropAtLimitPct,
    dipTier: limitDipTier,
    dipTierLabel,
    rawTacticalUsd,
    unlockTriggerLabel,
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
  nowMs?: number;
}): SmartTradeRecommendation {
  const {
    holding,
    eligibleCapitalUsd,
    totalVolatileCryptoUsd,
    allVolatileHoldings,
    tacticalConfig,
    targetAllocations,
    nowMs = Date.now(),
  } = params;
  const config = sanitizeTacticalDipConfig({
    ...DEFAULT_TACTICAL_DIP_CONFIG,
    ...tacticalConfig,
  });
  const cleanEligible = Math.max(0, Number(eligibleCapitalUsd.toFixed(2)));
  const freeTacticalUsdtUsd = Number(
    Math.max(0, cleanEligible - config.biweeklyDcaReserveUsd).toFixed(2),
  );
  // Rule 1: daily cap applies strictly to Net Tactical Liquidity (after deducting biweekly DCA reserve)
  const dailyCapUsd = Number(
    (freeTacticalUsdtUsd * (config.tier3MaxFreeUsdtPct / 100)).toFixed(2),
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

  const volatilityProfile = getVolatilityProfile(holding.ticker, config);
  const { breakEvenBuyUsd, breakEvenBuyTokens, newDcaAfterBreakEven } =
    computeBreakEvenForHolding(holding);
  const { dipTier, dipTierLabel, rawTacticalUsd } = computeTierInfo(
    dropFromDcaPct,
    holding.tradeSignal === 'BUY',
    config,
    holding.ticker,
  );
  const minOrderUsd = config.minOrderUsd ?? DEFAULT_MIN_ORDER_USD;
  const overweightThresholdPct =
    config.groupOverweightThresholdPct ?? DEFAULT_GROUP_OVERWEIGHT_THRESHOLD_PCT;
  const cooldown = evaluateCooldown(holding, dipTier, config, nowMs);
  const { groupDriftPct, isGroupOverweight } = computeGroupDriftForHolding(
    holding,
    allVolatileHoldings,
    totalVolatileCryptoUsd,
    targetAllocations,
    overweightThresholdPct,
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

  const pool = (
    allVolatileHoldings && allVolatileHoldings.length > 0 ? allVolatileHoldings : [holding]
  ).filter((h) => !h.isStablecoin && h.livePrice > 0);
  const canOperateToday =
    freeTacticalUsdtUsd >= minOrderUsd && dailyCapUsd >= minOrderUsd;
  const activeBuyPeers = canOperateToday
    ? pool.filter((h) => {
        if (h.tradeSignal !== 'BUY') return false;
        const peerDrop = h.dca > 0 ? ((h.dca - h.livePrice) / h.dca) * 100 : 0;
        const peerTier = computeTierInfo(peerDrop, true, config, h.ticker).dipTier;
        return !evaluateCooldown(h, peerTier, config, nowMs).isCooldownLocked;
      })
    : [];

  let totalImmediateBuyAllocatedUsd = 0;
  let sharedBuyAllocation: ReturnType<typeof allocatePriorityDipBudget> | null = null;
  if (activeBuyPeers.length > 1) {
    sharedBuyAllocation = allocatePriorityDipBudget(
      activeBuyPeers,
      allVolatileHoldings ?? pool,
      totalVolatileCryptoUsd,
      dailyCapUsd,
      config,
      targetAllocations,
    );
    totalImmediateBuyAllocatedUsd = sharedBuyAllocation.totalAllocatedUsd;
  } else if (activeBuyPeers.length === 1) {
    const solo = activeBuyPeers[0];
    const soloDrop = solo.dca > 0 ? ((solo.dca - solo.livePrice) / solo.dca) * 100 : 0;
    const soloRaw = computeTierInfo(soloDrop, true, config, solo.ticker).rawTacticalUsd;
    const soloOverweight = computeGroupDriftForHolding(
      solo,
      allVolatileHoldings ?? pool,
      totalVolatileCryptoUsd,
      targetAllocations,
      overweightThresholdPct,
    ).isGroupOverweight;
    const soloEffective = soloOverweight ? Number((soloRaw * 0.5).toFixed(2)) : soloRaw;
    const candidateSolo = Number(Math.min(soloEffective, dailyCapUsd).toFixed(2));
    totalImmediateBuyAllocatedUsd = candidateSolo >= minOrderUsd ? candidateSolo : 0;
  }

  const remainingDailyCapAfterBuyUsd = canOperateToday
    ? Number(Math.max(0, dailyCapUsd - totalImmediateBuyAllocatedUsd).toFixed(2))
    : 0;

  if (holding.tradeSignal === 'BUY' && price > 0) {
    if (cooldown.isCooldownLocked) {
      isCooldownLocked = true;
      blockedReason = cooldown.cooldownReason;
    } else if (freeTacticalUsdtUsd <= 0 || freeTacticalUsdtUsd < minOrderUsd) {
      blockedReason =
        cleanEligible <= 0 || cleanEligible < minOrderUsd
          ? `USDT digital libre < $${minOrderUsd} (esperar próxima quincena)`
          : `Se reservan $${config.biweeklyDcaReserveUsd} para tu DCA quincenal (esperar liquidez)`;
    } else if (dailyCapUsd <= 0 || dailyCapUsd < minOrderUsd) {
      blockedReason = `Cupo diario (${config.tier3MaxFreeUsdtPct}% de ${formatUsd(freeTacticalUsdtUsd)} neto = ${formatUsd(dailyCapUsd)}) es < $${minOrderUsd}`;
    } else {
      if (sharedBuyAllocation) {
        const key = holding.ticker.toUpperCase();
        tacticalBuyUsd = sharedBuyAllocation.allocations[key] ?? 0;
        priorityRank = sharedBuyAllocation.ranks[key];
        isGroupOverweightTrimmed = Boolean(
          sharedBuyAllocation.overweightFlags[key] && tacticalBuyUsd > 0,
        );
        sharedAmongBuyCount =
          sharedBuyAllocation.activeCoinCount > 1
            ? sharedBuyAllocation.activeCoinCount
            : undefined;
        globalTierBudgetUsd = sharedBuyAllocation.globalTierBudgetUsd;
        if (tacticalBuyUsd === 0) {
          blockedReason = sharedBuyAllocation.blockedReasons[key];
        }
      } else {
        const effectiveRaw = isGroupOverweight
          ? Number((rawTacticalUsd * 0.5).toFixed(2))
          : rawTacticalUsd;
        const candidateUsd = Number(Math.min(effectiveRaw, dailyCapUsd).toFixed(2));
        globalTierBudgetUsd = candidateUsd;
        if (candidateUsd <= 0 || candidateUsd < minOrderUsd) {
          tacticalBuyUsd = 0;
          blockedReason = isGroupOverweight
            ? `Sobreponderado (+${(groupDriftPct ?? 0).toFixed(1)}%) · Monto reducido < $${minOrderUsd}`
            : `Esperar mayor caída / Monto < $${minOrderUsd}`;
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

  // Priority 2: LIMIT orders in "Zona de Acecho" funded only by remaining free Daily Cap (>= minOrderUsd)
  let limitOrder: LimitOrderRecommendation | undefined;
  if (canOperateToday && remainingDailyCapAfterBuyUsd >= minOrderUsd) {
    const limitMetas = pool
      .map((h) => evaluateLimitOrderCandidate(h, config, nowMs))
      .filter((m): m is LimitCandidateMeta => m !== null);
    const holdingKey = holding.ticker.toUpperCase();
    const selfMeta = limitMetas.find((m) => m.holding.ticker.toUpperCase() === holdingKey);

    if (selfMeta) {
      const overrideMetrics: Record<
        string,
        { dipTier: DipTier; drop: number; rawTacticalUsd: number }
      > = {};
      for (const m of limitMetas) {
        overrideMetrics[m.holding.ticker.toUpperCase()] = {
          dipTier: m.dipTier,
          drop: m.dropAtLimitPct,
          rawTacticalUsd: m.rawTacticalUsd,
        };
      }
      const limitCandidates = buildBudgetCandidates(
        limitMetas.map((m) => m.holding),
        allVolatileHoldings ?? pool,
        totalVolatileCryptoUsd,
        config,
        targetAllocations,
        overrideMetrics,
      );
      const limitAlloc = allocateTacticalBudgetEntries(
        limitCandidates,
        remainingDailyCapAfterBuyUsd,
        config,
      );
      const grantedLimitUsd = limitAlloc.allocations[holdingKey] ?? 0;
      if (grantedLimitUsd >= minOrderUsd) {
        limitOrder = {
          limitPrice: selfMeta.limitPrice,
          suggestedUsd: grantedLimitUsd,
          suggestedTokens: grantedLimitUsd / selfMeta.limitPrice,
          distancePct: selfMeta.distancePct,
          dipTier: selfMeta.dipTier,
          dipTierLabel: selfMeta.dipTierLabel,
          unlockTriggerLabel: selfMeta.unlockTriggerLabel,
          priorityRank: limitAlloc.ranks[holdingKey],
          sharedAmongLimitCount:
            limitAlloc.activeCoinCount > 1 ? limitAlloc.activeCoinCount : undefined,
          isGroupOverweightTrimmed: Boolean(limitAlloc.overweightFlags[holdingKey]),
          expiryRuleLabel: LIMIT_ORDER_EXPIRY_RULE,
        };
      }
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
    volatilityProfile: volatilityProfile.profile,
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
    isTimeCooldownLocked: cooldown.isTimeCooldownLocked,
    timeCooldownRemainingHours: cooldown.timeCooldownRemainingHours,
    flashCrashUnlockPrice: cooldown.flashCrashUnlockPrice,
    isFlashCrashOverrideUnlocked: cooldown.isFlashCrashOverrideUnlocked,
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
    dailyCapUsd,
    remainingDailyCapAfterBuyUsd,
    limitOrder,
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

  const cleanCfg = sanitizeTacticalDipConfig({
    ...DEFAULT_TACTICAL_DIP_CONFIG,
    ...tacticalConfig,
  });
  const totalCryptoUsd = holdings.reduce((acc, h) => acc + h.currentValue, 0);
  const freeTacticalUsdt = Math.max(
    0,
    Number((eligibleCapital.totalEligibleUsd - cleanCfg.biweeklyDcaReserveUsd).toFixed(2)),
  );
  const dailyCapUsd = Number(
    (freeTacticalUsdt * (cleanCfg.tier3MaxFreeUsdtPct / 100)).toFixed(2),
  );
  const minOrderUsd = cleanCfg.minOrderUsd ?? DEFAULT_MIN_ORDER_USD;
  const multiAssetMinDaily = Number((minOrderUsd * 2).toFixed(2));
  const temporalHours = cleanCfg.temporalCooldownHours ?? DEFAULT_TEMPORAL_COOLDOWN_HOURS;
  const firstPassShare =
    cleanCfg.multiAssetFirstPassMaxSharePct ?? DEFAULT_MULTI_ASSET_FIRST_PASS_MAX_SHARE_PCT;
  const c1 = formatDropPctLabel(cleanCfg.cryptoTier1MinDropPct ?? 10);
  const c1Up = formatUpperBandLabel(cleanCfg.cryptoTier2MinDropPct ?? 15, cleanCfg.cryptoTier1MinDropPct ?? 10);
  const c2 = formatDropPctLabel(cleanCfg.cryptoTier2MinDropPct ?? 15);
  const c2Up = formatUpperBandLabel(cleanCfg.cryptoTier3MinDropPct ?? 22, cleanCfg.cryptoTier2MinDropPct ?? 15);
  const c3 = formatDropPctLabel(cleanCfg.cryptoTier3MinDropPct ?? 22);
  const g1 = formatDropPctLabel(cleanCfg.goldTier1MinDropPct ?? 5);
  const g1Up = formatUpperBandLabel(cleanCfg.goldTier2MinDropPct ?? 8, cleanCfg.goldTier1MinDropPct ?? 5);
  const g2 = formatDropPctLabel(cleanCfg.goldTier2MinDropPct ?? 8);
  const g2Up = formatUpperBandLabel(cleanCfg.goldTier3MinDropPct ?? 12, cleanCfg.goldTier2MinDropPct ?? 8);
  const g3 = formatDropPctLabel(cleanCfg.goldTier3MinDropPct ?? 12);
  const limitProxPct = cleanCfg.limitOrderProximityPct ?? DEFAULT_LIMIT_ORDER_PROXIMITY_PCT;

  const lines: string[] = [
    `# Resumen de Portafolio Crypto y Liquidez para Análisis (${generatedAt})`,
    '',
    '## 1. Liquidez Disponible y Parámetros del Motor Táctico',
    `- **Valor total en activos crypto volátiles:** ${formatUsd(totalCryptoUsd)}`,
    `- **USDT digital libre en Binance:** ${formatUsd(eligibleCapital.totalEligibleUsd)} (${formatUsd(eligibleCapital.ahorroEnvelopeUsd)} en Ahorro e Inversión Binance + ${formatUsd(eligibleCapital.unassignedUsdtUsd)} USDT sin sobre)`,
    `- **Reserva protegida para próximo DCA quincenal:** -${formatUsd(cleanCfg.biweeklyDcaReserveUsd)}`,
    `- **Liquidez táctica neta disponible hoy:** ${formatUsd(freeTacticalUsdt)} (Efectivo físico excluido: ${formatUsd(eligibleCapital.excludedPhysicalCashUsd)})`,
    `- **Cupo máximo diario (${cleanCfg.tier3MaxFreeUsdtPct}% sobre liquidez táctica neta):** ${formatUsd(dailyCapUsd)} (tope concentración ${firstPassShare}% por activo si cupo ≥ ${formatUsd(multiAssetMinDaily)} y ≥2 elegibles · piso ${formatUsd(minOrderUsd)})`,
    `- **Parámetros tácticos (Ingreso base ${formatUsd(cleanCfg.monthlyIncomeUsd)}/mes):** Bloques N1: ${formatUsd(cleanCfg.tier1Usd)} | N2: ${formatUsd(cleanCfg.tier2Usd)} | N3: ${formatUsd(cleanCfg.tier3Usd)} · Cooldown ${temporalHours}h (escape flash crash: -${cleanCfg.tier3EscapeDropPct ?? 15}% Core / -${cleanCfg.goldTier3EscapeDropPct ?? 8}% Oro · estricto Altcoins)`,
    `- **Zona de Acecho (Órdenes LIMIT):** ${limitProxPct > 0 ? `Activada a ≤ ${limitProxPct}% sobre el desbloqueo (solo tras fin del cooldown ${temporalHours}h, usando únicamente el remanente libre del cupo diario · caducidad 48h–72h)` : 'Desactivada (0%)'}`,
    `- **Perfil Crypto (BTC, ETH, SOL, Alts):** Escalones ${c1}–${c1Up}% / ${c2}–${c2Up}% / ≥${c3}% | Cooldown: +${cleanCfg.cooldownAdditionalDropPct}% caída extra | Escape N3: -${cleanCfg.tier3EscapeDropPct ?? 15}%`,
    `- **Perfil Defensivo Oro (PAXG, XAUT):** Escalones ${g1}–${g1Up}% / ${g2}–${g2Up}% / ≥${g3}% | Cooldown: +${cleanCfg.goldCooldownAdditionalDropPct ?? 3.5}% caída extra | Escape N3: -${cleanCfg.goldTier3EscapeDropPct ?? 8}%`,
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

  const limitHighlights: Array<{ ticker: string; limitOrder: LimitOrderRecommendation }> = [];
  let totalBuyUsedUsd = 0;
  let totalLimitUsedUsd = 0;

  for (const h of holdings) {
    const rec = recommendations[h.ticker.toUpperCase()];
    if (rec?.tacticalBuyUsd) {
      totalBuyUsedUsd = Number((totalBuyUsedUsd + rec.tacticalBuyUsd).toFixed(2));
    }
    if (rec?.limitOrder) {
      totalLimitUsedUsd = Number((totalLimitUsedUsd + rec.limitOrder.suggestedUsd).toFixed(2));
      limitHighlights.push({ ticker: h.ticker, limitOrder: rec.limitOrder });
    }

    let actionNote = 'Mantener (fuera de rango)';
    if (h.tradeSignal === 'BUY' && rec) {
      if (rec.tacticalBuyUsd > 0) {
        actionNote = `COMPRAR ${formatUsd(rec.tacticalBuyUsd)} (${rec.dipTierLabel.split(' · ')[0]}${rec.priorityRank ? ` #${rec.priorityRank}` : ''})`;
      } else if (rec.limitOrder) {
        actionNote = `${rec.blockedReason ?? 'En cooldown'} · ORDEN LIMIT ${formatUsd(rec.limitOrder.suggestedUsd)} @ ${formatUsd(rec.limitOrder.limitPrice)} (a -${rec.limitOrder.distancePct.toFixed(1)}% · máx. 48h–72h)`;
      } else {
        actionNote = rec.blockedReason ?? 'En espera';
      }
    } else if (h.tradeSignal === 'SELL' && rec) {
      actionNote = `VENDER 25% (${formatTokens(rec.suggestedSellTokens, h.ticker)} ≈ ${formatUsd(rec.suggestedSellUsd)})`;
    } else if (rec?.limitOrder) {
      actionNote = `ORDEN LIMIT ${formatUsd(rec.limitOrder.suggestedUsd)} @ ${formatUsd(rec.limitOrder.limitPrice)} (a -${rec.limitOrder.distancePct.toFixed(1)}% · ${rec.limitOrder.unlockTriggerLabel} · máx. 48h–72h)`;
    }

    lines.push(
      `| ${h.ticker} | ${formatTokens(h.currentTokens, h.ticker)} | ${formatUsd(h.dca)} | ${formatUsd(h.livePrice)} | ${formatUsd(h.currentValue)} | ${h.pnl >= 0 ? '+' : ''}${formatUsd(h.pnl)} (${(h.pnlPercent * 100).toFixed(1)}%) | ${formatUsd(h.targetBuyPrice)} (-${h.targetBuyPct}%) / ${formatUsd(h.targetSellPrice)} (+${h.targetSellPct}%) | ${h.tradeSignal} | ${actionNote} |`,
    );
  }

  if (limitHighlights.length > 0) {
    lines.push(
      '',
      '### Órdenes LIMIT Sugeridas (Zona de Acecho · Remanente del Cupo Diario)',
      `- **Uso combinado del cupo diario:** BUY inmediato ${formatUsd(totalBuyUsedUsd)} + LIMIT sugerido ${formatUsd(totalLimitUsedUsd)} = **${formatUsd(Number((totalBuyUsedUsd + totalLimitUsedUsd).toFixed(2)))}** / ${formatUsd(dailyCapUsd)} máx.`,
      ...limitHighlights.map(
        ({ ticker, limitOrder }) =>
          `- **${ticker} (${limitOrder.unlockTriggerLabel}):** Colocar LIMIT por **${formatUsd(limitOrder.suggestedUsd)}** (${formatTokens(limitOrder.suggestedTokens, ticker)}) a **${formatUsd(limitOrder.limitPrice)}** (a **-${limitOrder.distancePct.toFixed(2)}%** de su desbloqueo · ${limitOrder.dipTierLabel.split(' · ')[0]}). *${limitOrder.expiryRuleLabel}.*`,
      ),
    );
  }

  for (const h of holdings) {
    if (h.isStablecoin || (h.gasTokens ?? 0) <= 0 || h.dca <= 0 || h.livePrice <= 0) continue;
    const gasTokensVal = h.gasTokens!;
    const gasDragUsd = gasTokensVal * h.livePrice;
    const priceDeltaPct = ((h.livePrice - h.dca) / h.dca) * 100;
    const netPnlPct = h.pnlPercent * 100;
    lines.push(
      `- **Nota de auditoría (${h.ticker}):** Variación de precio vs DCA histórico: ${priceDeltaPct >= 0 ? '+' : ''}${priceDeltaPct.toFixed(1)}% · P&L neto real: ${netPnlPct >= 0 ? '+' : ''}${netPnlPct.toFixed(1)}% (diferencia explicada por ${formatTokens(gasTokensVal, h.ticker)} quemados en comisiones \`Gas (Fee)\` ≈ ${formatUsd(gasDragUsd)} a precio actual).`,
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

export interface TacticalRiskAssessment {
  level: 'green' | 'yellow' | 'red';
  headline: string;
  summary: string;
  warnings: string[];
  estimatedDaysToExhaustNetLiquidity: number | null;
}

/**
 * Evaluates how aggressively a TacticalDipConfig consumes free net liquidity
 * and surfaces concrete operational liquidity guardrails (never investment advice).
 */
export function evaluateTacticalConfigRisk(
  rawConfig: Partial<TacticalDipConfig>,
): TacticalRiskAssessment {
  const clean = sanitizeTacticalDipConfig({
    ...DEFAULT_TACTICAL_DIP_CONFIG,
    ...rawConfig,
  });

  const temporalHours = clean.temporalCooldownHours ?? DEFAULT_TEMPORAL_COOLDOWN_HOURS;
  const goldSpacing = clean.goldCooldownAdditionalDropPct ?? 3.5;
  const cryptoEscape = clean.tier3EscapeDropPct ?? 15;
  const goldEscape = clean.goldTier3EscapeDropPct ?? 8;
  const firstPassShare =
    clean.multiAssetFirstPassMaxSharePct ?? DEFAULT_MULTI_ASSET_FIRST_PASS_MAX_SHARE_PCT;
  const minOrderUsd = clean.minOrderUsd ?? DEFAULT_MIN_ORDER_USD;
  const overweightTol =
    clean.groupOverweightThresholdPct ?? DEFAULT_GROUP_OVERWEIGHT_THRESHOLD_PCT;
  const cryptoT1 = clean.cryptoTier1MinDropPct ?? 10;
  const goldT1 = clean.goldTier1MinDropPct ?? 5;
  const limitProximity =
    clean.limitOrderProximityPct ?? DEFAULT_LIMIT_ORDER_PROXIMITY_PCT;

  const estimatedDaysToExhaustNetLiquidity =
    clean.tier3MaxFreeUsdtPct > 0
      ? Number((100 / clean.tier3MaxFreeUsdtPct).toFixed(1))
      : null;

  const redWarnings: string[] = [];
  if (clean.tier3MaxFreeUsdtPct > 65) {
    redWarnings.push(
      `Cupo diario de ${clean.tier3MaxFreeUsdtPct}% puede agotar casi toda tu liquidez táctica neta en menos de 2 días de caída.`,
    );
  }
  if (temporalHours < 12) {
    redWarnings.push(
      `Cooldown temporal de ${temporalHours}h (< 12h) permite disparar múltiples órdenes seguidas en el mismo activo ante rebotes falsos.`,
    );
  }
  if (clean.cooldownAdditionalDropPct < 3 || goldSpacing < 1.5) {
    redWarnings.push(
      `Espaciado adicional muy corto (+${clean.cooldownAdditionalDropPct}% Crypto / +${goldSpacing}% Oro): aumenta el riesgo de sobreacumular dentro de una misma corrección.`,
    );
  }
  if (cryptoEscape < 8 || goldEscape < 4) {
    redWarnings.push(
      `Válvula de escape demasiado sensible (-${cryptoEscape}% Core / -${goldEscape}% Oro): rompe el freno temporal ante volatilidad normal.`,
    );
  }
  if (clean.biweeklyDcaReserveUsd === 0 && clean.monthlyIncomeUsd > 0) {
    redWarnings.push(
      `Reserva para DCA regular en $0: un día de caída puede consumir el USDT destinado a tu próxima quincena.`,
    );
  }
  if (firstPassShare > 85) {
    redWarnings.push(
      `Concentración de ${firstPassShare}% en el primer activo permite que una sola moneda absorba casi todo el cupo multi-activo.`,
    );
  }
  if (minOrderUsd < 10) {
    redWarnings.push(
      `Piso mínimo por orden de ${formatUsd(minOrderUsd)} (< $10): genera micro-órdenes fragmentadas con mayor fricción operativa.`,
    );
  }
  if (clean.monthlyIncomeUsd > 0 && clean.tier3Usd > clean.monthlyIncomeUsd * 0.25) {
    redWarnings.push(
      `Bloque Nivel 3 (${formatUsd(clean.tier3Usd)}) supera el 25% de tu ingreso mensual base (${formatUsd(clean.monthlyIncomeUsd)}).`,
    );
  }
  if (limitProximity > 12) {
    redWarnings.push(
      `Zona de Acecho LIMIT muy amplia (≤ ${limitProximity}%): inmoviliza USDT en órdenes lejanas durante semanas.`,
    );
  }

  if (redWarnings.length > 0) {
    return {
      level: 'red',
      headline: 'Zona Roja · Exposición elevada de liquidez',
      summary:
        'Estas reglas reducen de forma importante los frenos de dosificación. Puedes guardarlas, pero conviene revisar el riesgo de agotar tu USDT libre antes de tiempo.',
      warnings: redWarnings,
      estimatedDaysToExhaustNetLiquidity,
    };
  }

  const yellowWarnings: string[] = [];
  if (clean.tier3MaxFreeUsdtPct > 50) {
    yellowWarnings.push(
      `Cupo diario de ${clean.tier3MaxFreeUsdtPct}% exigirá reponer liquidez con mayor rapidez tras 2 días de caída.`,
    );
  }
  if (temporalHours < 36) {
    yellowWarnings.push(
      `Cooldown temporal reducido a ${temporalHours}h (estándar: 48h): habilita compras más frecuentes tras caídas consecutivas.`,
    );
  }
  if (clean.cooldownAdditionalDropPct < 6 || goldSpacing < 3) {
    yellowWarnings.push(
      `Espaciado por precio ajustado (+${clean.cooldownAdditionalDropPct}% Crypto / +${goldSpacing}% Oro): mayor cadencia de entradas.`,
    );
  }
  if (cryptoEscape < 12 || goldEscape < 6.5) {
    yellowWarnings.push(
      `Válvula flash crash más cercana (-${cryptoEscape}% Core / -${goldEscape}% Oro) que el estándar recomendado.`,
    );
  }
  if (firstPassShare > 70) {
    yellowWarnings.push(
      `Límite multi-activo en ${firstPassShare}% (estándar: 60%): concentra más presupuesto en el primer activo elegible.`,
    );
  }
  if (overweightTol > 7) {
    yellowWarnings.push(
      `Tolerancia de sobreponderación en +${overweightTol}%: retrasa el freno del 50% en grupos cargados.`,
    );
  }
  if (cryptoT1 < 9 || goldT1 < 4.5) {
    yellowWarnings.push(
      `Umbral Nivel 1 temprano (${cryptoT1}% Crypto / ${goldT1}% Oro): activa el motor táctico con retrocesos leves.`,
    );
  }
  if (clean.monthlyIncomeUsd > 0 && clean.tier3Usd > clean.monthlyIncomeUsd * 0.16) {
    yellowWarnings.push(
      `Bloque Nivel 3 (${formatUsd(clean.tier3Usd)}) exige más del 16% del ingreso mensual en un solo disparo.`,
    );
  }
  if (limitProximity > 8) {
    yellowWarnings.push(
      `Zona de Acecho LIMIT ampliada a ${limitProximity}% (estándar: 3%): aumenta el tiempo que las órdenes quedan en espera.`,
    );
  }

  if (yellowWarnings.length > 0) {
    return {
      level: 'yellow',
      headline: 'Zona Amarilla · Ritmo ágil sobre la liquidez',
      summary:
        'Dosificación más activa que el estándar recomendado; vigila tu margen de USDT libre en caídas encadenadas.',
      warnings: yellowWarnings,
      estimatedDaysToExhaustNetLiquidity,
    };
  }

  return {
    level: 'green',
    headline: 'Zona Verde · Dosificación equilibrada de liquidez',
    summary:
      'Mantiene los frenos operativos recomendados entre reserva de DCA regular, límite diario y espera entre entradas.',
    warnings: [],
    estimatedDaysToExhaustNetLiquidity,
  };
}

export interface TacticalImpactSnapshot {
  freeTacticalUsdtUsd: number;
  dailyCapUsd: number;
  totalSuggestedBuyTodayUsd: number;
  totalSuggestedLimitTodayUsd: number;
  remainingLiquidityAfterOpsUsd: number;
  remainingNetTacticalAfterOpsUsd: number;
  assetSuggestions: Record<string, SmartTradeRecommendation>;
}

export interface TacticalAssetImpactChange {
  ticker: string;
  signal: CoinHolding['tradeSignal'];
  beforeUsd: number;
  afterUsd: number;
  beforeLimitUsd?: number;
  afterLimitUsd?: number;
  beforeStatus: string;
  afterStatus: string;
}

export interface TacticalConfigImpactComparison {
  before: TacticalImpactSnapshot;
  after: TacticalImpactSnapshot;
  dailyCapDeltaUsd: number;
  totalBuyDeltaUsd: number;
  remainingLiquidityDeltaUsd: number;
  changedAssets: TacticalAssetImpactChange[];
}

function summarizeConfigImpactSnapshot(
  holdings: CoinHolding[],
  eligibleCapitalUsd: number,
  targetAllocations: TargetAllocations | undefined,
  config: TacticalDipConfig,
  nowMs: number,
): TacticalImpactSnapshot {
  const cleanEligible = Math.max(0, Number(eligibleCapitalUsd.toFixed(2)));
  const freeTacticalUsdtUsd = Number(
    Math.max(0, cleanEligible - config.biweeklyDcaReserveUsd).toFixed(2),
  );
  const dailyCapUsd = Number(
    (freeTacticalUsdtUsd * (config.tier3MaxFreeUsdtPct / 100)).toFixed(2),
  );
  const activeHoldings = holdings.filter((h) => !h.isStablecoin && h.livePrice > 0);
  const totalVolatileCryptoUsd = activeHoldings.reduce((acc, h) => acc + h.currentValue, 0);

  const assetSuggestions: Record<string, SmartTradeRecommendation> = {};
  let totalSuggestedBuyTodayUsd = 0;
  let totalSuggestedLimitTodayUsd = 0;

  for (const h of activeHoldings) {
    const rec = computeSmartTradeRecommendation({
      holding: h,
      eligibleCapitalUsd: cleanEligible,
      totalVolatileCryptoUsd,
      allVolatileHoldings: activeHoldings,
      tacticalConfig: config,
      targetAllocations,
      nowMs,
    });
    assetSuggestions[h.ticker.toUpperCase()] = rec;
    totalSuggestedBuyTodayUsd = Number(
      (totalSuggestedBuyTodayUsd + rec.tacticalBuyUsd).toFixed(2),
    );
    totalSuggestedLimitTodayUsd = Number(
      (totalSuggestedLimitTodayUsd + (rec.limitOrder?.suggestedUsd ?? 0)).toFixed(2),
    );
  }

  return {
    freeTacticalUsdtUsd,
    dailyCapUsd,
    totalSuggestedBuyTodayUsd,
    totalSuggestedLimitTodayUsd,
    remainingLiquidityAfterOpsUsd: Number(
      Math.max(0, cleanEligible - totalSuggestedBuyTodayUsd).toFixed(2),
    ),
    remainingNetTacticalAfterOpsUsd: Number(
      Math.max(0, freeTacticalUsdtUsd - totalSuggestedBuyTodayUsd).toFixed(2),
    ),
    assetSuggestions,
  };
}

function formatRecommendationStatus(rec: SmartTradeRecommendation | undefined): string {
  if (!rec) return 'Sin datos';
  if (rec.tacticalBuyUsd > 0) {
    return `${formatUsd(rec.tacticalBuyUsd)} (${rec.dipTierLabel.split(' · ')[0]})`;
  }
  if (rec.limitOrder) {
    return `LIMIT ${formatUsd(rec.limitOrder.suggestedUsd)} @ ${formatUsd(rec.limitOrder.limitPrice)} (-${rec.limitOrder.distancePct.toFixed(1)}%)`;
  }
  if (rec.signal === 'BUY' && rec.blockedReason) return rec.blockedReason;
  if (rec.signal === 'SELL') return `SELL (+${rec.pumpFromDcaPct.toFixed(1)}%)`;
  return 'WATCH';
}

/**
 * Simulates Before-vs-After liquidity caps and active asset suggestions for live configuration previews.
 */
export function simulateTacticalConfigImpact(params: {
  holdings: CoinHolding[];
  eligibleCapitalUsd: number;
  targetAllocations?: TargetAllocations;
  currentConfig: Partial<TacticalDipConfig>;
  candidateConfig: Partial<TacticalDipConfig>;
  nowMs?: number;
}): TacticalConfigImpactComparison {
  const {
    holdings,
    eligibleCapitalUsd,
    targetAllocations,
    currentConfig,
    candidateConfig,
    nowMs = Date.now(),
  } = params;

  const resolvedCurrent = sanitizeTacticalDipConfig({
    ...DEFAULT_TACTICAL_DIP_CONFIG,
    ...currentConfig,
  });
  const resolvedCandidate = sanitizeTacticalDipConfig({
    ...DEFAULT_TACTICAL_DIP_CONFIG,
    ...candidateConfig,
  });

  const before = summarizeConfigImpactSnapshot(
    holdings,
    eligibleCapitalUsd,
    targetAllocations,
    resolvedCurrent,
    nowMs,
  );
  const after = summarizeConfigImpactSnapshot(
    holdings,
    eligibleCapitalUsd,
    targetAllocations,
    resolvedCandidate,
    nowMs,
  );

  const activeHoldings = holdings.filter((h) => !h.isStablecoin && h.livePrice > 0);
  const changedAssets: TacticalAssetImpactChange[] = [];

  for (const h of activeHoldings) {
    const key = h.ticker.toUpperCase();
    const prevRec = before.assetSuggestions[key];
    const nextRec = after.assetSuggestions[key];
    const beforeUsd = prevRec?.tacticalBuyUsd ?? 0;
    const afterUsd = nextRec?.tacticalBuyUsd ?? 0;
    const beforeLimitUsd = prevRec?.limitOrder?.suggestedUsd ?? 0;
    const afterLimitUsd = nextRec?.limitOrder?.suggestedUsd ?? 0;
    const beforeStatus = formatRecommendationStatus(prevRec);
    const afterStatus = formatRecommendationStatus(nextRec);

    if (
      h.tradeSignal === 'BUY' ||
      Math.abs(afterUsd - beforeUsd) >= 0.01 ||
      Math.abs(afterLimitUsd - beforeLimitUsd) >= 0.01 ||
      Boolean(prevRec?.limitOrder) ||
      Boolean(nextRec?.limitOrder) ||
      beforeStatus !== afterStatus
    ) {
      changedAssets.push({
        ticker: h.ticker,
        signal: h.tradeSignal,
        beforeUsd,
        afterUsd,
        beforeLimitUsd,
        afterLimitUsd,
        beforeStatus,
        afterStatus,
      });
    }
  }

  return {
    before,
    after,
    dailyCapDeltaUsd: Number((after.dailyCapUsd - before.dailyCapUsd).toFixed(2)),
    totalBuyDeltaUsd: Number(
      (after.totalSuggestedBuyTodayUsd - before.totalSuggestedBuyTodayUsd).toFixed(2),
    ),
    remainingLiquidityDeltaUsd: Number(
      (after.remainingLiquidityAfterOpsUsd - before.remainingLiquidityAfterOpsUsd).toFixed(2),
    ),
    changedAssets,
  };
}
