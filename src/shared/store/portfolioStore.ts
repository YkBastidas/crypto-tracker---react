import { create } from 'zustand';
import type { Transaction, CoinMappings } from '../types';
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
} from '../lib/storage';

interface PortfolioState {
  // State
  transactions: Transaction[];
  isDirty: boolean;
  isPrivate: boolean;
  coinMappings: CoinMappings;
  stablecoins: string[];
  goalTarget: number;
  undoTransactions: Transaction[] | null;
  undoLabel: string | null;

  // Actions
  loadTransactions: (txs: Transaction[]) => void;
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (index: number, patch: Partial<Transaction>) => void;
  removeTransaction: (index: number) => void;
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
