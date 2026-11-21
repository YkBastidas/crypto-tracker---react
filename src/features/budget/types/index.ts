export type CustomAccountId = `acct_${string}`;
export type AccountCurrency = 'USD' | 'VES';

export interface CustomAccount {
  id: CustomAccountId;
  name: string;
  currency: AccountCurrency;
  subtitle?: string;
  createdAt: string;
}

export type BuiltinFundId =
  | 'efectivo_sobres'
  | 'cuenta_bolivares'
  | 'inversiones_binance'
  | 'fondo_emergencia'
  | 'billetera_btc';

export type FundId = BuiltinFundId | CustomAccountId;

export interface NativeAccountOverride {
  name?: string;
  assetType?: string;
  notes?: string;
  hidden?: boolean;
}

export type NativeAccountOverrides = Partial<Record<BuiltinFundId, NativeAccountOverride>>;

export type EnvelopeId =
  | 'ahorro_inversion'
  | 'imprescindibles'
  | 'disfrute'
  | 'crecimiento_personal'
  | 'provisiones_anuales';

export type AssetBucketId =
  | EnvelopeId
  | 'banco_bolivares'
  | 'emergencias'
  | 'binance_crypto'
  | 'binance_usdt'
  | 'binance_paxg'
  | 'binance_usdc'
  | 'wallet_btc'
  | CustomAccountId;

export type NativePaymentMethod =
  | 'efectivo_usd'
  | 'binance_usdt'
  | 'bolivares_pago_movil'
  | 'otro';

export type PaymentMethod = NativePaymentMethod | CustomAccountId;

export type MovementType =
  | 'Ingreso a Sobre'
  | 'Gasto en Efectivo'
  | 'Cambio a Bolívares'
  | 'Barrido a Inversión'
  | 'Pago de Cuota'
  | 'Transferencia (Salida)'
  | 'Transferencia (Entrada)'
  | 'Ajuste';

export type RolloverRuleType =
  | 'SWEEP_ALL'
  | 'PHASED_CAP'
  | 'ACCUMULATE'
  | 'INVESTMENT_POOL'
  | 'TARGET_VAULT';

export type InternalTransactionType = 'SWEEP' | 'ROLLOVER';

export type RegionalProfile = 'VE' | 'GLOBAL';

export interface ExpenseExtrasMetadata {
  baseUsd: number;
  ivaPct?: number;
  servicePct?: number;
  igtfPct?: number;
}

export interface LedgerMovement {
  id: string;
  date: string; // YYYY-MM-DD
  bucket: AssetBucketId;
  type: MovementType;
  internalType?: InternalTransactionType;
  amountUsd: number;
  amountBs?: number;
  bcvRateUsed?: number;
  parallelRateUsed?: number;
  fxGapSavingsUsd?: number;
  appliedExtras?: ExpenseExtrasMetadata;
  paymentMethod?: PaymentMethod;
  notes?: string;
  quincenaId?: string;
  splitGroupId?: string;
  linkedExpense?: {
    id: string;
    previousDueDate: string;
  };
  linkedInstallment?: {
    id: string;
    paymentId?: string;
    amount: number;
    previousDueDate?: string;
    note?: string;
  };
  linkedSharedSubscription?: {
    subscriptionId: string;
    paymentId: string;
    memberId: string;
    note?: string;
  };
}

export type AllocationMode = 'percentage' | 'fixed';

export interface EnvelopeRule {
  envelopeId: EnvelopeId;
  mode: AllocationMode;
  value: number; // percentage (0-100) or fixed USD
}

export interface QuincenaConfig {
  rules: EnvelopeRule[];
  autoProvisionExpenses: boolean;
  autoProvisionInstallments: boolean;
}

export type ExpenseFrequency = 'mensual' | 'anual' | 'quincenal';

export interface RecurringExpense {
  id: string;
  name: string;
  amountUsd: number;
  frequency: ExpenseFrequency;
  nextDueDate: string; // YYYY-MM-DD
  envelopeId: EnvelopeId;
  preferredPaymentMethod?: PaymentMethod;
  active: boolean;
}

export type InstallmentFrequency = 'semanal' | 'quincenal' | 'mensual' | 'anual';
export type InstallmentDirection = 'receivable' | 'payable';
export type InstallmentSettlementKind = 'monetary' | 'in_kind' | 'historical';

export interface InstallmentPaymentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  amountUsd: number;
  settlementKind: InstallmentSettlementKind;
  notes?: string;
  envelopeId?: EnvelopeId;
  paymentMethod?: PaymentMethod;
  amountBs?: number;
  bcvRateUsed?: number;
  linkedMovementId?: string;
  previousDueDate?: string;
  advancedDueDate?: boolean;
  absorbedUnloggedUsd?: number;
  absorbedUnloggedCount?: boolean;
}

