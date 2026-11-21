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
  ExpenseExtrasMetadata,
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
  RegionalProfile,
  SharedSubscription,
  SharedSubscriptionPayment,
} from '../types';
import {
  advanceDueDate,
  calculateEligibleInvestmentCapital,
  calculateEnvelopeSummaries,
  getInstallmentPaymentHistory,
  isBsPaymentMethod,
  isNegativeAdjustmentMovement,
  type QuincenaPreview,
} from '../utils/calculations';
import { fetchDualUsdRates } from '../services/bcvApi';
import { buildLedgerMovementsFromSimulation } from '../services/monthEndEngine';

export interface UndoEntry {
  id: string;
  label: string;
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  sharedSubscriptions: SharedSubscription[];
  customAccounts: CustomAccount[];
  nativeAccountOverrides: NativeAccountOverrides;
}

export interface PayExpenseOptions {
  logToLedger?: boolean;
  paymentMethod?: PaymentMethod;
  amountUsd?: number;
  amountBs?: number;
  bcvRateUsed?: number;
  parallelRateUsed?: number;
  fxGapSavingsUsd?: number;
  appliedExtras?: ExpenseExtrasMetadata;
  notes?: string;
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
  allocateFromUnlogged?: boolean;
}

export interface UpdateInstallmentPaymentPatch {
  date?: string;
  amountUsd?: number;
  notes?: string;
  settlementKind?: 'in_kind' | 'historical';
}

export interface RecordSharedPaymentOptions {
  memberId: string;
  amountUsd: number;
  settlementKind?: InstallmentSettlementKind;
  date?: string;
  notes?: string;
  cycleLabel?: string;
  envelopeId?: EnvelopeId;
  bucketOverride?: AssetBucketId;
  paymentMethod?: PaymentMethod;
  amountBs?: number;
  bcvRateUsed?: number;
}

export interface UpdateSharedPaymentPatch {
  date?: string;
  amountUsd?: number;
  notes?: string;
  cycleLabel?: string;
  settlementKind?: 'in_kind' | 'historical';
}

interface BudgetState {
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  sharedSubscriptions: SharedSubscription[];
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

  // Regional profile (VE / GLOBAL)
  regionalProfile: RegionalProfile;
  setRegionalProfile: (profile: RegionalProfile) => void;

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

  // BCV & Parallel rate state
  bcvRate: number | null;
  bcvUpdatedAt: string | null;
  bcvLoading: boolean;
  bcvError: string | null;
  parallelRate: number | null;
  parallelUpdatedAt: string | null;
  parallelIsManual: boolean;
  refreshBcvRate: (options?: { forceParallel?: boolean }) => Promise<void>;
  setManualBcvRate: (rate: number) => void;
  setManualParallelRate: (rate: number | null) => void;

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
    parallelRateUsed?: number;
    fxGapSavingsUsd?: number;
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
    parallelRateUsed?: number;
    fxGapSavingsUsd?: number;
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
  updateInstallmentPayment: (
    planId: string,
    paymentId: string,
    patch: UpdateInstallmentPaymentPatch,
  ) => void;
  updateInstallmentPaymentNote: (planId: string, paymentId: string, notes: string) => void;
  removeInstallmentPayment: (planId: string, paymentId: string) => void;

  // Shared subscriptions actions
  addSharedSubscription: (sub: Omit<SharedSubscription, 'id'>) => string;
  updateSharedSubscription: (id: string, patch: Partial<SharedSubscription>) => void;
  removeSharedSubscription: (id: string) => void;
  advanceSharedSubscriptionCycle: (
    id: string,
    nextCycleLabel: string,
    advanceRenewalDate?: boolean,
  ) => void;
  recordSharedSubscriptionPayment: (
    subscriptionId: string,
    options: RecordSharedPaymentOptions,
  ) => void;
  updateSharedSubscriptionPayment: (
    subscriptionId: string,
    paymentId: string,
    patch: UpdateSharedPaymentPatch,
  ) => void;
  removeSharedSubscriptionPayment: (subscriptionId: string, paymentId: string) => void;

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
      fxGapSavingsUsd: idx === 0 ? baseMovement.fxGapSavingsUsd : undefined,
      appliedExtras: idx === 0 ? baseMovement.appliedExtras : undefined,
      linkedExpense: idx === 0 ? baseMovement.linkedExpense : undefined,
      linkedInstallment: idx === 0 ? baseMovement.linkedInstallment : undefined,
    };
  });
}

