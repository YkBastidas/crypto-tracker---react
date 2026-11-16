import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultSeed } from '../data/defaultSeed';
import type {
  AssetBucketId,
  BudgetSnapshot,
  EnvelopeId,
  InstallmentPlan,
  LedgerMovement,
  PaymentMethod,
  QuincenaConfig,
  RecurringExpense,
} from '../types';
import { advanceDueDate, type QuincenaPreview } from '../utils/calculations';

export interface UndoEntry {
  id: string;
  label: string;
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
}

export interface PayExpenseOptions {
  logToLedger?: boolean;
  paymentMethod?: PaymentMethod;
  amountUsd?: number;
  envelopeId?: EnvelopeId;
}

export interface PayInstallmentOptions {
  amountOverride?: number;
  envelopeId?: EnvelopeId;
  paymentMethod?: PaymentMethod;
}

interface BudgetState {
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  quincenaConfig: QuincenaConfig;
  undoEntry: UndoEntry | null;

  // Ledger actions
  addMovement: (movement: Omit<LedgerMovement, 'id'>) => void;
  transferBetweenBuckets: (params: {
    date: string;
    fromBucket: AssetBucketId;
    toBucket: AssetBucketId;
    fromPaymentMethod?: PaymentMethod;
    toPaymentMethod?: PaymentMethod;
    amountFrom: number;
    amountTo?: number;
    notes?: string;
  }) => void;
  removeMovement: (id: string) => void;

  // Undo actions
  undoLastAction: () => void;
  dismissUndo: () => void;

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
  markExpensePaid: (id: string, options?: PayExpenseOptions) => void;

