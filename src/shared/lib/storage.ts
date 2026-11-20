import type {
  CoinMappings,
  CoinTargets,
  TacticalDipConfig,
  TacticalProfilePresetId,
  TargetAllocations,
  Transaction,
} from '../types';

const KEYS = {
  TARGETS: 'coin-targets',
  MAPPINGS: 'coin-mappings',
  API_KEY: 'coingecko-api-key',
  TRANSACTIONS: 'portfolio-transactions',
  STABLECOINS: 'stablecoin-tickers',
  GOAL_TARGET: 'portfolio-goal-target',
  COIN_ORDER: 'portfolio-coin-order',
  ARCHIVED_COINS: 'portfolio-archived-coins',
  TACTICAL_DIP_CONFIG: 'portfolio-tactical-dip-config',
  TARGET_ALLOCATIONS: 'portfolio-target-allocations',
} as const;

export const DEFAULT_TARGET_ALLOCATIONS: TargetAllocations = {
  'GROUP:BTC': 50,
  'GROUP:ETH': 20,
  'GROUP:SOL': 15,
  'GROUP:GOLD': 10,
  'GROUP:ALTS': 5,
};

export const DEFAULT_TACTICAL_DIP_CONFIG: TacticalDipConfig = {
  presetId: 'equilibrado',
  monthlyIncomeUsd: 900,
  tier1Usd: 45,
  tier2Usd: 70,
  tier3Usd: 100,
  tier3MaxFreeUsdtPct: 40,
  biweeklyDcaReserveUsd: 50,
  cooldownAdditionalDropPct: 7.5,
  minOrderUsd: 20,
  temporalCooldownHours: 48,
  multiAssetFirstPassMaxSharePct: 60,
  groupOverweightThresholdPct: 5,
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
};

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
  PAXG: { buy: 5, sell: 15 },
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

// ── Public API: Tactical Dip-Buying Config ──

function sanitizeNumber(value: unknown, fallback: number, min = 0, max = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Number(Math.min(max, Math.max(min, value)).toFixed(2));
}

const VALID_TACTICAL_PRESETS = new Set<TacticalProfilePresetId>([
  'conservador',
  'equilibrado',
  'agresivo',
  'personalizado',
]);