function createUndoSnapshot(
  label: string,
  state: Pick<
    BudgetState,
    | 'movements'
    | 'expenses'
    | 'installments'
    | 'sharedSubscriptions'
    | 'customAccounts'
    | 'nativeAccountOverrides'
  >,
): UndoEntry {
  return {
    id: makeId('undo'),
    label,
    movements: state.movements,
    expenses: state.expenses,
    installments: state.installments,
    sharedSubscriptions: state.sharedSubscriptions,
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

function replaceLinkedNoteSuffix(
  rawNotes: string | undefined,
  prevNote: string | undefined,
  nextNote: string | undefined,
): string | undefined {
  const trimmedPrev = prevNote?.trim();
  let updatedMovNotes = rawNotes ?? '';
  if (trimmedPrev) {
    const token = ` · ${trimmedPrev}`;
    const idx = updatedMovNotes.lastIndexOf(token);
    if (idx !== -1) {
      updatedMovNotes = updatedMovNotes.slice(0, idx) + updatedMovNotes.slice(idx + token.length);
    }
  }
  if (nextNote) {
    updatedMovNotes = updatedMovNotes ? `${updatedMovNotes} · ${nextNote}` : nextNote;
  }
  return updatedMovNotes || undefined;
}

function applyNoteToLinkedMovement(
  movement: LedgerMovement,
  nextNote: string | undefined,
): LedgerMovement {
  if (movement.linkedSharedSubscription) {
    return {
      ...movement,
      notes: replaceLinkedNoteSuffix(
        movement.notes,
        movement.linkedSharedSubscription.note,
        nextNote,
      ),
      linkedSharedSubscription: { ...movement.linkedSharedSubscription, note: nextNote },
    };
  }
  return {
    ...movement,
    notes: replaceLinkedNoteSuffix(
      movement.notes,
      movement.linkedInstallment?.note,
      nextNote,
    ),
    linkedInstallment: movement.linkedInstallment
      ? { ...movement.linkedInstallment, note: nextNote }
      : movement.linkedInstallment,
  };
}

function updateLinkedInstallmentMovements(params: {
  movements: LedgerMovement[];
  primaryMovementId: string;
  oldTotalAmount: number;
  nextDate?: string;
  nextAmountUsd?: number;
  hasNotesPatch: boolean;
  cleanNotes?: string;
}): LedgerMovement[] {
  const {
    movements,
    primaryMovementId,
    oldTotalAmount,
    nextDate,
    nextAmountUsd,
    hasNotesPatch,
    cleanNotes,
  } = params;

  const primaryMov = movements.find((m) => m.id === primaryMovementId);
  if (!primaryMov) return movements;

  const group = primaryMov.splitGroupId
    ? movements.filter((m) => m.splitGroupId === primaryMov.splitGroupId)
    : [primaryMov];
  const groupIds = new Set(group.map((m) => m.id));

  const amountChanged =
    nextAmountUsd !== undefined && Math.abs(nextAmountUsd - oldTotalAmount) > 0.001;

  if (group.length === 1) {
    const sign = primaryMov.amountUsd < 0 ? -1 : 1;
    const updatedAmountUsd =
      amountChanged && nextAmountUsd !== undefined
        ? sign * nextAmountUsd
        : primaryMov.amountUsd;

    let updatedAmountBs = primaryMov.amountBs;
    if (
      amountChanged &&
      nextAmountUsd !== undefined &&
      typeof primaryMov.amountBs === 'number'
    ) {
      const bsSign = primaryMov.amountBs < 0 ? -1 : 1;
      const absNewBs =
        primaryMov.bcvRateUsed && primaryMov.bcvRateUsed > 0
          ? Number((nextAmountUsd * primaryMov.bcvRateUsed).toFixed(2))
          : oldTotalAmount > 0
            ? Number(
                (Math.abs(primaryMov.amountBs) * (nextAmountUsd / oldTotalAmount)).toFixed(2),
              )
            : Math.abs(primaryMov.amountBs);
      updatedAmountBs = bsSign * absNewBs;
    }

    return movements.map((m) => {
      if (m.id !== primaryMov.id) return m;
      let nextMov: LedgerMovement = {
        ...m,
        date: nextDate ?? m.date,
        amountUsd: updatedAmountUsd,
        amountBs: updatedAmountBs,
        linkedInstallment: m.linkedInstallment
          ? {
              ...m.linkedInstallment,
              amount: nextAmountUsd ?? m.linkedInstallment.amount,
            }
          : m.linkedInstallment,
      };
      if (hasNotesPatch) {
        nextMov = applyNoteToLinkedMovement(nextMov, cleanNotes);
      }
      return nextMov;
    });
  }

  const totalAbsOldUsd = group.reduce((acc, g) => acc + Math.abs(g.amountUsd), 0);
  const totalAbsOldBs = group.reduce(
    (acc, g) => acc + (typeof g.amountBs === 'number' ? Math.abs(g.amountBs) : 0),
    0,
  );
  const hasAnyBs = group.some((g) => typeof g.amountBs === 'number');
  const targetAbsTotalUsd = nextAmountUsd ?? oldTotalAmount;
  const targetAbsTotalBs =
    hasAnyBs && amountChanged && nextAmountUsd !== undefined
      ? primaryMov.bcvRateUsed && primaryMov.bcvRateUsed > 0
        ? Number((nextAmountUsd * primaryMov.bcvRateUsed).toFixed(2))
        : totalAbsOldUsd > 0
          ? Number((totalAbsOldBs * (nextAmountUsd / totalAbsOldUsd)).toFixed(2))
          : totalAbsOldBs
      : totalAbsOldBs;

  const updatedGroupById = new Map<string, LedgerMovement>();
  let allocatedUsd = 0;
  let allocatedBs = 0;

  group.forEach((leg, idx) => {
    const isLast = idx === group.length - 1;
    const ratio =
      totalAbsOldUsd > 0 ? Math.abs(leg.amountUsd) / totalAbsOldUsd : 1 / group.length;

    let legUsd = leg.amountUsd;
    if (amountChanged) {
      const sign = leg.amountUsd < 0 ? -1 : 1;
      const absUsd = isLast
        ? Number(Math.max(0, targetAbsTotalUsd - allocatedUsd).toFixed(2))
        : Number((targetAbsTotalUsd * ratio).toFixed(2));
      allocatedUsd = Number((allocatedUsd + absUsd).toFixed(2));
      legUsd = sign * absUsd;
    }

    let legBs = leg.amountBs;
    if (amountChanged && typeof leg.amountBs === 'number') {
      const bsSign = leg.amountBs < 0 ? -1 : 1;
      const absBs = isLast
        ? Number(Math.max(0, targetAbsTotalBs - allocatedBs).toFixed(2))
        : Number((targetAbsTotalBs * ratio).toFixed(2));
      allocatedBs = Number((allocatedBs + absBs).toFixed(2));
      legBs = bsSign * absBs;
    }

    let nextLeg: LedgerMovement = {
      ...leg,
      date: nextDate ?? leg.date,
      amountUsd: legUsd,
      amountBs: legBs,
      linkedInstallment:
        leg.id === primaryMov.id && leg.linkedInstallment
          ? {
              ...leg.linkedInstallment,
              amount: nextAmountUsd ?? leg.linkedInstallment.amount,
            }
          : leg.linkedInstallment,
    };

    if (hasNotesPatch && leg.id === primaryMov.id) {
      nextLeg = applyNoteToLinkedMovement(nextLeg, cleanNotes);
    }

    updatedGroupById.set(leg.id, nextLeg);
  });

  return movements.map((m) => (groupIds.has(m.id) ? updatedGroupById.get(m.id)! : m));
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      movements: initialSeed.movements,
      expenses: initialSeed.expenses,
      installments: initialSeed.installments,
      sharedSubscriptions: [],
      customAccounts: [],
      nativeAccountOverrides: {},
      quincenaConfig: initialSeed.quincenaConfig,
      emergencyGoal: DEFAULT_EMERGENCY_GOAL,
      syncCryptoDca: true,
      freeBsPoolMode: true,
      regionalProfile: 'VE',
      undoEntry: null,
      bcvRate: null,
      bcvUpdatedAt: null,
      bcvLoading: false,
      bcvError: null,
      parallelRate: null,
      parallelUpdatedAt: null,
      parallelIsManual: false,

      setSyncCryptoDca: (enabled) => set({ syncCryptoDca: enabled }),

      setFreeBsPoolMode: (enabled) => set({ freeBsPoolMode: enabled }),

      setRegionalProfile: (profile) => set({ regionalProfile: profile }),

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
          const nextSharedSubscriptions = state.sharedSubscriptions.map((sub) => ({
            ...sub,
            payments: sub.payments.map((p) =>
              p.paymentMethod === id
                ? {
                    ...p,
                    paymentMethod: 'otro' as PaymentMethod,
                  }
                : p,
            ),
          }));
          return {
            undoEntry: target
              ? createUndoSnapshot(`Cuenta eliminada: ${target.name}`, state)
              : state.undoEntry,
            customAccounts: state.customAccounts.filter((a) => a.id !== id),
            movements: nextMovements,
            expenses: nextExpenses,
            sharedSubscriptions: nextSharedSubscriptions,
          };
        }),

      refreshBcvRate: async (options) => {
        set({ bcvLoading: true, bcvError: null });
        try {
          const res = await fetchDualUsdRates();
          set((state) => {
            const shouldUpdateParallel =
              res.parallelRate !== null &&
              (Boolean(options?.forceParallel) || !state.parallelIsManual);
            return {
              bcvRate: res.bcvRate,
              bcvUpdatedAt: res.bcvUpdatedAt,
              bcvLoading: false,
              bcvError: null,
              parallelRate: shouldUpdateParallel ? res.parallelRate : state.parallelRate,
              parallelUpdatedAt: shouldUpdateParallel
                ? res.parallelUpdatedAt
                : state.parallelUpdatedAt,
              parallelIsManual: options?.forceParallel ? false : state.parallelIsManual,
            };
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

      setManualParallelRate: (rate) => {
        if (rate === null) {
          set({ parallelRate: null, parallelUpdatedAt: null, parallelIsManual: false });
          return;
        }
        if (!Number.isFinite(rate) || rate <= 0) return;
        set({
          parallelRate: Number(rate.toFixed(4)),
          parallelUpdatedAt: new Date().toISOString(),
          parallelIsManual: true,
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
        parallelRateUsed,
        fxGapSavingsUsd,
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
          parallelRateUsed,
          fxGapSavingsUsd,
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
        parallelRateUsed,
        fxGapSavingsUsd,
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

        valid.forEach((item, idx) => {
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
            parallelRateUsed,
            fxGapSavingsUsd: idx === 0 ? fxGapSavingsUsd : undefined,
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
        });

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

        const sharedLinks = targetGroup
          .map((m) => m.linkedSharedSubscription)
          .filter((x): x is NonNullable<LedgerMovement['linkedSharedSubscription']> => Boolean(x));
        const nextSharedSubscriptions =
          sharedLinks.length > 0
            ? state.sharedSubscriptions.map((sub) => {
                const subLinks = sharedLinks.filter((l) => l.subscriptionId === sub.id);
                if (subLinks.length === 0) return sub;
                const linkedPayIds = new Set(subLinks.map((l) => l.paymentId));
                return {
                  ...sub,
                  payments: sub.payments.filter(
                    (p) =>
                      !linkedPayIds.has(p.id) &&
                      !(p.linkedMovementId && removedIds.has(p.linkedMovementId)),
                  ),
                };
              })
            : state.sharedSubscriptions;

        set({
          undoEntry: createUndoSnapshot(
            `Eliminado: ${target.notes || target.type}`,
            state,
          ),
          movements: nextMovements,
          expenses: nextExpenses,
          installments: nextInstallments,
          sharedSubscriptions: nextSharedSubscriptions,
        });
      },

      undoLastAction: () => {
        const entry = get().undoEntry;
        if (!entry) return;
        set({
          movements: entry.movements,
          expenses: entry.expenses,
          installments: entry.installments,
          sharedSubscriptions: entry.sharedSubscriptions ?? [],
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
            sharedSubscriptions: state.sharedSubscriptions.map((s) =>
              s.linkedExpenseId === id ? { ...s, linkedExpenseId: undefined } : s,
            ),
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
              parallelRateUsed: options?.parallelRateUsed,
              fxGapSavingsUsd: options?.fxGapSavingsUsd,
              appliedExtras: options?.appliedExtras,
              paymentMethod,
              notes: options?.notes?.trim() || `Pago: ${target.name}`,
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
        const isOffLedger = settlementKind === 'in_kind' || settlementKind === 'historical';
        const paymentDate = options?.date?.trim() || new Date().toISOString().slice(0, 10);
        const cleanNotes = options?.notes?.trim() || undefined;
        const shouldAdvanceDue = options?.advanceDueDate ?? !isOffLedger;

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

        if (isOffLedger) {
          let absorbedUsd = 0;
          let absorbedCount = false;
          if (options?.allocateFromUnlogged) {
            const history = getInstallmentPaymentHistory(plan, state.movements);
            absorbedUsd = Number(Math.min(cleanAmount, history.unloggedTotalUsd).toFixed(2));
            absorbedCount = history.unloggedCount > 0;
          }
          const addedPaidUsd = Number((cleanAmount - absorbedUsd).toFixed(2));
          const nextPaidTotal = Number((plan.paidTotal + addedPaidUsd).toFixed(2));
          const nextPaymentsCount = plan.paymentsCount + (absorbedCount ? 0 : 1);

          const paymentRecord: InstallmentPaymentRecord = {
            id: paymentId,
            date: paymentDate,
            amountUsd: cleanAmount,
            settlementKind,
            notes: cleanNotes,
            previousDueDate: didAdvanceDue ? previousDueDate : undefined,
            advancedDueDate: didAdvanceDue,
            absorbedUnloggedUsd: absorbedUsd > 0 ? absorbedUsd : undefined,
            absorbedUnloggedCount: absorbedCount || undefined,
          };

          const labelPrefix =
            settlementKind === 'historical'
              ? 'Pago histórico'
              : isReceivable
                ? 'Abono en especie'
                : 'Compensación';
          set({
            undoEntry: createUndoSnapshot(
              `${labelPrefix}: ${plan.name}`,
              state,
            ),
            installments: state.installments.map((p) =>
              p.id === id
                ? {
                    ...p,
                    paidTotal: nextPaidTotal,
                    paymentsCount: nextPaymentsCount,
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

      updateInstallmentPayment: (planId, paymentId, patch) => {
        const state = get();
        const plan = state.installments.find((p) => p.id === planId);
        if (!plan) return;

        const nextDatePatch = patch.date !== undefined ? patch.date.trim() : undefined;
        const nextAmount =
          patch.amountUsd !== undefined ? Number(Math.abs(patch.amountUsd).toFixed(2)) : undefined;
        if (
          patch.amountUsd !== undefined &&
          (!Number.isFinite(nextAmount) || (nextAmount ?? 0) <= 0)
        ) {
          return;
        }
        const hasNotesPatch = patch.notes !== undefined;
        const cleanNotes = hasNotesPatch ? patch.notes!.trim() || undefined : undefined;

        const targetRec = (plan.paymentHistory ?? []).find((r) => r.id === paymentId);

        if (targetRec) {
          const oldAmount = targetRec.amountUsd;
          const finalAmount = nextAmount ?? oldAmount;
          const finalDate = nextDatePatch || targetRec.date;
          const finalNotes = hasNotesPatch ? cleanNotes : targetRec.notes;
          const finalKind: InstallmentSettlementKind =
            targetRec.settlementKind !== 'monetary' && patch.settlementKind
              ? patch.settlementKind
              : targetRec.settlementKind;
          const amountChanged = Math.abs(finalAmount - oldAmount) > 0.001;

          const oldAbsorbed = targetRec.absorbedUnloggedUsd ?? 0;
          const oldNetAdded = Number(Math.max(0, oldAmount - oldAbsorbed).toFixed(2));
          let nextAbsorbed = oldAbsorbed;
          let nextNetAdded = finalAmount;

          if (oldAbsorbed > 0) {
            const currentUnloggedUsd = getInstallmentPaymentHistory(
              plan,
              state.movements,
            ).unloggedTotalUsd;
            if (finalAmount >= oldAmount) {
              const increase = Number((finalAmount - oldAmount).toFixed(2));
              const extraAbsorb = Number(Math.min(increase, currentUnloggedUsd).toFixed(2));
              nextAbsorbed = Number((oldAbsorbed + extraAbsorb).toFixed(2));
              nextNetAdded = Number((oldNetAdded + (increase - extraAbsorb)).toFixed(2));
            } else {
              const decrease = Number((oldAmount - finalAmount).toFixed(2));
              const reduceNet = Number(Math.min(decrease, oldNetAdded).toFixed(2));
              nextNetAdded = Number((oldNetAdded - reduceNet).toFixed(2));
              nextAbsorbed = Number(Math.max(0, oldAbsorbed - (decrease - reduceNet)).toFixed(2));
            }
          }

          const paidTotalDelta = Number((nextNetAdded - oldNetAdded).toFixed(2));
          const nextPaidTotal = Math.max(0, Number((plan.paidTotal + paidTotalDelta).toFixed(2)));

          const nextRecAmountBs =
            amountChanged && typeof targetRec.amountBs === 'number'
              ? targetRec.bcvRateUsed && targetRec.bcvRateUsed > 0
                ? Number((finalAmount * targetRec.bcvRateUsed).toFixed(2))
                : oldAmount > 0
                  ? Number((targetRec.amountBs * (finalAmount / oldAmount)).toFixed(2))
                  : targetRec.amountBs
              : targetRec.amountBs;

          const nextHistory = (plan.paymentHistory ?? []).map((r) =>
            r.id === paymentId
              ? {
                  ...r,
                  date: finalDate,
                  amountUsd: finalAmount,
                  notes: finalNotes,
                  settlementKind: finalKind,
                  amountBs: nextRecAmountBs,
                  absorbedUnloggedUsd: nextAbsorbed > 0 ? nextAbsorbed : undefined,
                }
              : r,
          );

          const nextMovements = targetRec.linkedMovementId
            ? updateLinkedInstallmentMovements({
                movements: state.movements,
                primaryMovementId: targetRec.linkedMovementId,
                oldTotalAmount: oldAmount,
                nextDate: finalDate,
                nextAmountUsd: finalAmount,
                hasNotesPatch,
                cleanNotes,
              })
            : state.movements;

          const nextLastPaid = computeNextLastPaidDate(
            nextHistory,
            nextMovements,
            plan.id,
            plan.paymentsCount,
            plan.lastPaidDate,
          );

          set({
            undoEntry: createUndoSnapshot(`Abono editado: ${plan.name}`, state),
            installments: state.installments.map((p) =>
              p.id !== planId
                ? p
                : {
                    ...p,
                    paidTotal: nextPaidTotal,
                    lastPaidDate: nextLastPaid,
                    paymentHistory: nextHistory,
                  },
            ),
            movements: nextMovements,
          });
          return;
        }

        const legacyMov = state.movements.find(
          (m) => m.id === paymentId && m.linkedInstallment?.id === planId,
        );
        if (!legacyMov) return;

        const oldAmount = Math.abs(legacyMov.linkedInstallment?.amount ?? legacyMov.amountUsd);
        const finalAmount = nextAmount ?? oldAmount;
        const delta = Number((finalAmount - oldAmount).toFixed(2));
        const finalDate = nextDatePatch || legacyMov.date;

        const nextMovements = updateLinkedInstallmentMovements({
          movements: state.movements,
          primaryMovementId: paymentId,
          oldTotalAmount: oldAmount,
          nextDate: finalDate,
          nextAmountUsd: finalAmount,
          hasNotesPatch,
          cleanNotes,
        });

        const nextLastPaid = computeNextLastPaidDate(
          plan.paymentHistory ?? [],
          nextMovements,
          plan.id,
          plan.paymentsCount,
          plan.lastPaidDate,
        );

        set({
          undoEntry: createUndoSnapshot(`Abono editado: ${plan.name}`, state),
          installments: state.installments.map((p) =>
            p.id !== planId
              ? p
              : {
                  ...p,
                  paidTotal: Math.max(0, Number((p.paidTotal + delta).toFixed(2))),
                  lastPaidDate: nextLastPaid,
                },
          ),
          movements: nextMovements,
        });
      },

      updateInstallmentPaymentNote: (planId, paymentId, notes) => {
        get().updateInstallmentPayment(planId, paymentId, { notes });
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
        const netAddedUsd = Number(
          Math.max(0, record.amountUsd - (record.absorbedUnloggedUsd ?? 0)).toFixed(2),
        );
        const nextPaidTotal = Math.max(0, Number((plan.paidTotal - netAddedUsd).toFixed(2)));
        const nextCount = record.absorbedUnloggedCount
          ? plan.paymentsCount
          : Math.max(0, plan.paymentsCount - 1);

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
          record.settlementKind === 'historical'
            ? `Eliminado pago histórico: ${plan.name}`
            : record.settlementKind === 'in_kind'
              ? `Eliminado abono en especie: ${plan.name}`
              : `Eliminado ${(plan.direction ?? 'receivable') === 'receivable' ? 'cobro' : 'pago'}: ${plan.name}`;

        set({
          undoEntry: createUndoSnapshot(actionLabel, state),
          installments: nextInstallments,
          movements: nextMovements,
        });
      },

      addSharedSubscription: (sub) => {
        const state = get();
        const id = makeId('sub');
        const created: SharedSubscription = {
          ...sub,
          id,
          totalAmountUsd: Number(Math.max(0, sub.totalAmountUsd).toFixed(2)),
          members: sub.members.map((m) => ({
            ...m,
            id: m.id || makeId('subm'),
          })),
          payments: sub.payments ?? [],
        };
        set({
          undoEntry: createUndoSnapshot(`Suscripción creada: ${created.name}`, state),
          sharedSubscriptions: [...state.sharedSubscriptions, created],
        });
        return id;
      },

      updateSharedSubscription: (id, patch) =>
        set((state) => {
          const target = state.sharedSubscriptions.find((s) => s.id === id);
          if (!target) return state;
          return {
            undoEntry: createUndoSnapshot(`Suscripción editada: ${patch.name ?? target.name}`, state),
            sharedSubscriptions: state.sharedSubscriptions.map((s) =>
              s.id === id
                ? {
                    ...s,
                    ...patch,
                    totalAmountUsd:
                      patch.totalAmountUsd !== undefined
                        ? Number(Math.max(0, patch.totalAmountUsd).toFixed(2))
                        : s.totalAmountUsd,
                    members: patch.members
                      ? patch.members.map((m) => ({
                          ...m,
                          id: m.id || makeId('subm'),
                        }))
                      : s.members,
                  }
                : s,
            ),
          };
        }),

      removeSharedSubscription: (id) =>
        set((state) => {
          const target = state.sharedSubscriptions.find((s) => s.id === id);
          if (!target) return state;
          return {
            undoEntry: createUndoSnapshot(`Suscripción eliminada: ${target.name}`, state),
            sharedSubscriptions: state.sharedSubscriptions.filter((s) => s.id !== id),
          };
        }),

      advanceSharedSubscriptionCycle: (id, nextCycleLabel, advanceRenewalDate = true) =>
        set((state) => {
          const cleanLabel = nextCycleLabel.trim();
          const target = state.sharedSubscriptions.find((s) => s.id === id);
          if (!target || !cleanLabel) return state;

          const nextRenewal =
            advanceRenewalDate && target.nextRenewalDate
              ? advanceDueDate(target.nextRenewalDate, target.frequency)
              : target.nextRenewalDate;

          return {
            undoEntry: createUndoSnapshot(
              `Nuevo ciclo ${cleanLabel}: ${target.name}`,
              state,
            ),
            sharedSubscriptions: state.sharedSubscriptions.map((s) =>
              s.id === id
                ? {
                    ...s,
                    currentCycleLabel: cleanLabel,
                    nextRenewalDate: nextRenewal,
                  }
                : s,
            ),
          };
        }),

      recordSharedSubscriptionPayment: (subscriptionId, options) => {
        const state = get();
        const sub = state.sharedSubscriptions.find((s) => s.id === subscriptionId);
        if (!sub) return;
        const cleanAmount = Number(Math.abs(options.amountUsd).toFixed(2));
        if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) return;

        const member = sub.members.find((m) => m.id === options.memberId);
        const memberName = member?.name ?? 'Miembro';
        const cycleLabel = options.cycleLabel?.trim() || sub.currentCycleLabel;
        const settlementKind: InstallmentSettlementKind = options.settlementKind ?? 'monetary';
        const isOffLedger = settlementKind === 'in_kind' || settlementKind === 'historical';
        const paymentDate = options.date?.trim() || new Date().toISOString().slice(0, 10);
        const cleanNotes = options.notes?.trim() || undefined;
        const paymentId = makeId('subpay');

        if (isOffLedger) {
          const newPayment: SharedSubscriptionPayment = {
            id: paymentId,
            memberId: options.memberId,
            memberName,
            cycleLabel,
            date: paymentDate,
            amountUsd: cleanAmount,
            settlementKind,
            notes: cleanNotes,
          };

          const prefix =
            settlementKind === 'historical' ? 'Cobro histórico' : 'Cobro en especie';
          set({
            undoEntry: createUndoSnapshot(`${prefix}: ${sub.name} (${memberName})`, state),
            sharedSubscriptions: state.sharedSubscriptions.map((s) =>
              s.id === subscriptionId
                ? { ...s, payments: [newPayment, ...s.payments] }
                : s,
            ),
          });
          return;
        }

        const targetBucket: AssetBucketId =
          options.bucketOverride ??
          options.envelopeId ??
          sub.defaultEnvelopeId ??
          'ahorro_inversion';
        const paymentMethod = options.paymentMethod ?? 'efectivo_usd';
        const movementType =
          targetBucket === 'binance_usdt' ||
          targetBucket === 'binance_crypto' ||
          targetBucket === 'binance_paxg' ||
          targetBucket === 'binance_usdc' ||
          targetBucket === 'wallet_btc'
            ? 'Barrido a Inversión'
            : 'Ingreso a Sobre';

        const rate = options.bcvRateUsed ?? state.bcvRate ?? undefined;
        const isBs = isBsPaymentMethod(paymentMethod, state.customAccounts);
        const amountBs =
          options.amountBs ??
          (isBs && rate ? Number((cleanAmount * rate).toFixed(2)) : undefined);

        const baseLabel = `Cobro ${sub.name} (${memberName} · ${cycleLabel})`;
        const movementNotes = cleanNotes ? `${baseLabel} · ${cleanNotes}` : baseLabel;

        const newMov: LedgerMovement = {
          id: makeId('mov'),
          date: paymentDate,
          bucket: targetBucket,
          type: movementType,
          amountUsd: cleanAmount,
          amountBs,
          bcvRateUsed: rate,
          paymentMethod,
          notes: movementNotes,
          linkedSharedSubscription: {
            subscriptionId: sub.id,
            paymentId,
            memberId: options.memberId,
            note: cleanNotes,
          },
        };

        const newPayment: SharedSubscriptionPayment = {
          id: paymentId,
          memberId: options.memberId,
          memberName,
          cycleLabel,
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
          linkedMovementId: newMov.id,
        };

        set({
          undoEntry: createUndoSnapshot(`Cobro ${sub.name} (${memberName})`, state),
          sharedSubscriptions: state.sharedSubscriptions.map((s) =>
            s.id === subscriptionId
              ? { ...s, payments: [newPayment, ...s.payments] }
              : s,
          ),
          movements: [newMov, ...state.movements],
        });
      },

      updateSharedSubscriptionPayment: (subscriptionId, paymentId, patch) => {
        const state = get();
        const sub = state.sharedSubscriptions.find((s) => s.id === subscriptionId);
        if (!sub) return;
        const target = sub.payments.find((p) => p.id === paymentId);
        if (!target) return;

        const nextDatePatch = patch.date !== undefined ? patch.date.trim() : undefined;
        const nextAmount =
          patch.amountUsd !== undefined ? Number(Math.abs(patch.amountUsd).toFixed(2)) : undefined;
        if (
          patch.amountUsd !== undefined &&
          (!Number.isFinite(nextAmount) || (nextAmount ?? 0) <= 0)
        ) {
          return;
        }
        const hasNotesPatch = patch.notes !== undefined;
        const cleanNotes = hasNotesPatch ? patch.notes!.trim() || undefined : undefined;
        const nextCycle = patch.cycleLabel?.trim() || target.cycleLabel;

        const oldAmount = target.amountUsd;
        const finalAmount = nextAmount ?? oldAmount;
        const finalDate = nextDatePatch || target.date;
        const finalNotes = hasNotesPatch ? cleanNotes : target.notes;
        const finalKind: InstallmentSettlementKind =
          target.settlementKind !== 'monetary' && patch.settlementKind
            ? patch.settlementKind
            : target.settlementKind;
        const amountChanged = Math.abs(finalAmount - oldAmount) > 0.001;

        const nextPaymentBs =
          amountChanged && typeof target.amountBs === 'number'
            ? target.bcvRateUsed && target.bcvRateUsed > 0
              ? Number((finalAmount * target.bcvRateUsed).toFixed(2))
              : oldAmount > 0
                ? Number((target.amountBs * (finalAmount / oldAmount)).toFixed(2))
                : target.amountBs
            : target.amountBs;

        const nextMovements = target.linkedMovementId
          ? updateLinkedInstallmentMovements({
              movements: state.movements,
              primaryMovementId: target.linkedMovementId,
              oldTotalAmount: oldAmount,
              nextDate: finalDate,
              nextAmountUsd: finalAmount,
              hasNotesPatch,
              cleanNotes,
            })
          : state.movements;

        set({
          undoEntry: createUndoSnapshot(`Cobro editado: ${sub.name}`, state),
          sharedSubscriptions: state.sharedSubscriptions.map((s) =>
            s.id !== subscriptionId
              ? s
              : {
                  ...s,
                  payments: s.payments.map((p) =>
                    p.id !== paymentId
                      ? p
                      : {
                          ...p,
                          date: finalDate,
                          amountUsd: finalAmount,
                          cycleLabel: nextCycle,
                          notes: finalNotes,
                          settlementKind: finalKind,
                          amountBs: nextPaymentBs,
                        },
                  ),
                },
          ),
          movements: nextMovements,
        });
      },

      removeSharedSubscriptionPayment: (subscriptionId, paymentId) => {
        const state = get();
        const sub = state.sharedSubscriptions.find((s) => s.id === subscriptionId);
        if (!sub) return;
        const target = sub.payments.find((p) => p.id === paymentId);
        if (!target) return;

        const nextMovements = target.linkedMovementId
          ? state.movements.filter((m) => m.id !== target.linkedMovementId)
          : state.movements;

        set({
          undoEntry: createUndoSnapshot(`Eliminado cobro: ${sub.name}`, state),
          sharedSubscriptions: state.sharedSubscriptions.map((s) =>
            s.id !== subscriptionId
              ? s
              : {
                  ...s,
                  payments: s.payments.filter((p) => p.id !== paymentId),
                },
          ),
          movements: nextMovements,
        });
      },

      exportSnapshot: () => {
        const {
          movements,
          expenses,
          installments,
          sharedSubscriptions,
          customAccounts,
          nativeAccountOverrides,
          quincenaConfig,
          emergencyGoal,
          freeBsPoolMode,
          regionalProfile,
          parallelRate,
        } = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          movements,
          expenses,
          installments,
          sharedSubscriptions,
          customAccounts,
          nativeAccountOverrides,
          quincenaConfig,
          emergencyGoal,
          freeBsPoolMode,
          regionalProfile,
          parallelRate,
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
          sharedSubscriptions: Array.isArray(snapshot.sharedSubscriptions)
            ? snapshot.sharedSubscriptions
            : [],
          customAccounts: Array.isArray(snapshot.customAccounts) ? snapshot.customAccounts : [],
          nativeAccountOverrides: snapshot.nativeAccountOverrides ?? {},
          quincenaConfig: snapshot.quincenaConfig,
          emergencyGoal: snapshot.emergencyGoal ?? DEFAULT_EMERGENCY_GOAL,
          freeBsPoolMode: snapshot.freeBsPoolMode ?? true,
          regionalProfile: snapshot.regionalProfile ?? 'VE',
          parallelRate:
            typeof snapshot.parallelRate === 'number' && snapshot.parallelRate > 0
              ? snapshot.parallelRate
              : null,
          undoEntry: null,
        });
        return true;
      },

      resetToSeed: () => {
        const seed = createDefaultSeed();
        set({
          ...seed,
          sharedSubscriptions: [],
          customAccounts: [],
          nativeAccountOverrides: {},
          emergencyGoal: DEFAULT_EMERGENCY_GOAL,
          freeBsPoolMode: true,
          regionalProfile: 'VE',
          parallelRate: null,
          parallelUpdatedAt: null,
          parallelIsManual: false,
          undoEntry: null,
        });
      },

      clearAllData: () => {
        set({
          movements: [],
          expenses: [],
          installments: [],
          sharedSubscriptions: [],
          customAccounts: [],
          nativeAccountOverrides: {},
          quincenaConfig: initialSeed.quincenaConfig,
          emergencyGoal: DEFAULT_EMERGENCY_GOAL,
          freeBsPoolMode: true,
          regionalProfile: 'VE',
          parallelRate: null,
          parallelUpdatedAt: null,
          parallelIsManual: false,
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
        sharedSubscriptions: state.sharedSubscriptions,
        customAccounts: state.customAccounts,
        nativeAccountOverrides: state.nativeAccountOverrides,
        quincenaConfig: state.quincenaConfig,
        emergencyGoal: state.emergencyGoal,
        syncCryptoDca: state.syncCryptoDca,
        freeBsPoolMode: state.freeBsPoolMode,
        regionalProfile: state.regionalProfile,
        bcvRate: state.bcvRate,
        bcvUpdatedAt: state.bcvUpdatedAt,
        parallelRate: state.parallelRate,
        parallelUpdatedAt: state.parallelUpdatedAt,
        parallelIsManual: state.parallelIsManual,
      }),
    },
  ),
);
