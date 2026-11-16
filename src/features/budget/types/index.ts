export type CustomAccountId = `acct_${string}`;
export type AccountCurrency = 'USD' | 'VES';

export interface CustomAccount {
  id: CustomAccountId;
  name: string;
  currency: AccountCurrency;
  subtitle?: string;
  createdAt: string;
}

export type FundId =
  | 'efectivo_sobres'
  | 'cuenta_bolivares'
  | 'inversiones_binance'
  | 'fondo_emergencia'
  | 'billetera_btc'
  | CustomAccountId;

export type EnvelopeId =
  | 'ahorro_inversion'
  | 'imprescindibles'
  | 'disfrute'
  | 'crecimiento_personal';

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

export type PaymentMethod =
  | 'efectivo_usd'
  | 'binance_usdt'
  | 'bolivares_pago_movil'
  | 'otro';

export type MovementType =
  | 'Ingreso a Sobre'
  | 'Gasto en Efectivo'
  | 'Cambio a Bolívares'
  | 'Barrido a Inversión'
  | 'Pago de Cuota'
  | 'Transferencia (Salida)'
  | 'Transferencia (Entrada)'
  | 'Ajuste';

export interface LedgerMovement {
  id: string;
  date: string; // YYYY-MM-DD
  bucket: AssetBucketId;
  type: MovementType;
  amountUsd: number;
  amountBs?: number;
  bcvRateUsed?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
  quincenaId?: string;
  linkedExpense?: {
    id: string;
    previousDueDate: string;
  };
  linkedInstallment?: {
    id: string;
    amount: number;
    previousDueDate?: string;
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
  active: boolean;
}

export type InstallmentFrequency = 'semanal' | 'quincenal' | 'mensual' | 'anual';
export type InstallmentDirection = 'receivable' | 'payable';

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
  quincenaConfig: QuincenaConfig;
  customAccounts?: CustomAccount[];
  emergencyGoal?: EmergencyGoalConfig;
}

export interface FundSummary {
  id: FundId;
  name: string;
  assetType: string;
  notes: string;
  balance: number;
  balanceBs?: number;
  percentage: number;
  isCustom?: boolean;
  currency?: AccountCurrency;
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
  };
}
