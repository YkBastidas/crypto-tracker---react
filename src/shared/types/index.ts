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