export function sanitizeTacticalDipConfig(
  raw: Partial<TacticalDipConfig> | null | undefined,
): TacticalDipConfig {
  const src = raw ?? {};
  const rawPreset = src.presetId;
  const presetId: TacticalProfilePresetId =
    rawPreset && VALID_TACTICAL_PRESETS.has(rawPreset) ? rawPreset : 'equilibrado';

  return {
    presetId,
    monthlyIncomeUsd: sanitizeNumber(
      src.monthlyIncomeUsd,
      DEFAULT_TACTICAL_DIP_CONFIG.monthlyIncomeUsd,
      0,
    ),
    tier1Usd: sanitizeNumber(src.tier1Usd, DEFAULT_TACTICAL_DIP_CONFIG.tier1Usd, 0),
    tier2Usd: sanitizeNumber(src.tier2Usd, DEFAULT_TACTICAL_DIP_CONFIG.tier2Usd, 0),
    tier3Usd: sanitizeNumber(src.tier3Usd, DEFAULT_TACTICAL_DIP_CONFIG.tier3Usd, 0),
    tier3MaxFreeUsdtPct: sanitizeNumber(
      src.tier3MaxFreeUsdtPct,
      DEFAULT_TACTICAL_DIP_CONFIG.tier3MaxFreeUsdtPct,
      1,
      100,
    ),
    biweeklyDcaReserveUsd: sanitizeNumber(
      src.biweeklyDcaReserveUsd,
      DEFAULT_TACTICAL_DIP_CONFIG.biweeklyDcaReserveUsd,
      0,
    ),
    cooldownAdditionalDropPct: sanitizeNumber(
      src.cooldownAdditionalDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.cooldownAdditionalDropPct,
      0,
      90,
    ),
    minOrderUsd: sanitizeNumber(
      src.minOrderUsd,
      DEFAULT_TACTICAL_DIP_CONFIG.minOrderUsd ?? 20,
      0,
      100_000,
    ),
    temporalCooldownHours: sanitizeNumber(
      src.temporalCooldownHours,
      DEFAULT_TACTICAL_DIP_CONFIG.temporalCooldownHours ?? 48,
      0,
      720,
    ),
    multiAssetFirstPassMaxSharePct: sanitizeNumber(
      src.multiAssetFirstPassMaxSharePct,
      DEFAULT_TACTICAL_DIP_CONFIG.multiAssetFirstPassMaxSharePct ?? 60,
      10,
      100,
    ),
    groupOverweightThresholdPct: sanitizeNumber(
      src.groupOverweightThresholdPct,
      DEFAULT_TACTICAL_DIP_CONFIG.groupOverweightThresholdPct ?? 5,
      0,
      100,
    ),
    tier3EscapeDropPct: sanitizeNumber(
      src.tier3EscapeDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.tier3EscapeDropPct ?? 15,
      1,
      90,
    ),
    goldCooldownAdditionalDropPct: sanitizeNumber(
      src.goldCooldownAdditionalDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.goldCooldownAdditionalDropPct ?? 3.5,
      0,
      50,
    ),
    goldTier3EscapeDropPct: sanitizeNumber(
      src.goldTier3EscapeDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.goldTier3EscapeDropPct ?? 8,
      1,
      90,
    ),
    cryptoTier1MinDropPct: sanitizeNumber(
      src.cryptoTier1MinDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.cryptoTier1MinDropPct ?? 10,
      1,
      95,
    ),
    cryptoTier2MinDropPct: sanitizeNumber(
      src.cryptoTier2MinDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.cryptoTier2MinDropPct ?? 15,
      1,
      95,
    ),
    cryptoTier3MinDropPct: sanitizeNumber(
      src.cryptoTier3MinDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.cryptoTier3MinDropPct ?? 22,
      1,
      95,
    ),
    goldTier1MinDropPct: sanitizeNumber(
      src.goldTier1MinDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.goldTier1MinDropPct ?? 5,
      1,
      95,
    ),
    goldTier2MinDropPct: sanitizeNumber(
      src.goldTier2MinDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.goldTier2MinDropPct ?? 8,
      1,
      95,
    ),
    goldTier3MinDropPct: sanitizeNumber(
      src.goldTier3MinDropPct,
      DEFAULT_TACTICAL_DIP_CONFIG.goldTier3MinDropPct ?? 12,
      1,
      95,
    ),
    limitOrderProximityPct: sanitizeNumber(
      src.limitOrderProximityPct,
      DEFAULT_TACTICAL_DIP_CONFIG.limitOrderProximityPct ?? 3,
      0,
      25,
    ),
  };
}

export function getTacticalDipConfig(): TacticalDipConfig {
  const stored = getJson<Partial<TacticalDipConfig>>(
    KEYS.TACTICAL_DIP_CONFIG,
    DEFAULT_TACTICAL_DIP_CONFIG,
  );
  return sanitizeTacticalDipConfig(stored);
}

export function saveTacticalDipConfig(config: TacticalDipConfig): void {
  setJson(KEYS.TACTICAL_DIP_CONFIG, sanitizeTacticalDipConfig(config));
}

// ── Public API: Portfolio Target Allocations (%) ──

export function sanitizeTargetAllocations(
  raw: Record<string, unknown> | null | undefined,
): TargetAllocations {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TARGET_ALLOCATIONS };
  const clean: TargetAllocations = {};
  for (const [key, val] of Object.entries(raw)) {
    const cleanKey = key.trim().toUpperCase();
    if (!cleanKey) continue;
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      clean[cleanKey] = Number(Math.min(100, val).toFixed(2));
    }
  }
  return clean;
}

export function getTargetAllocations(): TargetAllocations {
  const stored = getJson<Record<string, unknown>>(
    KEYS.TARGET_ALLOCATIONS,
    DEFAULT_TARGET_ALLOCATIONS,
  );
  return sanitizeTargetAllocations(stored);
}

export function saveTargetAllocations(targets: TargetAllocations): void {
  setJson(KEYS.TARGET_ALLOCATIONS, sanitizeTargetAllocations(targets));
}
