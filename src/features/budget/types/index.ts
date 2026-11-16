export type FundId =
  | 'efectivo_sobres'
  | 'inversiones_binance'
  | 'fondo_emergencia'
  | 'billetera_btc';

export type EnvelopeId =
  | 'ahorro_inversion'
  | 'imprescindibles'
  | 'disfrute'
  | 'crecimiento_personal';

export type AssetBucketId =
  | EnvelopeId
  | 'emergencias'
  | 'binance_crypto'
  | 'binance_usdt'
  | 'binance_paxg'
  | 'binance_usdc'
  | 'wallet_btc';

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
  paymentMethod?: PaymentMethod;
  notes?: string;
  quincenaId?: string;
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

export type InstallmentFrequency = 'semanal' | 'quincenal' | 'mensual';

export interface InstallmentPlan {
  id: string;
  name: string;
  installmentAmount: number;
  frequency: InstallmentFrequency;
  maxCap: number | null; // null = sin tope (ej. suscripción compartida)
  paidTotal: number;
  paymentsCount: number;
  lastPaidDate?: string;
  notes?: string;
}

export interface BudgetSnapshot {
  version: number;
  exportedAt: string;
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  quincenaConfig: QuincenaConfig;
}

export interface FundSummary {
  id: FundId;
  name: string;
  assetType: string;
  notes: string;
  balance: number;
  percentage: number;
}

export interface EnvelopeSummary {
  id: EnvelopeId;
  name: string;
  assigned: number;
  spent: number;
  available: number;
  percentage: number;
}
