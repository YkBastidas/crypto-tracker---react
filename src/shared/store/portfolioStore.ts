import { create } from 'zustand';
import type { Transaction, CoinMappings, TacticalDipConfig } from '../types';
import {
  DEFAULT_TRANSACTIONS,
  getCoinMappings,
  saveCoinMappings,
  getPersistedTransactions,
  persistTransactions,
  getStablecoins,
  saveStablecoins,
  getPortfolioGoal,
  savePortfolioGoal,
  getCustomCoinOrder,
  saveCustomCoinOrder,
  getArchivedCoins,
  saveArchivedCoins,
  getTacticalDipConfig,
  saveTacticalDipConfig,
  sanitizeTacticalDipConfig,
} from '../lib/storage';

interface PortfolioState {
  // State
  transactions: Transaction[];
  isDirty: boolean;
  isPrivate: boolean;
  coinMappings: CoinMappings;
  stablecoins: string[];
  goalTarget: number;
  customCoinOrder: string[];
  archivedCoins: string[];
  tacticalDipConfig: TacticalDipConfig;
  undoTransactions: Transaction[] | null;
  undoLabel: string | null;

  // Actions
  loadTransactions: (txs: Transaction[]) => void;
  addTransaction: (tx: Transaction) => void;
  addTransactionsBatch: (txs: Transaction[], label?: string) => void;
  updateTransaction: (index: number, patch: Partial<Transaction>) => void;
  removeTransaction: (index: number) => void;
  removeCoinTransactions: (ticker: string) => void;
  setCustomCoinOrder: (order: string[]) => void;
  archiveCoin: (ticker: string) => void;
  unarchiveCoin: (ticker: string) => void;
  setTacticalDipConfig: (patch: Partial<TacticalDipConfig>) => void;
  undoLastPortfolioAction: () => void;
  dismissPortfolioUndo: () => void;
  togglePrivacy: () => void;
  setDirty: (dirty: boolean) => void;
  updateCoinMapping: (ticker: string, coinGeckoId: string) => void;
  setStablecoins: (tickers: string[]) => void;
  isStablecoin: (ticker: string) => boolean;
  setGoalTarget: (target: number) => void;
  resetToDefaultTransactions: () => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  // ── Hydrate from localStorage on creation ──
  transactions: getPersistedTransactions(),
  isDirty: false,
  isPrivate: false,
  coinMappings: getCoinMappings(),
  stablecoins: getStablecoins(),
  goalTarget: getPortfolioGoal(),
  customCoinOrder: getCustomCoinOrder(),
  archivedCoins: getArchivedCoins(),
  tacticalDipConfig: getTacticalDipConfig(),
  undoTransactions: null,
  undoLabel: null,

  loadTransactions: (txs) => {
    persistTransactions(txs);
    set({ transactions: txs, isDirty: false, undoTransactions: null, undoLabel: null });
  },

  addTransaction: (tx) => {
    const prev = get().transactions;
    const updated = [...prev, tx];
    persistTransactions(updated);
    set({
      transactions: updated,
      isDirty: true,
      undoTransactions: prev,
      undoLabel: `Agregada: ${tx.type} ${tx.asset}`,
    });
  },

  addTransactionsBatch: (txs, label) => {
    if (txs.length === 0) return;
    const prev = get().transactions;
    const updated = [...prev, ...txs];
    persistTransactions(updated);
    set({
      transactions: updated,
      isDirty: true,
      undoTransactions: prev,
      undoLabel:
        label ?? `Agregadas ${txs.length} transacciones (${txs[0].type} ${txs[0].asset})`,
    });
  },

  updateTransaction: (index, patch) => {
    const prev = get().transactions;
    const target = prev[index];
    if (!target) return;
    const updated = prev.map((tx, i) => (i === index ? { ...tx, ...patch } : tx));
    persistTransactions(updated);
    set({
      transactions: updated,
      isDirty: true,
      undoTransactions: prev,
      undoLabel: `Editada: ${target.type} ${target.asset}`,
    });
  },

  removeTransaction: (index) => {
    const prev = get().transactions;
    const target = prev[index];
    if (!target) return;
    const updated = prev.filter((_, i) => i !== index);
    persistTransactions(updated);
    set({
      transactions: updated,
      isDirty: true,
      undoTransactions: prev,
      undoLabel: `Eliminada: ${target.type} ${target.asset}`,
    });
  },

  removeCoinTransactions: (ticker) => {
    const clean = ticker.toUpperCase().trim();
    const prev = get().transactions;
    const updated = prev.filter((tx) => tx.asset.toUpperCase() !== clean);
    if (updated.length === prev.length) return;

    persistTransactions(updated);
    const nextArchived = get().archivedCoins.filter((t) => t.toUpperCase() !== clean);
    saveArchivedCoins(nextArchived);
    set({
      transactions: updated,
      archivedCoins: nextArchived,
      isDirty: true,
      undoTransactions: prev,
      undoLabel: `Eliminada moneda: ${clean}`,
    });
  },

  setCustomCoinOrder: (order) => {
    const upper = order.map((t) => t.toUpperCase().trim()).filter(Boolean);
    saveCustomCoinOrder(upper);
    set({ customCoinOrder: upper });
  },

  archiveCoin: (ticker) => {
    const clean = ticker.toUpperCase().trim();
    if (!clean) return;
    const next = Array.from(new Set([...get().archivedCoins.map((t) => t.toUpperCase()), clean]));
    saveArchivedCoins(next);
    set({ archivedCoins: next });
  },

  unarchiveCoin: (ticker) => {
    const clean = ticker.toUpperCase().trim();
    const next = get().archivedCoins.filter((t) => t.toUpperCase() !== clean);
    saveArchivedCoins(next);
    set({ archivedCoins: next });
  },

  setTacticalDipConfig: (patch) => {
    const merged = sanitizeTacticalDipConfig({ ...get().tacticalDipConfig, ...patch });
    saveTacticalDipConfig(merged);
    set({ tacticalDipConfig: merged });
  },

  undoLastPortfolioAction: () => {
    const prev = get().undoTransactions;
    if (!prev) return;
    persistTransactions(prev);
    set({
      transactions: prev,
      isDirty: true,
      undoTransactions: null,
      undoLabel: null,
    });
  },

  dismissPortfolioUndo: () => set({ undoTransactions: null, undoLabel: null }),

  togglePrivacy: () =>
    set((state) => ({ isPrivate: !state.isPrivate })),

  setDirty: (dirty) =>
    set({ isDirty: dirty }),

  updateCoinMapping: (ticker, coinGeckoId) => {
    const updated = { ...get().coinMappings, [ticker.toUpperCase()]: coinGeckoId };
    saveCoinMappings(updated);
    set({ coinMappings: updated });
  },

  setStablecoins: (tickers) => {
    const upper = tickers.map((t) => t.toUpperCase().trim()).filter(Boolean);
    saveStablecoins(upper);
    set({ stablecoins: upper });
  },

  isStablecoin: (ticker) => {
    return get().stablecoins.includes(ticker.toUpperCase());
  },

  setGoalTarget: (target) => {
    if (!Number.isFinite(target) || target <= 0) return;
    const clean = Number(target.toFixed(2));
    savePortfolioGoal(clean);
    set({ goalTarget: clean });
  },

  resetToDefaultTransactions: () => {
    persistTransactions(DEFAULT_TRANSACTIONS);
    set({
      transactions: DEFAULT_TRANSACTIONS,
      isDirty: false,
      undoTransactions: null,
      undoLabel: null,
    });
  },
}));
