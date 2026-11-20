/** Core transaction type matching the CSV schema */
export interface Transaction {
  date: string;       // ISO string "YYYY-MM-DD HH:mm:ss"
  type: TransactionType;
  asset: string;      // Ticker symbol: "BTC", "USDT", "ETH" — ALL are assets now
  tokens: string;     // Stored as string to preserve precision
  usdValue: number;
}

/**
 * Unified transaction types.
 * The old Fiat-only restriction is removed: ALL tickers (including stablecoins)
 * support ALL operation types. "Deposit" and "Withdraw" represent external
 * money-in / money-out events regardless of whether the asset is USD, USDT, or BTC.
 */
export type TransactionType =
  | 'Deposit'
  | 'Withdraw'
  | 'Buy'
  | 'Sell'
  | 'Earn (Staking)'
  | 'Gas (Fee)';

export const TRANSACTION_TYPES: TransactionType[] = [
  'Deposit',
  'Withdraw',
  'Buy',
  'Sell',
  'Earn (Staking)',
  'Gas (Fee)',
];

/**
 * Transaction types where cost basis is automatically $0.
 * Applies to ANY asset (crypto or stablecoin).
 */
export const ZERO_COST_TX_TYPES: TransactionType[] = ['Earn (Staking)', 'Gas (Fee)'];

/**
 * Deposit/Withdraw are "external flow" types — money enters or leaves the portfolio.
 * They require a USD value but no token quantity (tokens derived from USD for stablecoins).
 */
export const EXTERNAL_FLOW_TX_TYPES: TransactionType[] = ['Deposit', 'Withdraw'];

/** Coin-to-CoinGecko ID mapping */
export type CoinMappings = Record<string, string>;

/** Per-coin buy/sell target percentages */
export interface CoinTargets {
  [ticker: string]: {
    buy: number;   // % drop from DCA to trigger BUY
    sell: number;  // % pump from DCA to trigger SELL
  };
}

/** Live price data from CoinGecko */
export type LivePrices = Record<string, { usd: number }>;

/** Computed per-coin investment summary */
export interface CoinHolding {
  ticker: string;
  coinGeckoId: string | null;
  isStablecoin: boolean;
  currentTokens: number;
  /** Cumulative tokens consumed by Gas (Fee) transactions */
  gasTokens?: number;
  totalSpent: number;      // sum of Buy USD
  soldUsd: number;         // sum of Sell USD
  investedUsd: number;     // totalSpent - soldUsd
  dca: number;             // totalSpent / (bought + earned)
  livePrice: number;
  currentValue: number;    // currentTokens * livePrice
  pnl: number;             // currentValue - investedUsd
  pnlPercent: number;      // pnl / investedUsd
  targetBuyPct: number;
  targetSellPct: number;
  targetBuyPrice: number;  // dca * (1 - buyPct/100)
  targetSellPrice: number; // dca * (1 + sellPct/100)
  tradeSignal: 'BUY' | 'SELL' | 'WATCH';
  /** Cooldown state derived chronologically from transactions */
  highestConsumedDipTier?: DipTier;
  lastDipBuyPrice?: number;
  lastDipBuyDate?: string;
  lastDipBuyUsd?: number;
}

/** Portfolio-level aggregated data */
export interface PortfolioSummary {
  totalDeposits: number;
  totalWithdrawals: number;
  assetsBought: number;
  assetsSold: number;
  totalCryptoValue: number;   // volatile assets only
  totalStableValue: number;   // stablecoin holdings value
  totalPortfolioValue: number;
  netFiatInvested: number;    // deposits - withdrawals
  totalPnl: number;           // totalPortfolioValue - netFiatInvested
}

export type DipTier = 0 | 1 | 2 | 3;

export type VolatilityProfileId = 'crypto' | 'defensive_gold';

export type TacticalProfilePresetId =
  | 'conservador'
  | 'equilibrado'
  | 'agresivo'
  | 'personalizado';

