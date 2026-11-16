import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultSeed } from '../data/defaultSeed';
import type {
  AccountCurrency,
  AssetBucketId,
  BudgetSnapshot,
  CustomAccount,
  CustomAccountId,
  EmergencyGoalConfig,
  EnvelopeId,
  EnvelopeSummary,
  InstallmentPlan,
  LedgerMovement,
  MonthEndSimulationResult,
  PaymentMethod,
  QuincenaConfig,
  RecurringExpense,
} from '../types';
import { advanceDueDate, type QuincenaPreview } from '../utils/calculations';
import { fetchBcvUsdRate } from '../services/bcvApi';
import { buildLedgerMovementsFromSimulation } from '../services/monthEndEngine';

export interface UndoEntry {
  id: string;
  label: string;
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  customAccounts: CustomAccount[];
}

export interface PayExpenseOptions {
  logToLedger?: boolean;
  paymentMethod?: PaymentMethod;
  amountUsd?: number;
  amountBs?: number;
  bcvRateUsed?: number;
  envelopeId?: EnvelopeId;
  bucketOverride?: AssetBucketId;
}

export interface PayInstallmentOptions {
  amountOverride?: number;
  envelopeId?: EnvelopeId;
  bucketOverride?: AssetBucketId;
  paymentMethod?: PaymentMethod;
  amountBs?: number;
  bcvRateUsed?: number;
}

interface BudgetState {
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  customAccounts: CustomAccount[];
  quincenaConfig: QuincenaConfig;
  emergencyGoal: EmergencyGoalConfig;
  undoEntry: UndoEntry | null;

  // Emergency goal
  updateEmergencyGoal: (patch: Partial<EmergencyGoalConfig>) => void;

  // Custom accounts
  addCustomAccount: (params: {
    name: string;
    currency: AccountCurrency;
    subtitle?: string;
    initialBalance?: number;
  }) => CustomAccountId;
  updateCustomAccount: (
    id: CustomAccountId,
    patch: Partial<Pick<CustomAccount, 'name' | 'currency' | 'subtitle'>>,
  ) => void;
  removeCustomAccount: (id: CustomAccountId) => void;

  // BCV rate state
  bcvRate: number | null;
  bcvUpdatedAt: string | null;
  bcvLoading: boolean;
  bcvError: string | null;
  refreshBcvRate: () => Promise<void>;
  setManualBcvRate: (rate: number) => void;

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
    amountBsFrom?: number;
    amountBsTo?: number;
    bcvRateUsed?: number;
    notes?: string;
  }) => void;
  removeMovement: (id: string) => void;
  applyMonthEndRollover: (
    simulation: MonthEndSimulationResult,
    envelopes: EnvelopeSummary[],
  ) => void;

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

const DEFAULT_EMERGENCY_GOAL: EmergencyGoalConfig = {
  mode: 'months_of_essentials',
  months: 3,
  customAmount: 1000,
};

