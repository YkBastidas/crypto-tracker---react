import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDefaultSeed, ENVELOPE_META } from '../data/defaultSeed';
import type {
  AccountCurrency,
  AssetBucketId,
  BudgetSnapshot,
  BuiltinFundId,
  CustomAccount,
  CustomAccountId,
  EmergencyGoalConfig,
  EnvelopeId,
  EnvelopeSummary,
  InstallmentPaymentRecord,
  InstallmentPlan,
  InstallmentSettlementKind,
  LedgerMovement,
  MonthEndSimulationResult,
  NativeAccountOverride,
  NativeAccountOverrides,
  PaymentMethod,
  QuincenaConfig,
  RecurringExpense,
} from '../types';
import {
  advanceDueDate,
  calculateEligibleInvestmentCapital,
  calculateEnvelopeSummaries,
  isBsPaymentMethod,
  isNegativeAdjustmentMovement,
  type QuincenaPreview,
} from '../utils/calculations';
import { fetchBcvUsdRate } from '../services/bcvApi';
import { buildLedgerMovementsFromSimulation } from '../services/monthEndEngine';

export interface UndoEntry {
  id: string;
  label: string;
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  customAccounts: CustomAccount[];
  nativeAccountOverrides: NativeAccountOverrides;
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
  settlementKind?: InstallmentSettlementKind;
  date?: string;
  notes?: string;
  advanceDueDate?: boolean;
}

interface BudgetState {
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  customAccounts: CustomAccount[];
  nativeAccountOverrides: NativeAccountOverrides;
  quincenaConfig: QuincenaConfig;
  emergencyGoal: EmergencyGoalConfig;
  syncCryptoDca: boolean;
  freeBsPoolMode: boolean;
  undoEntry: UndoEntry | null;

  // Live DCA sync
  setSyncCryptoDca: (enabled: boolean) => void;

  // Shared free Bs float mode
  setFreeBsPoolMode: (enabled: boolean) => void;

  // Emergency goal
  updateEmergencyGoal: (patch: Partial<EmergencyGoalConfig>) => void;

