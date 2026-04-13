import { create } from 'zustand';
import type { Transaction, CoinMappings } from '../types';
import {
  getCoinMappings,
  saveCoinMappings,
  getPersistedTransactions,
  persistTransactions,
  getStablecoins,
  saveStablecoins,
} from '../lib/storage';

interface PortfolioState {
  // State
  transactions: Transaction[];
  isDirty: boolean;
  isPrivate: boolean;
  coinMappings: CoinMappings;
  stablecoins: string[];

  // Actions
  loadTransactions: (txs: Transaction[]) => void;
  addTransaction: (tx: Transaction) => void;
  removeTransaction: (index: number) => void;
  togglePrivacy: () => void;
  setDirty: (dirty: boolean) => void;
  updateCoinMapping: (ticker: string, coinGeckoId: string) => void;
  setStablecoins: (tickers: string[]) => void;
  isStablecoin: (ticker: string) => boolean;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  // ── Hydrate from localStorage on creation ──
  transactions: getPersistedTransactions(),
  isDirty: false,
  isPrivate: false,
  coinMappings: getCoinMappings(),
  stablecoins: getStablecoins(),

  loadTransactions: (txs) => {
    persistTransactions(txs);
    set({ transactions: txs, isDirty: false });
  },

  addTransaction: (tx) => {
    const updated = [...get().transactions, tx];
    persistTransactions(updated);
    set({ transactions: updated, isDirty: true });
  },

  removeTransaction: (index) => {
    const updated = get().transactions.filter((_, i) => i !== index);
    persistTransactions(updated);
    set({ transactions: updated, isDirty: true });
  },

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
}));
