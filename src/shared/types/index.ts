/** Core transaction type matching the CSV schema */
export interface Transaction {
  date: string;       // ISO string "YYYY-MM-DD HH:mm:ss"
  type: TransactionType;
  asset: string;      // Ticker symbol: "BTC", "ETH", "USD"
  tokens: string;     // Stored as string to preserve precision
  usdValue: number;
}

export type TransactionType =
  | 'Deposit Fiat'
  | 'Withdraw Fiat'
  | 'Buy Crypto'
  | 'Sell Crypto'
  | 'Earn (Staking)'
  | 'Gas (Fee)';

export const TRANSACTION_TYPES: TransactionType[] = [
  'Deposit Fiat',
  'Withdraw Fiat',
  'Buy Crypto',
  'Sell Crypto',
  'Earn (Staking)',
  'Gas (Fee)',
];

export const FIAT_TX_TYPES: TransactionType[] = ['Deposit Fiat', 'Withdraw Fiat'];
export const ZERO_COST_TX_TYPES: TransactionType[] = ['Earn (Staking)', 'Gas (Fee)'];

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
  cryptoBought: number;
  cryptoSold: number;
  fiatBalance: number;       // deposits - withdrawals - bought + sold
  totalCryptoValue: number;
  totalPortfolioValue: number;
  netFiatInvested: number;   // deposits - withdrawals
  totalPnl: number;          // totalPortfolioValue - netFiatInvested
}