function createUndoSnapshot(
  label: string,
  state: Pick<BudgetState, 'movements' | 'expenses' | 'installments' | 'customAccounts'>,
): UndoEntry {
  return {
    id: makeId('undo'),
    label,
    movements: state.movements,
    expenses: state.expenses,
    installments: state.installments,
    customAccounts: state.customAccounts,
  };
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      movements: initialSeed.movements,
      expenses: initialSeed.expenses,
      installments: initialSeed.installments,
      customAccounts: [],
      quincenaConfig: initialSeed.quincenaConfig,
      emergencyGoal: DEFAULT_EMERGENCY_GOAL,
      undoEntry: null,
      bcvRate: null,
      bcvUpdatedAt: null,
      bcvLoading: false,
      bcvError: null,

      updateEmergencyGoal: (patch) =>
        set((state) => ({
          emergencyGoal: { ...state.emergencyGoal, ...patch },
        })),

      addCustomAccount: ({ name, currency, subtitle, initialBalance }) => {
        const state = get();
        const id = `acct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` as CustomAccountId;
        const cleanName = name.trim();
        const account: CustomAccount = {
          id,
          name: cleanName,
          currency,
          subtitle: subtitle?.trim() || (currency === 'VES' ? 'Cuenta en Bolívares' : 'Cuenta en Dólares (USD)'),
          createdAt: new Date().toISOString(),
        };

        const initAmt = Number((initialBalance ?? 0).toFixed(2));
        let nextMovements = state.movements;
        if (initAmt > 0) {
          const rate = state.bcvRate ?? undefined;
          const amountUsd =
            currency === 'VES' && rate && rate > 0
              ? Number((initAmt / rate).toFixed(2))
              : initAmt;
          nextMovements = [
            {
              id: makeId('mov'),
              date: new Date().toISOString().slice(0, 10),
              bucket: id,
              type: 'Ingreso a Sobre',
              amountUsd,
              amountBs: currency === 'VES' ? initAmt : undefined,
              bcvRateUsed: currency === 'VES' ? rate : undefined,
              paymentMethod: currency === 'VES' ? 'bolivares_pago_movil' : 'otro',
              notes: `Saldo inicial: ${cleanName}`,
            },
            ...state.movements,
          ];
        }

        set({
          customAccounts: [...state.customAccounts, account],
          movements: nextMovements,
        });
        return id;
      },

      updateCustomAccount: (id, patch) =>
        set((state) => {
          const target = state.customAccounts.find((a) => a.id === id);
          if (!target) return state;
          const cleanName = patch.name !== undefined ? patch.name.trim() : target.name;
          if (!cleanName) return state;
          return {
            undoEntry: createUndoSnapshot(`Cuenta editada: ${cleanName}`, state),
            customAccounts: state.customAccounts.map((a) =>
              a.id === id
                ? {
                    ...a,
                    ...patch,
                    name: cleanName,
                    subtitle:
                      patch.subtitle !== undefined
                        ? patch.subtitle.trim() || undefined
                        : a.subtitle,
                  }
                : a,
            ),
          };
        }),

      removeCustomAccount: (id) =>
        set((state) => {
          const target = state.customAccounts.find((a) => a.id === id);
          return {
            undoEntry: target
              ? createUndoSnapshot(`Cuenta eliminada: ${target.name}`, state)
              : state.undoEntry,
            customAccounts: state.customAccounts.filter((a) => a.id !== id),
            movements: state.movements.filter((m) => m.bucket !== id),
          };
        }),

      refreshBcvRate: async () => {
        set({ bcvLoading: true, bcvError: null });
        try {
          const res = await fetchBcvUsdRate();
          set({
            bcvRate: res.rate,
            bcvUpdatedAt: res.updatedAt,
            bcvLoading: false,
            bcvError: null,
          });
        } catch (err) {
          set({
            bcvLoading: false,
            bcvError: err instanceof Error ? err.message : 'No se pudo obtener tasa BCV',
          });
        }
      },

      setManualBcvRate: (rate) => {
        if (!Number.isFinite(rate) || rate <= 0) return;
        set({
          bcvRate: Number(rate.toFixed(4)),
          bcvUpdatedAt: new Date().toISOString(),
          bcvError: null,
        });
      },

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
        amountBsFrom,
        amountBsTo,
        bcvRateUsed,
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
          amountBs: amountBsFrom,
          bcvRateUsed,
          paymentMethod: fromPaymentMethod,
          notes: `Cambio / Transferencia salida${label}`,
        };
        const inMov: LedgerMovement = {
          id: makeId('mov'),
          date,
          bucket: toBucket,
          type: 'Transferencia (Entrada)',
          amountUsd: cleanTo,
          amountBs: amountBsTo,
          bcvRateUsed,
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
          const { id: instId, amount, previousDueDate } = target.linkedInstallment;
          nextInstallments = state.installments.map((p) =>
            p.id === instId
              ? {
                  ...p,
                  paidTotal: Math.max(0, Number((p.paidTotal - amount).toFixed(2))),
                  paymentsCount: Math.max(0, p.paymentsCount - 1),
                  nextDueDate: previousDueDate ?? p.nextDueDate,
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
          customAccounts: entry.customAccounts,
          undoEntry: null,
        });
      },

      dismissUndo: () => set({ undoEntry: null }),

      applyMonthEndRollover: (simulation, envelopes) => {
        const state = get();
        const generated = buildLedgerMovementsFromSimulation(
          simulation,
          envelopes,
          state.bcvRate,
        );
        if (generated.length === 0) return;

        const withIds: LedgerMovement[] = generated.map((m) => ({
          ...m,
          id: makeId('mov'),
        }));

        set({
          undoEntry: createUndoSnapshot(
            `Cierre mensual (${simulation.totalSwept.toFixed(2)} USD barridos)`,
            state,
          ),
          movements: [...withIds, ...state.movements],
        });
      },

      updateQuincenaConfig: (config) =>
        set((state) => ({
          quincenaConfig: { ...state.quincenaConfig, ...config },
        })),

      confirmQuincena: ({ date, paymentMethod, notes, preview }) => {
        const state = get();
        const quincenaId = makeId('qna');
        const newMovements: LedgerMovement[] = [];
        const noteSuffix = notes?.trim() ? ` (${notes.trim()})` : '';
        const isBs = paymentMethod === 'bolivares_pago_movil' && Boolean(state.bcvRate && state.bcvRate > 0);
        const rate = state.bcvRate ?? undefined;

        const toBsFields = (usd: number) =>
          isBs && rate
            ? { amountBs: Number((usd * rate).toFixed(2)), bcvRateUsed: rate }
            : {};

        const monthlyAndInstallments = Number(
          (preview.monthlyExpensesProvision + preview.installmentsProvision).toFixed(2),
        );
        if (monthlyAndInstallments > 0) {
          newMovements.push({
            id: makeId('mov'),
            date,
            bucket: 'imprescindibles',
            type: 'Ingreso a Sobre',
            amountUsd: monthlyAndInstallments,
            ...toBsFields(monthlyAndInstallments),
            paymentMethod,
            notes: `Provisión quincenal gastos mensuales/cuotas${noteSuffix}`,
            quincenaId,
          });
        }

        if (preview.annualExpensesProvision > 0) {
          newMovements.push({
            id: makeId('mov'),
            date,
            bucket: 'provisiones_anuales',
            type: 'Ingreso a Sobre',
            amountUsd: preview.annualExpensesProvision,
            ...toBsFields(preview.annualExpensesProvision),
            paymentMethod,
            notes: `Sinking Fund gastos anuales${noteSuffix}`,
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
            ...toBsFields(alloc.amountUsd),
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
            ...toBsFields(preview.unallocated),
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
        const targetBucket: AssetBucketId = options?.bucketOverride ?? envelopeId;
        const rate = options?.bcvRateUsed ?? state.bcvRate ?? undefined;
        const amountBs =
          options?.amountBs ??
          (paymentMethod === 'bolivares_pago_movil' && rate
            ? Number((amountUsd * rate).toFixed(2))
            : undefined);

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
                  bucket: targetBucket,
                  type: movementType,
                  amountUsd: Number(Math.abs(amountUsd).toFixed(2)),
                  amountBs,
                  bcvRateUsed: rate,
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

        const isReceivable = (plan.direction ?? 'receivable') === 'receivable';
        const envelopeId = options?.envelopeId ?? 'ahorro_inversion';
        const targetBucket: AssetBucketId = options?.bucketOverride ?? envelopeId;
        const paymentMethod = options?.paymentMethod ?? 'efectivo_usd';
        const todayIso = new Date().toISOString().slice(0, 10);
        const cleanAmount = Number(Math.abs(amount).toFixed(2));

        const movementType = isReceivable
          ? targetBucket === 'binance_usdt' ||
            targetBucket === 'binance_crypto' ||
            targetBucket === 'binance_paxg' ||
            targetBucket === 'binance_usdc' ||
            targetBucket === 'wallet_btc'
            ? 'Barrido a Inversión'
            : 'Ingreso a Sobre'
          : 'Pago de Cuota';

        const rate = options?.bcvRateUsed ?? state.bcvRate ?? undefined;
        const amountBs =
          options?.amountBs ??
          (paymentMethod === 'bolivares_pago_movil' && rate
            ? Number((cleanAmount * rate).toFixed(2))
            : undefined);

        const previousDueDate = plan.nextDueDate;
        const nextDueDate = previousDueDate
          ? advanceDueDate(previousDueDate, plan.frequency)
          : undefined;

        set({
          undoEntry: createUndoSnapshot(
            `${isReceivable ? 'Cobro' : 'Cuota'} #${plan.paymentsCount + 1}: ${plan.name}`,
            state,
          ),
          installments: state.installments.map((p) =>
            p.id === id
              ? {
                  ...p,
                  paidTotal: Number((p.paidTotal + cleanAmount).toFixed(2)),
                  paymentsCount: p.paymentsCount + 1,
                  lastPaidDate: todayIso,
                  nextDueDate: nextDueDate ?? p.nextDueDate,
                }
              : p,
          ),
          movements: [
            {
              id: makeId('mov'),
              date: todayIso,
              bucket: targetBucket,
              type: movementType,
              amountUsd: cleanAmount,
              amountBs,
              bcvRateUsed: rate,
              paymentMethod,
              notes: `${isReceivable ? 'Cobro' : 'Cuota'} #${plan.paymentsCount + 1}: ${plan.name}`,
              linkedInstallment: {
                id: plan.id,
                amount: cleanAmount,
                previousDueDate,
              },
            },
            ...state.movements,
          ],
        });
      },

      exportSnapshot: () => {
        const {
          movements,
          expenses,
          installments,
          customAccounts,
          quincenaConfig,
          emergencyGoal,
        } = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          movements,
          expenses,
          installments,
          customAccounts,
          quincenaConfig,
          emergencyGoal,
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
          customAccounts: Array.isArray(snapshot.customAccounts) ? snapshot.customAccounts : [],
          quincenaConfig: snapshot.quincenaConfig,
          emergencyGoal: snapshot.emergencyGoal ?? DEFAULT_EMERGENCY_GOAL,
          undoEntry: null,
        });
        return true;
      },

      resetToSeed: () => {
        const seed = createDefaultSeed();
        set({
          ...seed,
          customAccounts: [],
          emergencyGoal: DEFAULT_EMERGENCY_GOAL,
          undoEntry: null,
        });
      },

      clearAllData: () => {
        set({
          movements: [],
          expenses: [],
          installments: [],
          customAccounts: [],
          quincenaConfig: initialSeed.quincenaConfig,
          emergencyGoal: DEFAULT_EMERGENCY_GOAL,
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
        customAccounts: state.customAccounts,
        quincenaConfig: state.quincenaConfig,
        emergencyGoal: state.emergencyGoal,
        bcvRate: state.bcvRate,
        bcvUpdatedAt: state.bcvUpdatedAt,
      }),
    },
  ),
);