  // Installment plans actions
  addInstallment: (plan: Omit<InstallmentPlan, 'id'>) => void;
  updateInstallment: (id: string, patch: Partial<InstallmentPlan>) => void;
  removeInstallment: (id: string) => void;
  recordInstallmentPayment: (id: string, options?: PayInstallmentOptions) => void;

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

function createUndoSnapshot(
  label: string,
  state: Pick<BudgetState, 'movements' | 'expenses' | 'installments'>,
): UndoEntry {
  return {
    id: makeId('undo'),
    label,
    movements: state.movements,
    expenses: state.expenses,
    installments: state.installments,
  };
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      movements: initialSeed.movements,
      expenses: initialSeed.expenses,
      installments: initialSeed.installments,
      quincenaConfig: initialSeed.quincenaConfig,
      undoEntry: null,

      addMovement: (movement) =>
        set((state) => ({
          undoEntry: createUndoSnapshot(`Movimiento: ${movement.notes || movement.type}`, state),
          movements: [{ ...movement, id: makeId('mov') }, ...state.movements],
        })),

      transferBetweenBuckets: ({
        date,
        fromBucket,
        toBucket,
        fromPaymentMethod,
        toPaymentMethod,
        amountFrom,
        amountTo,
        notes,
      }) => {
        const cleanFrom = Number(Math.abs(amountFrom).toFixed(2));
        const cleanTo = Number(Math.abs(amountTo ?? amountFrom).toFixed(2));
        const sameTarget =
          fromBucket === toBucket && fromPaymentMethod === toPaymentMethod;
        if (cleanFrom <= 0 || cleanTo <= 0 || sameTarget) return;

        const label = notes?.trim() ? ` (${notes.trim()})` : '';
        const outMov: LedgerMovement = {
          id: makeId('mov'),
          date,
          bucket: fromBucket,
          type: 'Transferencia (Salida)',
          amountUsd: cleanFrom,
          paymentMethod: fromPaymentMethod,
          notes: `Cambio / Transferencia salida${label}`,
        };
        const inMov: LedgerMovement = {
          id: makeId('mov'),
          date,
          bucket: toBucket,
          type: 'Transferencia (Entrada)',
          amountUsd: cleanTo,
          paymentMethod: toPaymentMethod,
          notes: `Cambio / Transferencia entrada${label}`,
        };
        set((state) => ({
          undoEntry: createUndoSnapshot(`Transferencia de $${cleanFrom}`, state),
          movements: [inMov, outMov, ...state.movements],
        }));
      },

      removeMovement: (id) => {
        const state = get();
        const target = state.movements.find((m) => m.id === id);
        if (!target) return;

        let nextExpenses = state.expenses;
        if (target.linkedExpense) {
          const { id: expenseId, previousDueDate } = target.linkedExpense;
          nextExpenses = state.expenses.map((e) =>
            e.id === expenseId ? { ...e, nextDueDate: previousDueDate } : e,
          );
        }

        let nextInstallments = state.installments;
        if (target.linkedInstallment) {
          const { id: instId, amount } = target.linkedInstallment;
          nextInstallments = state.installments.map((p) =>
            p.id === instId
              ? {
                  ...p,
                  paidTotal: Math.max(0, Number((p.paidTotal - amount).toFixed(2))),
                  paymentsCount: Math.max(0, p.paymentsCount - 1),
                }
              : p,
          );
        }

        set({
          undoEntry: createUndoSnapshot(
            `Eliminado: ${target.notes || target.type}`,
            state,
          ),
          movements: state.movements.filter((m) => m.id !== id),
          expenses: nextExpenses,
          installments: nextInstallments,
        });
      },

      undoLastAction: () => {
        const entry = get().undoEntry;
        if (!entry) return;
        set({
          movements: entry.movements,
          expenses: entry.expenses,
          installments: entry.installments,
          undoEntry: null,
        });
      },

      dismissUndo: () => set({ undoEntry: null }),

      updateQuincenaConfig: (config) =>
        set((state) => ({
          quincenaConfig: { ...state.quincenaConfig, ...config },
        })),

      confirmQuincena: ({ date, paymentMethod, notes, preview }) => {
        const state = get();
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

        set({
          undoEntry: createUndoSnapshot(`Quincena ($${preview.grossAmount})`, state),
          movements: [...newMovements, ...state.movements],
        });
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
        set((state) => {
          const target = state.expenses.find((e) => e.id === id);
          return {
            undoEntry: target
              ? createUndoSnapshot(`Gasto eliminado: ${target.name}`, state)
              : state.undoEntry,
            expenses: state.expenses.filter((e) => e.id !== id),
          };
        }),

      markExpensePaid: (id, options) => {
        const state = get();
        const target = state.expenses.find((e) => e.id === id);
        if (!target) return;

        const logToLedger = options?.logToLedger ?? true;
        const paymentMethod = options?.paymentMethod ?? 'efectivo_usd';
        const amountUsd = options?.amountUsd ?? target.amountUsd;
        const envelopeId = options?.envelopeId ?? target.envelopeId;

        const todayIso = new Date().toISOString().slice(0, 10);
        const previousDueDate = target.nextDueDate;
        const nextDue = advanceDueDate(previousDueDate, target.frequency);

        const movementType =
          paymentMethod === 'bolivares_pago_movil'
            ? 'Cambio a Bolívares'
            : 'Gasto en Efectivo';

        set({
          undoEntry: createUndoSnapshot(`Pago: ${target.name}`, state),
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, nextDueDate: nextDue } : e,
          ),
          movements: logToLedger
            ? [
                {
                  id: makeId('mov'),
                  date: todayIso,
                  bucket: envelopeId,
                  type: movementType,
                  amountUsd: Number(Math.abs(amountUsd).toFixed(2)),
                  paymentMethod,
                  notes: `Pago: ${target.name}`,
                  linkedExpense: {
                    id: target.id,
                    previousDueDate,
                  },
                },
                ...state.movements,
              ]
            : state.movements,
        });
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
        set((state) => {
          const target = state.installments.find((p) => p.id === id);
          return {
            undoEntry: target
              ? createUndoSnapshot(`Cuota eliminada: ${target.name}`, state)
              : state.undoEntry,
            installments: state.installments.filter((p) => p.id !== id),
          };
        }),

      recordInstallmentPayment: (id, options) => {
        const state = get();
        const plan = state.installments.find((p) => p.id === id);
        if (!plan) return;
        const amount = options?.amountOverride ?? plan.installmentAmount;
        if (amount <= 0) return;

        const envelopeId = options?.envelopeId ?? 'imprescindibles';
        const paymentMethod = options?.paymentMethod ?? 'efectivo_usd';
        const todayIso = new Date().toISOString().slice(0, 10);

        set({
          undoEntry: createUndoSnapshot(`Cuota #${plan.paymentsCount + 1}: ${plan.name}`, state),
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
              amountUsd: Number(Math.abs(amount).toFixed(2)),
              paymentMethod,
              notes: `Cuota #${plan.paymentsCount + 1}: ${plan.name}`,
              linkedInstallment: {
                id: plan.id,
                amount: Number(Math.abs(amount).toFixed(2)),
              },
            },
            ...state.movements,
          ],
        });
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
          undoEntry: null,
        });
        return true;
      },

      resetToSeed: () => {
        const seed = createDefaultSeed();
        set({ ...seed, undoEntry: null });
      },

      clearAllData: () => {
        set({
          movements: [],
          expenses: [],
          installments: [],
          quincenaConfig: initialSeed.quincenaConfig,
          undoEntry: null,
        });
      },
    }),
    {
      name: 'budget-control-storage',
      partialize: (state) => ({
        movements: state.movements,
        expenses: state.expenses,
        installments: state.installments,
        quincenaConfig: state.quincenaConfig,
      }),
    },
  ),
);