  // Native & custom accounts
  updateNativeAccount: (id: BuiltinFundId, patch: NativeAccountOverride) => void;
  resetNativeAccount: (id: BuiltinFundId) => void;
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
  recordCryptoPortfolioUsdtFlow: (params: {
    date: string;
    direction: 'out' | 'in';
    amountUsd: number;
    notes: string;
    allowOverdraftFromOtherEnvelopes?: boolean;
  }) => void;
  recordCryptoPortfolioUsdcFlow: (params: {
    date: string;
    direction: 'out' | 'in';
    amountUsd: number;
    notes: string;
  }) => void;
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
  multiEnvelopeCustodyExchange: (params: {
    date: string;
    fromPaymentMethod: PaymentMethod;
    toPaymentMethod: PaymentMethod;
    allocations: Array<{
      bucket: AssetBucketId;
      amountFrom: number;
      amountTo: number;
      amountBsFrom?: number;
      amountBsTo?: number;
    }>;
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
  updateInstallmentPaymentNote: (planId: string, paymentId: string, notes: string) => void;
  removeInstallmentPayment: (planId: string, paymentId: string) => void;

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

const ENVELOPE_BUCKET_IDS = Object.keys(ENVELOPE_META) as EnvelopeId[];
const ENVELOPE_BUCKET_SET = new Set<AssetBucketId>(ENVELOPE_BUCKET_IDS);
const BS_ROUTABLE_OUTFLOW_TYPES = new Set([
  'Gasto en Efectivo',
  'Cambio a Bolívares',
  'Pago de Cuota',
]);

function sumUnassignedBsUsd(movements: LedgerMovement[]): number {
  let total = 0;
  for (const m of movements) {
    if (m.bucket !== 'banco_bolivares') continue;
    if (
      m.type === 'Gasto en Efectivo' ||
      m.type === 'Cambio a Bolívares' ||
      m.type === 'Pago de Cuota' ||
      m.type === 'Transferencia (Salida)'
    ) {
      total -= Math.abs(m.amountUsd);
    } else {
      total += m.amountUsd;
    }
  }
  return Math.max(0, Number(total.toFixed(2)));
}

function routeBsOutflowMovements(
  state: Pick<BudgetState, 'movements' | 'freeBsPoolMode'>,
  baseMovement: Omit<LedgerMovement, 'id'>,
): LedgerMovement[] {
  const isNegativeAdjustment = isNegativeAdjustmentMovement(baseMovement);
  const isOutflow = BS_ROUTABLE_OUTFLOW_TYPES.has(baseMovement.type) || isNegativeAdjustment;

  if (
    !state.freeBsPoolMode ||
    !isOutflow ||
    baseMovement.paymentMethod !== 'bolivares_pago_movil' ||
    !ENVELOPE_BUCKET_SET.has(baseMovement.bucket)
  ) {
    return [{ ...baseMovement, id: makeId('mov') }];
  }

  const cleanUsd = Number(Math.abs(baseMovement.amountUsd).toFixed(2));
  if (!Number.isFinite(cleanUsd) || cleanUsd <= 0) {
    return [{ ...baseMovement, id: makeId('mov') }];
  }

  const envelopes = calculateEnvelopeSummaries(state.movements, { freeBsPoolMode: true });
  const targetEnvId = baseMovement.bucket as EnvelopeId;
  const targetBsAvail = Math.max(
    0,
    Number((envelopes.find((e) => e.id === targetEnvId)?.byMethod.bolivares ?? 0).toFixed(2)),
  );

  if (targetBsAvail >= cleanUsd - 0.009) {
    return [{ ...baseMovement, id: makeId('mov') }];
  }

  const allocations: Array<{ bucket: AssetBucketId; usd: number }> = [];
  let remaining = cleanUsd;

  if (targetBsAvail > 0.009) {
    const takeTarget = Number(Math.min(remaining, targetBsAvail).toFixed(2));
    if (takeTarget > 0) {
      allocations.push({ bucket: targetEnvId, usd: takeTarget });
      remaining = Number((remaining - takeTarget).toFixed(2));
    }
  }

  const freeBankBs = sumUnassignedBsUsd(state.movements);
  if (remaining > 0.009 && freeBankBs > 0.009) {
    const takeBank = Number(Math.min(remaining, freeBankBs).toFixed(2));
    if (takeBank > 0) {
      allocations.push({ bucket: 'banco_bolivares', usd: takeBank });
      remaining = Number((remaining - takeBank).toFixed(2));
    }
  }

  if (remaining > 0.009) {
    for (const donorId of ENVELOPE_BUCKET_IDS) {
      if (donorId === targetEnvId || remaining <= 0.009) continue;
      const donorBs = Math.max(
        0,
        Number((envelopes.find((e) => e.id === donorId)?.byMethod.bolivares ?? 0).toFixed(2)),
      );
      if (donorBs <= 0.009) continue;
      const takeDonor = Number(Math.min(remaining, donorBs).toFixed(2));
      if (takeDonor > 0) {
        allocations.push({ bucket: donorId, usd: takeDonor });
        remaining = Number((remaining - takeDonor).toFixed(2));
      }
    }
  }

  // If no positive Bs balance remains anywhere, charge any residual to banco_bolivares so the envelope stays >= 0
  if (remaining > 0.009) {
    const existingBank = allocations.find((a) => a.bucket === 'banco_bolivares');
    if (existingBank) {
      existingBank.usd = Number((existingBank.usd + remaining).toFixed(2));
    } else {
      allocations.push({ bucket: 'banco_bolivares', usd: remaining });
    }
  }

  const totalBs =
    typeof baseMovement.amountBs === 'number' ? Math.abs(baseMovement.amountBs) : undefined;
  const splitGroupId = allocations.length > 1 ? makeId('split') : undefined;
  const targetShortName = ENVELOPE_META[targetEnvId]?.shortName ?? targetEnvId;
  let assignedBs = 0;

  return allocations.map((slice, idx) => {
    const isLast = idx === allocations.length - 1;
    const sliceBs =
      totalBs !== undefined
        ? isLast
          ? Number(Math.max(0, totalBs - assignedBs).toFixed(2))
          : Number(((slice.usd / cleanUsd) * totalBs).toFixed(2))
        : undefined;
    if (sliceBs !== undefined) assignedBs += sliceBs;

    const baseNote = baseMovement.notes?.trim() || baseMovement.type;
    let sliceNote = baseMovement.notes;
    if (slice.bucket === 'banco_bolivares') {
      sliceNote = `${baseNote} (Saldo Libre Bs · ${targetShortName})`;
    } else if (slice.bucket !== targetEnvId) {
      sliceNote = `${baseNote} (Sobrante Bs → ${targetShortName})`;
    }

    return {
      ...baseMovement,
      id: makeId('mov'),
      bucket: slice.bucket,
      amountUsd: isNegativeAdjustment ? -slice.usd : slice.usd,
      amountBs:
        sliceBs !== undefined ? (isNegativeAdjustment ? -sliceBs : sliceBs) : undefined,
      notes: sliceNote,
      splitGroupId,
      linkedExpense: idx === 0 ? baseMovement.linkedExpense : undefined,
      linkedInstallment: idx === 0 ? baseMovement.linkedInstallment : undefined,
    };
  });
}

function createUndoSnapshot(
  label: string,
  state: Pick<
    BudgetState,
    'movements' | 'expenses' | 'installments' | 'customAccounts' | 'nativeAccountOverrides'
  >,
): UndoEntry {
  return {
    id: makeId('undo'),
    label,
    movements: state.movements,
    expenses: state.expenses,
    installments: state.installments,
    customAccounts: state.customAccounts,
    nativeAccountOverrides: state.nativeAccountOverrides,
  };
}

function computeNextLastPaidDate(
  remainingHistory: InstallmentPaymentRecord[],
  remainingMovements: LedgerMovement[],
  planId: string,
  remainingCount: number,
  fallbackLastPaidDate?: string,
): string | undefined {
  const dates: string[] = [];
  for (const r of remainingHistory) {
    if (r.date) dates.push(r.date);
  }
  for (const m of remainingMovements) {
    if (m.linkedInstallment?.id === planId && m.date) {
      dates.push(m.date);
    }
  }
  if (dates.length > 0) {
    dates.sort((a, b) => b.localeCompare(a));
    return dates[0];
  }
  return remainingCount > 0 ? fallbackLastPaidDate : undefined;
}

function applyNoteToLinkedMovement(
  movement: LedgerMovement,
  nextNote: string | undefined,
): LedgerMovement {
  const prevNote = movement.linkedInstallment?.note?.trim();
  let updatedMovNotes = movement.notes ?? '';
  if (prevNote) {
    const token = ` · ${prevNote}`;
    const idx = updatedMovNotes.lastIndexOf(token);
    if (idx !== -1) {
      updatedMovNotes = updatedMovNotes.slice(0, idx) + updatedMovNotes.slice(idx + token.length);
    }
  }
  if (nextNote) {
    updatedMovNotes = updatedMovNotes ? `${updatedMovNotes} · ${nextNote}` : nextNote;
  }
  return {
    ...movement,
    notes: updatedMovNotes || undefined,
    linkedInstallment: movement.linkedInstallment
      ? { ...movement.linkedInstallment, note: nextNote }
      : movement.linkedInstallment,
  };
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      movements: initialSeed.movements,
      expenses: initialSeed.expenses,
      installments: initialSeed.installments,
      customAccounts: [],
      nativeAccountOverrides: {},
      quincenaConfig: initialSeed.quincenaConfig,
      emergencyGoal: DEFAULT_EMERGENCY_GOAL,
      syncCryptoDca: true,
      freeBsPoolMode: true,
      undoEntry: null,
      bcvRate: null,
      bcvUpdatedAt: null,
      bcvLoading: false,
      bcvError: null,

      setSyncCryptoDca: (enabled) => set({ syncCryptoDca: enabled }),

      setFreeBsPoolMode: (enabled) => set({ freeBsPoolMode: enabled }),

      updateEmergencyGoal: (patch) =>
        set((state) => ({
          emergencyGoal: { ...state.emergencyGoal, ...patch },
        })),

      updateNativeAccount: (id, patch) =>
        set((state) => {
          const prev = state.nativeAccountOverrides[id] ?? {};
          const nextEntry: NativeAccountOverride = {
            ...prev,
            ...patch,
          };
          if (patch.name !== undefined) {
            nextEntry.name = patch.name.trim() || undefined;
          }
          if (patch.assetType !== undefined) {
            nextEntry.assetType = patch.assetType.trim() || undefined;
          }
          if (patch.notes !== undefined) {
            nextEntry.notes = patch.notes.trim() || undefined;
          }
          return {
            undoEntry: createUndoSnapshot('Cuenta base actualizada', state),
            nativeAccountOverrides: {
              ...state.nativeAccountOverrides,
              [id]: nextEntry,
            },
          };
        }),

      resetNativeAccount: (id) =>
        set((state) => {
          const next = { ...state.nativeAccountOverrides };
          delete next[id];
          return {
            undoEntry: createUndoSnapshot('Cuenta base restaurada', state),
            nativeAccountOverrides: next,
          };
        }),

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
              paymentMethod: id,
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
          const nextMovements = state.movements
            .filter((m) => m.bucket !== id)
            .map((m) =>
              m.paymentMethod === id
                ? {
                    ...m,
                    paymentMethod: 'otro' as PaymentMethod,
                  }
                : m,
            );
          const nextExpenses = state.expenses.map((e) =>
            e.preferredPaymentMethod === id
              ? {
                  ...e,
                  preferredPaymentMethod: 'otro' as PaymentMethod,
                }
              : e,
          );
          return {
            undoEntry: target
              ? createUndoSnapshot(`Cuenta eliminada: ${target.name}`, state)
              : state.undoEntry,
            customAccounts: state.customAccounts.filter((a) => a.id !== id),
            movements: nextMovements,
            expenses: nextExpenses,
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

      recordCryptoPortfolioUsdtFlow: ({
        date,
        direction,
        amountUsd,
        notes,
        allowOverdraftFromOtherEnvelopes = false,
      }) => {
        const cleanAmount = Number(Math.abs(amountUsd).toFixed(2));
        if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return;

        set((state) => {
          if (direction === 'in') {
            const incoming: LedgerMovement = {
              id: makeId('mov'),
              date,
              bucket: 'ahorro_inversion',
              type: 'Ingreso a Sobre',
              amountUsd: cleanAmount,
              paymentMethod: 'binance_usdt',
              notes,
            };
            return {
              undoEntry: createUndoSnapshot(notes, state),
              movements: [incoming, ...state.movements],
            };
          }

          const envelopes = calculateEnvelopeSummaries(state.movements);
          const { unassignedUsdtUsd } = calculateEligibleInvestmentCapital(state.movements);
          const created: LedgerMovement[] = [];
          let remaining = cleanAmount;

          // 1. Prioritize Ahorro e Inversión Binance USDT
          const ahorroEnv = envelopes.find((e) => e.id === 'ahorro_inversion');
          const ahorroUsdtAvail = Math.max(0, Number((ahorroEnv?.byMethod.binance ?? 0).toFixed(2)));
          if (ahorroUsdtAvail > 0 && remaining > 0) {
            const take = Number(Math.min(remaining, ahorroUsdtAvail).toFixed(2));
            if (take > 0) {
              created.push({
                id: makeId('mov'),
                date,
                bucket: 'ahorro_inversion',
                type: 'Barrido a Inversión',
                amountUsd: take,
                paymentMethod: 'binance_usdt',
                notes,
              });
              remaining = Number((remaining - take).toFixed(2));
            }
          }

          // 2. Next consume unassigned Binance USDT
          if (remaining > 0.01 && unassignedUsdtUsd > 0) {
            const take = Number(Math.min(remaining, unassignedUsdtUsd).toFixed(2));
            if (take > 0) {
              created.push({
                id: makeId('mov'),
                date,
                bucket: 'binance_usdt',
                type: 'Transferencia (Salida)',
                amountUsd: take,
                paymentMethod: 'binance_usdt',
                notes,
              });
              remaining = Number((remaining - take).toFixed(2));
            }
          }

          // 3. Cascade to other envelopes only if overdraft is explicitly allowed
          if (remaining > 0.01 && allowOverdraftFromOtherEnvelopes) {
            const fallbackOrder: EnvelopeId[] = [
              'disfrute',
              'crecimiento_personal',
              'imprescindibles',
              'provisiones_anuales',
            ];
            for (const envId of fallbackOrder) {
              if (remaining <= 0.01) break;
              const env = envelopes.find((e) => e.id === envId);
              const avail = Math.max(0, Number((env?.byMethod.binance ?? 0).toFixed(2)));
              if (avail > 0) {
                const take = Number(Math.min(remaining, avail).toFixed(2));
                if (take > 0) {
                  created.push({
                    id: makeId('mov'),
                    date,
                    bucket: envId,
                    type: 'Barrido a Inversión',
                    amountUsd: take,
                    paymentMethod: 'binance_usdt',
                    notes: `${notes} (cubierto desde ${ENVELOPE_META[envId].shortName})`,
                  });
                  remaining = Number((remaining - take).toFixed(2));
                }
              }
            }
          }

          // 4. Residual fallback to Ahorro e Inversión if total Binance USDT was exceeded
          if (remaining > 0.01) {
            created.push({
              id: makeId('mov'),
              date,
              bucket: 'ahorro_inversion',
              type: 'Barrido a Inversión',
              amountUsd: remaining,
              paymentMethod: 'binance_usdt',
              notes,
            });
          }

          return {
            undoEntry: createUndoSnapshot(notes, state),
            movements: [...created, ...state.movements],
          };
        });
      },

      recordCryptoPortfolioUsdcFlow: ({ date, direction, amountUsd, notes }) => {
        const cleanAmount = Number(Math.abs(amountUsd).toFixed(2));
        if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return;

        set((state) => {
          const movement: LedgerMovement = {
            id: makeId('mov'),
            date,
            bucket: 'binance_usdc',
            type: direction === 'in' ? 'Barrido a Inversión' : 'Transferencia (Salida)',
            amountUsd: cleanAmount,
            paymentMethod: 'binance_usdt',
            notes,
          };
          return {
            undoEntry: createUndoSnapshot(notes, state),
            movements: [movement, ...state.movements],
          };
        });
      },

      addMovement: (movement) =>
        set((state) => {
          const routed = routeBsOutflowMovements(state, movement);
          return {
            undoEntry: createUndoSnapshot(`Movimiento: ${movement.notes || movement.type}`, state),
            movements: [...routed, ...state.movements],
          };
        }),

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

      multiEnvelopeCustodyExchange: ({
        date,
        fromPaymentMethod,
        toPaymentMethod,
        allocations,
        bcvRateUsed,
        notes,
      }) => {
        if (fromPaymentMethod === toPaymentMethod) return;

        const valid = allocations.filter(
          (a) =>
            Number.isFinite(a.amountFrom) &&
            a.amountFrom > 0 &&
            Number.isFinite(a.amountTo) &&
            a.amountTo > 0,
        );
        if (valid.length === 0) return;

        const label = notes?.trim() ? ` (${notes.trim()})` : '';
        const created: LedgerMovement[] = [];
        let totalFrom = 0;

        for (const item of valid) {
          const cleanFrom = Number(Math.abs(item.amountFrom).toFixed(2));
          const cleanTo = Number(Math.abs(item.amountTo).toFixed(2));
          totalFrom += cleanFrom;

          created.push({
            id: makeId('mov'),
            date,
            bucket: item.bucket,
            type: 'Transferencia (Entrada)',
            amountUsd: cleanTo,
            amountBs: item.amountBsTo,
            bcvRateUsed,
            paymentMethod: toPaymentMethod,
            notes: `Cambio multi-sobre entrada${label}`,
          });
          created.push({
            id: makeId('mov'),
            date,
            bucket: item.bucket,
            type: 'Transferencia (Salida)',
            amountUsd: cleanFrom,
            amountBs: item.amountBsFrom,
            bcvRateUsed,
            paymentMethod: fromPaymentMethod,
            notes: `Cambio multi-sobre salida${label}`,
          });
        }

        set((state) => ({
          undoEntry: createUndoSnapshot(
            `Cambio multi-sobre de $${totalFrom.toFixed(2)}`,
            state,
          ),
          movements: [...created, ...state.movements],
        }));
      },

      removeMovement: (id) => {
        const state = get();
        const target = state.movements.find((m) => m.id === id);
        if (!target) return;

        const targetGroup = target.splitGroupId
          ? state.movements.filter((m) => m.splitGroupId === target.splitGroupId)
          : [target];
        const removedIds = new Set(targetGroup.map((m) => m.id));

        const expenseLink = targetGroup.find((m) => m.linkedExpense)?.linkedExpense;
        let nextExpenses = state.expenses;
        if (expenseLink) {
          const { id: expenseId, previousDueDate } = expenseLink;
          nextExpenses = state.expenses.map((e) =>
            e.id === expenseId ? { ...e, nextDueDate: previousDueDate } : e,
          );
        }

        const nextMovements = state.movements.filter((m) => !removedIds.has(m.id));
        const instLink = targetGroup.find((m) => m.linkedInstallment)?.linkedInstallment;
        let nextInstallments = state.installments;
        if (instLink) {
          const { id: instId, paymentId: linkedPayId, amount, previousDueDate } = instLink;
          nextInstallments = state.installments.map((p) => {
            if (p.id !== instId) return p;
            const prevHistory = p.paymentHistory ?? [];
            const nextHistory = prevHistory.filter(
              (r) =>
                !(linkedPayId && r.id === linkedPayId) &&
                !(r.linkedMovementId && removedIds.has(r.linkedMovementId)),
            );
            const nextCount = Math.max(0, p.paymentsCount - 1);
            const expectedAdvanced =
              previousDueDate ? advanceDueDate(previousDueDate, p.frequency) : undefined;
            const shouldRevertDue =
              Boolean(previousDueDate) &&
              (!expectedAdvanced || !p.nextDueDate || p.nextDueDate === expectedAdvanced);
            return {
              ...p,
              paidTotal: Math.max(0, Number((p.paidTotal - amount).toFixed(2))),
              paymentsCount: nextCount,
              nextDueDate: shouldRevertDue ? previousDueDate : p.nextDueDate,
              lastPaidDate: computeNextLastPaidDate(
                nextHistory,
                nextMovements,
                p.id,
                nextCount,
                p.lastPaidDate,
              ),
              paymentHistory: nextHistory,
            };
          });
        }

        set({
          undoEntry: createUndoSnapshot(
            `Eliminado: ${target.notes || target.type}`,
            state,
          ),
          movements: nextMovements,
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
          nativeAccountOverrides: entry.nativeAccountOverrides,
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
          state.customAccounts,
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
        const isBs =
          isBsPaymentMethod(paymentMethod, state.customAccounts) &&
          Boolean(state.bcvRate && state.bcvRate > 0);
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
        const isBs = isBsPaymentMethod(paymentMethod, state.customAccounts);
        const amountBs =
          options?.amountBs ??
          (isBs && rate ? Number((amountUsd * rate).toFixed(2)) : undefined);

        const todayIso = new Date().toISOString().slice(0, 10);
        const previousDueDate = target.nextDueDate;
        const nextDue = advanceDueDate(previousDueDate, target.frequency);

        const movementType = isBs ? 'Cambio a Bolívares' : 'Gasto en Efectivo';

        const routedMovs = logToLedger
          ? routeBsOutflowMovements(state, {
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
            })
          : [];

        set({
          undoEntry: createUndoSnapshot(`Pago: ${target.name}`, state),
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, nextDueDate: nextDue } : e,
          ),
          movements: logToLedger ? [...routedMovs, ...state.movements] : state.movements,
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
        const cleanAmount = Number(Math.abs(amount).toFixed(2));
        const settlementKind: InstallmentSettlementKind = options?.settlementKind ?? 'monetary';
        const isInKind = settlementKind === 'in_kind';
        const paymentDate = options?.date?.trim() || new Date().toISOString().slice(0, 10);
        const cleanNotes = options?.notes?.trim() || undefined;
        const shouldAdvanceDue = options?.advanceDueDate ?? !isInKind;

        const previousDueDate = plan.nextDueDate;
        const nextDueDate =
          shouldAdvanceDue && previousDueDate
            ? advanceDueDate(previousDueDate, plan.frequency)
            : previousDueDate;
        const didAdvanceDue = Boolean(shouldAdvanceDue && previousDueDate);
        const nextLastPaidDate =
          !plan.lastPaidDate || paymentDate >= plan.lastPaidDate
            ? paymentDate
            : plan.lastPaidDate;
        const paymentId = makeId('instpay');

        if (isInKind) {
          const paymentRecord: InstallmentPaymentRecord = {
            id: paymentId,
            date: paymentDate,
            amountUsd: cleanAmount,
            settlementKind: 'in_kind',
            notes: cleanNotes,
            previousDueDate: didAdvanceDue ? previousDueDate : undefined,
            advancedDueDate: didAdvanceDue,
          };

          const labelPrefix = isReceivable ? 'Abono en especie' : 'Compensación';
          set({
            undoEntry: createUndoSnapshot(
              `${labelPrefix} #${plan.paymentsCount + 1}: ${plan.name}`,
              state,
            ),
            installments: state.installments.map((p) =>
              p.id === id
                ? {
                    ...p,
                    paidTotal: Number((p.paidTotal + cleanAmount).toFixed(2)),
                    paymentsCount: p.paymentsCount + 1,
                    lastPaidDate: nextLastPaidDate,
                    nextDueDate: nextDueDate ?? p.nextDueDate,
                    paymentHistory: [paymentRecord, ...(p.paymentHistory ?? [])],
                  }
                : p,
            ),
          });
          return;
        }

        const envelopeId = options?.envelopeId ?? 'ahorro_inversion';
        const targetBucket: AssetBucketId = options?.bucketOverride ?? envelopeId;
        const paymentMethod = options?.paymentMethod ?? 'efectivo_usd';

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
        const isBs = isBsPaymentMethod(paymentMethod, state.customAccounts);
        const amountBs =
          options?.amountBs ??
          (isBs && rate ? Number((cleanAmount * rate).toFixed(2)) : undefined);

        const baseLabel = `${isReceivable ? 'Cobro' : 'Cuota'} #${plan.paymentsCount + 1}: ${plan.name}`;
        const movementNotes = cleanNotes ? `${baseLabel} · ${cleanNotes}` : baseLabel;

        const baseInstallmentMov: Omit<LedgerMovement, 'id'> = {
          date: paymentDate,
          bucket: targetBucket,
          type: movementType,
          amountUsd: cleanAmount,
          amountBs,
          bcvRateUsed: rate,
          paymentMethod,
          notes: movementNotes,
          linkedInstallment: {
            id: plan.id,
            paymentId,
            amount: cleanAmount,
            previousDueDate: didAdvanceDue ? previousDueDate : undefined,
            note: cleanNotes,
          },
        };

        const routedMovs = isReceivable
          ? [{ ...baseInstallmentMov, id: makeId('mov') }]
          : routeBsOutflowMovements(state, baseInstallmentMov);

        const paymentRecord: InstallmentPaymentRecord = {
          id: paymentId,
          date: paymentDate,
          amountUsd: cleanAmount,
          settlementKind: 'monetary',
          notes: cleanNotes,
          envelopeId: ENVELOPE_BUCKET_SET.has(targetBucket)
            ? (targetBucket as EnvelopeId)
            : undefined,
          paymentMethod,
          amountBs,
          bcvRateUsed: rate,
          linkedMovementId: routedMovs[0]?.id,
          previousDueDate: didAdvanceDue ? previousDueDate : undefined,
          advancedDueDate: didAdvanceDue,
        };

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
                  lastPaidDate: nextLastPaidDate,
                  nextDueDate: nextDueDate ?? p.nextDueDate,
                  paymentHistory: [paymentRecord, ...(p.paymentHistory ?? [])],
                }
              : p,
          ),
          movements: [...routedMovs, ...state.movements],
        });
      },

      updateInstallmentPaymentNote: (planId, paymentId, notes) => {
        const state = get();
        const plan = state.installments.find((p) => p.id === planId);
        if (!plan) return;

        const cleanNotes = notes.trim() || undefined;
        const targetRec = (plan.paymentHistory ?? []).find((r) => r.id === paymentId);

        if (targetRec) {
          const nextInstallments = state.installments.map((p) =>
            p.id !== planId
              ? p
              : {
                  ...p,
                  paymentHistory: (p.paymentHistory ?? []).map((r) =>
                    r.id === paymentId ? { ...r, notes: cleanNotes } : r,
                  ),
                },
          );
          const nextMovements = targetRec.linkedMovementId
            ? state.movements.map((m) =>
                m.id === targetRec.linkedMovementId
                  ? applyNoteToLinkedMovement(m, cleanNotes)
                  : m,
              )
            : state.movements;
          set({
            undoEntry: createUndoSnapshot(`Nota actualizada: ${plan.name}`, state),
            installments: nextInstallments,
            movements: nextMovements,
          });
          return;
        }

        const legacyMov = state.movements.find(
          (m) => m.id === paymentId && m.linkedInstallment?.id === planId,
        );
        if (!legacyMov) return;
        set({
          undoEntry: createUndoSnapshot(`Nota actualizada: ${plan.name}`, state),
          movements: state.movements.map((m) =>
            m.id === paymentId ? applyNoteToLinkedMovement(m, cleanNotes) : m,
          ),
        });
      },

      removeInstallmentPayment: (planId, paymentId) => {
        const state = get();
        const plan = state.installments.find((p) => p.id === planId);
        if (!plan) return;

        const record = (plan.paymentHistory ?? []).find((r) => r.id === paymentId);
        if (!record) {
          const isLegacyMov = state.movements.some(
            (m) => m.id === paymentId && m.linkedInstallment?.id === planId,
          );
          if (isLegacyMov) {
            get().removeMovement(paymentId);
          }
          return;
        }

        const removedIds = new Set<string>();
        if (record.linkedMovementId) {
          const primaryMov = state.movements.find((m) => m.id === record.linkedMovementId);
          if (primaryMov) {
            const group = primaryMov.splitGroupId
              ? state.movements.filter((m) => m.splitGroupId === primaryMov.splitGroupId)
              : [primaryMov];
            for (const m of group) removedIds.add(m.id);
          }
        }

        const nextMovements =
          removedIds.size > 0
            ? state.movements.filter((m) => !removedIds.has(m.id))
            : state.movements;
        const nextHistory = (plan.paymentHistory ?? []).filter((r) => r.id !== paymentId);
        const nextPaidTotal = Math.max(0, Number((plan.paidTotal - record.amountUsd).toFixed(2)));
        const nextCount = Math.max(0, plan.paymentsCount - 1);

        const shouldRevertDue =
          Boolean(record.previousDueDate) &&
          record.advancedDueDate !== false &&
          plan.nextDueDate ===
            advanceDueDate(record.previousDueDate as string, plan.frequency);

        const nextLastPaid = computeNextLastPaidDate(
          nextHistory,
          nextMovements,
          plan.id,
          nextCount,
          plan.lastPaidDate,
        );

        const nextInstallments = state.installments.map((p) =>
          p.id !== planId
            ? p
            : {
                ...p,
                paidTotal: nextPaidTotal,
                paymentsCount: nextCount,
                nextDueDate: shouldRevertDue ? record.previousDueDate : p.nextDueDate,
                lastPaidDate: nextLastPaid,
                paymentHistory: nextHistory,
              },
        );

        const actionLabel =
          record.settlementKind === 'in_kind'
            ? `Eliminado abono en especie: ${plan.name}`
            : `Eliminado ${(plan.direction ?? 'receivable') === 'receivable' ? 'cobro' : 'pago'}: ${plan.name}`;

        set({
          undoEntry: createUndoSnapshot(actionLabel, state),
          installments: nextInstallments,
          movements: nextMovements,
        });
      },

      exportSnapshot: () => {
        const {
          movements,
          expenses,
          installments,
          customAccounts,
          nativeAccountOverrides,
          quincenaConfig,
          emergencyGoal,
          freeBsPoolMode,
        } = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          movements,
          expenses,
          installments,
          customAccounts,
          nativeAccountOverrides,
          quincenaConfig,
          emergencyGoal,
          freeBsPoolMode,
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
          nativeAccountOverrides: snapshot.nativeAccountOverrides ?? {},
          quincenaConfig: snapshot.quincenaConfig,
          emergencyGoal: snapshot.emergencyGoal ?? DEFAULT_EMERGENCY_GOAL,
          freeBsPoolMode: snapshot.freeBsPoolMode ?? true,
          undoEntry: null,
        });
        return true;
      },

      resetToSeed: () => {
        const seed = createDefaultSeed();
        set({
          ...seed,
          customAccounts: [],
          nativeAccountOverrides: {},
          emergencyGoal: DEFAULT_EMERGENCY_GOAL,
          freeBsPoolMode: true,
          undoEntry: null,
        });
      },

      clearAllData: () => {
        set({
          movements: [],
          expenses: [],
          installments: [],
          customAccounts: [],
          nativeAccountOverrides: {},
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
        nativeAccountOverrides: state.nativeAccountOverrides,
        quincenaConfig: state.quincenaConfig,
        emergencyGoal: state.emergencyGoal,
        syncCryptoDca: state.syncCryptoDca,
        freeBsPoolMode: state.freeBsPoolMode,
        bcvRate: state.bcvRate,
        bcvUpdatedAt: state.bcvUpdatedAt,
      }),
    },
  ),
);
