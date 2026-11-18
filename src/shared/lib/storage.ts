import type { CoinMappings, CoinTargets, Transaction } from '../types';

const KEYS = {
  TARGETS: 'coin-targets',
  MAPPINGS: 'coin-mappings',
  API_KEY: 'coingecko-api-key',
  TRANSACTIONS: 'portfolio-transactions',
  STABLECOINS: 'stablecoin-tickers',
  GOAL_TARGET: 'portfolio-goal-target',
  COIN_ORDER: 'portfolio-coin-order',
  ARCHIVED_COINS: 'portfolio-archived-coins',
} as const;

const DEFAULT_GOAL_TARGET = 20_000;

// ── Default coin → CoinGecko ID mappings (ported from coinlist-ids.json) ──
const DEFAULT_MAPPINGS: CoinMappings = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  WBETH: 'wrapped-beacon-eth',
  PAXG: 'pax-gold',
  BNSOL: 'binance-staked-sol',
  BNB: 'binancecoin',
  '0G': 'zero-gravity',
  BEAM: 'beam-2',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
};

const DEFAULT_TARGETS: CoinTargets = {
  BTC: { buy: 15, sell: 30 },
  WBETH: { buy: 20, sell: 40 },
  BNSOL: { buy: 25, sell: 50 },
  BNB: { buy: 15, sell: 30 },
  '0G': { buy: 100, sell: 50 },
  BEAM: { buy: 100, sell: 50 },
};

const DEFAULT_STABLECOINS: string[] = ['USDT', 'USDC', 'DAI'];

// ── Generic helpers ──

function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Public API: Coin Mappings ──

export function getCoinMappings(): CoinMappings {
  return getJson(KEYS.MAPPINGS, DEFAULT_MAPPINGS);
}

export function saveCoinMappings(mappings: CoinMappings): void {
  setJson(KEYS.MAPPINGS, mappings);
}

// ── Public API: Targets ──

export function getCoinTargets(): CoinTargets {
  return getJson(KEYS.TARGETS, DEFAULT_TARGETS);
}

export function saveCoinTargets(targets: CoinTargets): void {
  setJson(KEYS.TARGETS, targets);
}

// ── Public API: API Key ──

export function getApiKey(): string {
  return localStorage.getItem(KEYS.API_KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEYS.API_KEY, key.trim());
}

// ── Public API: Transaction Persistence ──

export const DEFAULT_TRANSACTIONS: Transaction[] = [
  { date: '2026-03-01 10:00:00', type: 'Deposit', asset: 'USDT', tokens: '3200.00', usdValue: 3200 },
  { date: '2026-03-05 14:20:00', type: 'Buy', asset: 'BTC', tokens: '0.02', usdValue: 1500 },
  { date: '2026-03-05 14:20:00', type: 'Sell', asset: 'USDT', tokens: '1500.00', usdValue: 1500 },
  { date: '2026-03-10 11:15:00', type: 'Buy', asset: 'ETH', tokens: '0.25', usdValue: 600 },
  { date: '2026-03-10 11:15:00', type: 'Sell', asset: 'USDT', tokens: '600.00', usdValue: 600 },
  { date: '2026-03-12 16:40:00', type: 'Buy', asset: 'SOL', tokens: '2.50', usdValue: 400 },
  { date: '2026-03-12 16:40:00', type: 'Sell', asset: 'USDT', tokens: '400.00', usdValue: 400 },
  { date: '2026-03-15 09:30:00', type: 'Buy', asset: 'PAXG', tokens: '0.075', usdValue: 200 },
  { date: '2026-03-15 09:30:00', type: 'Sell', asset: 'USDT', tokens: '200.00', usdValue: 200 },
];

export function getPersistedTransactions(): Transaction[] {
  return getJson<Transaction[]>(KEYS.TRANSACTIONS, DEFAULT_TRANSACTIONS);
}

export function persistTransactions(transactions: Transaction[]): void {
  setJson(KEYS.TRANSACTIONS, transactions);
}

// ── Public API: Stablecoin Tickers ──

export function getStablecoins(): string[] {
  return getJson<string[]>(KEYS.STABLECOINS, DEFAULT_STABLECOINS);
}

export function saveStablecoins(tickers: string[]): void {
  setJson(KEYS.STABLECOINS, tickers.map((t) => t.toUpperCase().trim()).filter(Boolean));
}

// ── Public API: Portfolio Goal Target ──

export function getPortfolioGoal(): number {
  const stored = getJson<number>(KEYS.GOAL_TARGET, DEFAULT_GOAL_TARGET);
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0
    ? stored
    : DEFAULT_GOAL_TARGET;
}

export function savePortfolioGoal(target: number): void {
  if (!Number.isFinite(target) || target <= 0) return;
  setJson(KEYS.GOAL_TARGET, Number(target.toFixed(2)));
}

// ── Public API: Custom Coin Order ──

export function getCustomCoinOrder(): string[] {
  return getJson<string[]>(KEYS.COIN_ORDER, []);
}

export function saveCustomCoinOrder(order: string[]): void {
  setJson(
    KEYS.COIN_ORDER,
    order.map((t) => t.toUpperCase().trim()).filter(Boolean),
  );
}

// ── Public API: Archived / Closed Coins ──

export function getArchivedCoins(): string[] {
  return getJson<string[]>(KEYS.ARCHIVED_COINS, []);
}

export function saveArchivedCoins(tickers: string[]): void {
  setJson(
    KEYS.ARCHIVED_COINS,
    Array.from(new Set(tickers.map((t) => t.toUpperCase().trim()).filter(Boolean))),
  );
}
