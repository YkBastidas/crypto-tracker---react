import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultSeed } from '../data/defaultSeed';
import type {
  BudgetSnapshot,
  EnvelopeId,
  InstallmentPlan,
  LedgerMovement,
  PaymentMethod,
  QuincenaConfig,
  RecurringExpense,
} from '../types';
import { advanceDueDate, type QuincenaPreview } from '../utils/calculations';

interface BudgetState {
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  quincenaConfig: QuincenaConfig;

  // Ledger actions
  addMovement: (movement: Omit<LedgerMovement, 'id'>) => void;
  removeMovement: (id: string) => void;

  // Quincena wizard actions
  updateQuincenaConfig: (config: Partial<QuincenaConfig>) => void;
  confirmQuincena: (params: {
    date: string;
    paymentMethod: PaymentMethod;
    notes?: string;
    preview: QuincenaPreview;
  }) => void;

  // Recurring expenses actions
  addExpense: (expense: Omit<RecurringExpense, 'id'>) => void;
  updateExpense: (id: string, patch: Partial<RecurringExpense>) => void;
  removeExpense: (id: string) => void;
  markExpensePaid: (id: string, logToLedger?: boolean) => void;

  // Installment plans actions
  addInstallment: (plan: Omit<InstallmentPlan, 'id'>) => void;
  updateInstallment: (id: string, patch: Partial<InstallmentPlan>) => void;
  removeInstallment: (id: string) => void;
  recordInstallmentPayment: (id: string, amountOverride?: number, envelopeId?: EnvelopeId) => void;

  // Backup & reset
  exportSnapshot: () => BudgetSnapshot;
  importSnapshot: (snapshot: BudgetSnapshot) => boolean;
  resetToSeed: () => void;
  clearAllData: () => void;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const initialSeed = createDefaultSeed();

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      movements: initialSeed.movements,
      expenses: initialSeed.expenses,
      installments: initialSeed.installments,
      quincenaConfig: initialSeed.quincenaConfig,

      addMovement: (movement) =>
        set((state) => ({
          movements: [{ ...movement, id: makeId('mov') }, ...state.movements],
        })),

      removeMovement: (id) =>
        set((state) => ({
          movements: state.movements.filter((m) => m.id !== id),
        })),

      updateQuincenaConfig: (config) =>
        set((state) => ({
          quincenaConfig: { ...state.quincenaConfig, ...config },
        })),

      confirmQuincena: ({ date, paymentMethod, notes, preview }) => {
        const quincenaId = makeId('qna');
        const newMovements: LedgerMovement[] = [];
        const noteSuffix = notes?.trim() ? ` (${notes.trim()})` : '';

        if (preview.totalProvision > 0) {
          newMovements.push({
            id: makeId('mov'),
            date,
            bucket: 'imprescindibles',
            type: 'Ingreso a Sobre',
            amountUsd: preview.totalProvision,
            paymentMethod,
            notes: `Provisión quincenal gastos/cuotas${noteSuffix}`,
            quincenaId,
          });
        }

        for (const alloc of preview.envelopeAllocations) {
          if (alloc.amountUsd <= 0) continue;
          newMovements.push({
            id: makeId('mov'),
            date,
            bucket: alloc.envelopeId,
            type: 'Ingreso a Sobre',
            amountUsd: alloc.amountUsd,
            paymentMethod,
            notes: `Quincena: ${alloc.name}${noteSuffix}`,
            quincenaId,
          });
        }

        if (preview.unallocated > 0.01) {
          newMovements.push({
            id: makeId('mov'),
            date,
            bucket: 'ahorro_inversion',
            type: 'Ingreso a Sobre',
            amountUsd: preview.unallocated,
            paymentMethod,
            notes: `Excedente quincenal sin asignar${noteSuffix}`,
            quincenaId,
          });
        }

        set((state) => ({
          movements: [...newMovements, ...state.movements],
        }));
      },

      addExpense: (expense) =>
        set((state) => ({
          expenses: [...state.expenses, { ...expense, id: makeId('exp') }],
        })),

      updateExpense: (id, patch) =>
        set((state) => ({
          expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      removeExpense: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        })),

      markExpensePaid: (id, logToLedger = true) => {
        const target = get().expenses.find((e) => e.id === id);
        if (!target) return;

        const todayIso = new Date().toISOString().slice(0, 10);
        const nextDue = advanceDueDate(target.nextDueDate, target.frequency);

        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, nextDueDate: nextDue } : e,
          ),
          movements: logToLedger
            ? [
                {
                  id: makeId('mov'),
                  date: todayIso,
                  bucket: target.envelopeId,
                  type: 'Gasto en Efectivo',
                  amountUsd: target.amountUsd,
                  notes: `Pago: ${target.name}`,
                },
                ...state.movements,
              ]
            : state.movements,
        }));
      },

      addInstallment: (plan) =>
        set((state) => ({
          installments: [...state.installments, { ...plan, id: makeId('inst') }],
        })),

      updateInstallment: (id, patch) =>
        set((state) => ({
          installments: state.installments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removeInstallment: (id) =>
        set((state) => ({
          installments: state.installments.filter((p) => p.id !== id),
        })),

      recordInstallmentPayment: (id, amountOverride, envelopeId = 'imprescindibles') => {
        const plan = get().installments.find((p) => p.id === id);
        if (!plan) return;
        const amount = amountOverride ?? plan.installmentAmount;
        if (amount <= 0) return;

        const todayIso = new Date().toISOString().slice(0, 10);

        set((state) => ({
          installments: state.installments.map((p) =>
            p.id === id
              ? {
                  ...p,
                  paidTotal: Number((p.paidTotal + amount).toFixed(2)),
                  paymentsCount: p.paymentsCount + 1,
                  lastPaidDate: todayIso,
                }
              : p,
          ),
          movements: [
            {
              id: makeId('mov'),
              date: todayIso,
              bucket: envelopeId,
              type: 'Pago de Cuota',
              amountUsd: amount,
              notes: `Cuota #${plan.paymentsCount + 1}: ${plan.name}`,
            },
            ...state.movements,
          ],
        }));
      },

      exportSnapshot: () => {
        const { movements, expenses, installments, quincenaConfig } = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          movements,
          expenses,
          installments,
          quincenaConfig,
        };
      },

      importSnapshot: (snapshot) => {
        if (
          !snapshot ||
          !Array.isArray(snapshot.movements) ||
          !Array.isArray(snapshot.expenses) ||
          !Array.isArray(snapshot.installments) ||
          !snapshot.quincenaConfig
        ) {
          return false;
        }
        set({
          movements: snapshot.movements,
          expenses: snapshot.expenses,
          installments: snapshot.installments,
          quincenaConfig: snapshot.quincenaConfig,
        });
        return true;
      },

      resetToSeed: () => {
        const seed = createDefaultSeed();
        set(seed);
      },

      clearAllData: () => {
        set({
          movements: [],
          expenses: [],
          installments: [],
          quincenaConfig: initialSeed.quincenaConfig,
        });
      },
    }),
    {
      name: 'budget-control-storage',
    },
  ),
);
