import type { CoinMappings, CoinTargets } from '../types';

const KEYS = {
  TARGETS: 'coin-targets',
  MAPPINGS: 'coin-mappings',
  API_KEY: 'coingecko-api-key',
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
};

const DEFAULT_TARGETS: CoinTargets = {
  BTC: { buy: 15, sell: 30 },
  WBETH: { buy: 20, sell: 40 },
  BNSOL: { buy: 25, sell: 50 },
  BNB: { buy: 15, sell: 30 },
  '0G': { buy: 100, sell: 50 },
  BEAM: { buy: 100, sell: 50 },
};

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

// ── Public API ──

export function getCoinMappings(): CoinMappings {
  return getJson(KEYS.MAPPINGS, DEFAULT_MAPPINGS);
}

export function saveCoinMappings(mappings: CoinMappings): void {
  setJson(KEYS.MAPPINGS, mappings);
}

export function getCoinTargets(): CoinTargets {
  return getJson(KEYS.TARGETS, DEFAULT_TARGETS);
}

export function saveCoinTargets(targets: CoinTargets): void {
  setJson(KEYS.TARGETS, targets);
}

export function getApiKey(): string {
  return localStorage.getItem(KEYS.API_KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEYS.API_KEY, key.trim());
}
