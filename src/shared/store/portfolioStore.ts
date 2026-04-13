import { create } from 'zustand';
import type { Transaction } from '../types';
import { getCoinMappings, saveCoinMappings } from '../lib/storage';
import type { CoinMappings } from '../types';

interface PortfolioState {
  // State
  transactions: Transaction[];
  isDirty: boolean;
  isPrivate: boolean;
  coinMappings: CoinMappings;

  // Actions
  loadTransactions: (txs: Transaction[]) => void;
  addTransaction: (tx: Transaction) => void;
  removeTransaction: (index: number) => void;
  togglePrivacy: () => void;
  setDirty: (dirty: boolean) => void;
  updateCoinMapping: (ticker: string, coinGeckoId: string) => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  transactions: [],
  isDirty: false,
  isPrivate: false,
  coinMappings: getCoinMappings(),

  loadTransactions: (txs) =>
    set({ transactions: txs, isDirty: false }),

  addTransaction: (tx) =>
    set((state) => ({
      transactions: [...state.transactions, tx],
      isDirty: true,
    })),

  removeTransaction: (index) =>
    set((state) => ({
      transactions: state.transactions.filter((_, i) => i !== index),
      isDirty: true,
    })),

  togglePrivacy: () =>
    set((state) => ({ isPrivate: !state.isPrivate })),

  setDirty: (dirty) =>
    set({ isDirty: dirty }),

  updateCoinMapping: (ticker, coinGeckoId) => {
    const updated = { ...get().coinMappings, [ticker.toUpperCase()]: coinGeckoId };
    saveCoinMappings(updated);
    set({ coinMappings: updated });
  },
}));