export interface TacticalDipConfig {
  presetId?: TacticalProfilePresetId;
  monthlyIncomeUsd: number;
  tier1Usd: number;
  tier2Usd: number;
  tier3Usd: number;
  tier3MaxFreeUsdtPct: number;
  biweeklyDcaReserveUsd: number;
  cooldownAdditionalDropPct: number;
  /** Minimum USD per tactical order to avoid dust orders (default $20) */
  minOrderUsd?: number;
  /** Temporal lock window in hours after a tactical buy (default 48h) */
  temporalCooldownHours?: number;
  /** Max first-pass share (%) per asset when splitting across >= 2 eligible assets (default 60%) */
  multiAssetFirstPassMaxSharePct?: number;
  /** Group overweight tolerance (+%) before halving tactical block (default +5%) */
  groupOverweightThresholdPct?: number;
  /** Capitulation / Flash Crash % drop below last buy for Crypto (default 15%) */
  tier3EscapeDropPct?: number;
  /** Defensive Gold (PAXG/XAUT) cooldown additional drop % (default 3.5%) */
  goldCooldownAdditionalDropPct?: number;
  /** Defensive Gold (PAXG/XAUT) Tier 3 capitulation / Flash Crash drop % (default 8%) */
  goldTier3EscapeDropPct?: number;
  /** Custom Crypto drawdown thresholds (%) for Tiers 1/2/3 (defaults 10 / 15 / 22) */
  cryptoTier1MinDropPct?: number;
  cryptoTier2MinDropPct?: number;
  cryptoTier3MinDropPct?: number;
  /** Custom Defensive Gold drawdown thresholds (%) for Tiers 1/2/3 (defaults 5 / 8 / 12) */
  goldTier1MinDropPct?: number;
  goldTier2MinDropPct?: number;
  goldTier3MinDropPct?: number;
}

export interface SmartTradeRecommendation {
  ticker: string;
  signal: 'BUY' | 'SELL' | 'WATCH';
  volatilityProfile?: VolatilityProfileId;
  dropFromDcaPct: number;
  pumpFromDcaPct: number;
  /** Informational only: USD needed at livePrice to shift DCA enough to exit Target Buy */
  breakEvenBuyUsd: number;
  breakEvenBuyTokens: number;
  newDcaAfterBreakEven: number;
  /** Drop depth tier: 1 (10-14.9%), 2 (15-21.9%), 3 (>=22%), 0 (<10%) */
  dipTier: DipTier;
  dipTierLabel: string;
  /** Fixed-tier tactical buy bounded by free digital USDT and priority queue (>= $20 or $0) */
  tacticalBuyUsd: number;
  tacticalBuyTokens: number;
  newDcaAfterTactical: number;
  eligibleCapitalUsd: number;
  freeTacticalUsdtUsd: number;
  residualAfterBuyUsd: number;
  isCappedByBreakEven?: boolean;
  isCooldownLocked?: boolean;
  isTimeCooldownLocked?: boolean;
  timeCooldownRemainingHours?: number;
  flashCrashUnlockPrice?: number;
  isFlashCrashOverrideUnlocked?: boolean;
  isTier3EscapeUnlocked?: boolean;
  isGroupOverweightTrimmed?: boolean;
  groupDriftPct?: number;
  highestConsumedDipTier?: DipTier;
  lastDipBuyPrice?: number;
  lastDipBuyDate?: string;
  nextUnlockPrice?: number;
  priorityRank?: number;
  sharedAmongBuyCount?: number;
  globalTierBudgetUsd?: number;
  dailyCapUsd?: number;
  blockedReason?: string;
  concentrationWarning?: string;
  /** Suggested 25% staged profit trim when signal === 'SELL' */
  suggestedSellTokens: number;
  suggestedSellUsd: number;
}

export type CryptoGroupKey =
  | 'GROUP:BTC'
  | 'GROUP:ETH'
  | 'GROUP:SOL'
  | 'GROUP:GOLD'
  | 'GROUP:ALTS';

/** Maps group ID ('GROUP:BTC') or ticker ('BTC') to target portfolio percentage (0-100) */
export type TargetAllocations = Record<string, number>;

export interface PortfolioExposureItem {
  id: string;
  label: string;
  tickers: string[];
  valueUsd: number;
  investedUsd: number;
  pnlUsd: number;
  currentPct: number;
  targetPct: number | null;
  deltaPct: number | null;
  /** Positive = USD to buy to reach target; Negative = USD overweight to trim */
  rebalanceDeltaUsd: number | null;
  rebalanceStatus: 'UNDERWEIGHT' | 'OVERWEIGHT' | 'BALANCED' | 'NO_TARGET';
  isLiquidity?: boolean;
}
