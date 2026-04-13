import type { CoinMappings, CoinTargets, Transaction } from '../types';

const KEYS = {
  TARGETS: 'coin-targets',
  MAPPINGS: 'coin-mappings',
  API_KEY: 'coingecko-api-key',
  TRANSACTIONS: 'portfolio-transactions',
  STABLECOINS: 'stablecoin-tickers',
} as const;

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

export function getPersistedTransactions(): Transaction[] {
  return getJson<Transaction[]>(KEYS.TRANSACTIONS, []);
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