export interface InstallmentPlan {
  id: string;
  name: string;
  direction?: InstallmentDirection; // 'receivable' = me deben (default), 'payable' = debo
  installmentAmount: number;
  frequency: InstallmentFrequency;
  maxCap: number | null; // null = sin tope
  paidTotal: number;
  paymentsCount: number;
  startDate?: string; // YYYY-MM-DD para calcular atrasos
  nextDueDate?: string; // YYYY-MM-DD próximo pago/cobro
  lastPaidDate?: string;
  notes?: string;
  paymentHistory?: InstallmentPaymentRecord[];
}

export type SharedSubscriptionFrequency = 'mensual' | 'anual' | 'quincenal';

export interface SharedSubscriptionPayment {
  id: string;
  memberId: string;
  memberName?: string;
  cycleLabel: string; // e.g. '2026' or '2026-11'
  date: string; // YYYY-MM-DD
  amountUsd: number;
  settlementKind: InstallmentSettlementKind;
  notes?: string;
  envelopeId?: EnvelopeId;
  paymentMethod?: PaymentMethod;
  amountBs?: number;
  bcvRateUsed?: number;
  linkedMovementId?: string;
}

export interface SharedSubscriptionMember {
  id: string;
  name: string;
  customShareUsd?: number | null;
  notes?: string;
}

export interface SharedSubscription {
  id: string;
  name: string;
  totalAmountUsd: number;
  frequency: SharedSubscriptionFrequency;
  includesMe: boolean;
  currentCycleLabel: string;
  nextRenewalDate?: string;
  linkedExpenseId?: string;
  defaultEnvelopeId?: EnvelopeId;
  members: SharedSubscriptionMember[];
  payments: SharedSubscriptionPayment[];
  notes?: string;
}

export type EmergencyGoalMode = 'months_of_essentials' | 'custom';

export interface EmergencyGoalConfig {
  mode: EmergencyGoalMode;
  months: number;
  customAmount: number;
}

export interface BudgetSnapshot {
  version: number;
  exportedAt: string;
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  sharedSubscriptions?: SharedSubscription[];
  quincenaConfig: QuincenaConfig;
  customAccounts?: CustomAccount[];
  nativeAccountOverrides?: NativeAccountOverrides;
  emergencyGoal?: EmergencyGoalConfig;
  freeBsPoolMode?: boolean;
  regionalProfile?: RegionalProfile;
  parallelRate?: number | null;
}

export interface FundSummary {
  id: FundId;
  name: string;
  assetType: string;
  notes: string;
  defaultName?: string;
  defaultAssetType?: string;
  hidden?: boolean;
  balance: number;
  balanceBs?: number;
  percentage: number;
  isCustom?: boolean;
  currency?: AccountCurrency;
  breakdown?: { label: string; amount: number }[];
}

export interface EnvelopeSummary {
  id: EnvelopeId;
  name: string;
  assigned: number;
  spent: number;
  available: number;
  percentage: number;
  byMethod: {
    efectivo: number;
    binance: number;
    bolivares: number;
    custom: Record<CustomAccountId, number>;
  };
}

export interface EnvelopeRolloverConfig {
  id: EnvelopeId | 'fondo_emergencia';
  rolloverRule: RolloverRuleType;
  maxCap: number | null;
}

export interface MonthEndSweepMovement {
  id: string;
  date: string;
  type: InternalTransactionType;
  fromBucket: AssetBucketId;
  toBucket: AssetBucketId;
  amountUsd: number;
  reason: string;
}

export interface MonthEndEnvelopeOutcome {
  id: EnvelopeId | 'fondo_emergencia';
  name: string;
  rolloverRule: RolloverRuleType;
  maxCap: number | null;
  previousBalance: number;
  rolledOverAmount: number;
  sweptOutAmount: number;
  receivedSweepAmount: number;
  newBalance: number;
}

export interface LiveCryptoBalances {
  binanceCryptoUsd?: number;
  binancePaxgUsd?: number;
  walletBtcUsd?: number;
}

export interface ReadyToAssignItem {
  sourceBucket: 'binance_usdt' | 'banco_bolivares' | CustomAccountId;
  label: string;
  paymentMethod: PaymentMethod;
  amountUsd: number;
  amountBs?: number;
}

export interface ReadyToAssignAndRunwaySummary {
  totalReadyToAssignUsd: number;
  items: ReadyToAssignItem[];
  liquidReserveUsd: number;
  monthlyBurnRateUsd: number;
  dailyBurnRateUsd: number;
  runwayDays: number | null;
  runwayMonths: number | null;
}

export interface MonthEndSimulationResult {
  date: string;
  initialPhase: 1 | 2;
  emergencyBefore: number;
  emergencyAfter: number;
  emergencyTarget: number;
  disfruteMaxCap: number;
  totalSwept: number;
  totalSweptToEmergency: number;
  totalSweptToInvestment: number;
  totalRolledOver: number;
  movements: MonthEndSweepMovement[];
  outcomes: MonthEndEnvelopeOutcome[];
}
