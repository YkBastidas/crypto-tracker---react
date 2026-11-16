import { ENVELOPE_META } from '../data/defaultSeed';
import type {
  AssetBucketId,
  EnvelopeId,
  EnvelopeRule,
  EnvelopeSummary,
  FundSummary,
  InstallmentPlan,
  LedgerMovement,
  RecurringExpense,
} from '../types';

const ENVELOPE_IDS: EnvelopeId[] = [
  'ahorro_inversion',
  'imprescindibles',
  'disfrute',
  'crecimiento_personal',
];

const OUTFLOW_TYPES = new Set([
  'Gasto en Efectivo',
  'Cambio a Bolívares',
  'Barrido a Inversión',
  'Pago de Cuota',
  'Transferencia (Salida)',
]);

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function calculateDaysLeft(nextDueDate: string): number {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = nextDueDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const targetMidnight = new Date(y, m - 1, d).getTime();
  return Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}

export function advanceDueDate(currentIso: string, frequency: RecurringExpense['frequency']): string {
  const [y, m, d] = currentIso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (frequency === 'quincenal') {
    date.setDate(date.getDate() + 15);
  } else if (frequency === 'mensual') {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setFullYear(date.getFullYear() + 1);
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getExpenseBiweeklyQuota(expense: RecurringExpense): number {
  if (!expense.active) return 0;
  if (expense.frequency === 'anual') return expense.amountUsd / 24;
  if (expense.frequency === 'mensual') return expense.amountUsd / 2;
  return expense.amountUsd;
}

export function getInstallmentBiweeklyQuota(plan: InstallmentPlan): number {
  if (plan.maxCap !== null && plan.paidTotal >= plan.maxCap) return 0;
  if (plan.frequency === 'semanal') return plan.installmentAmount * 2;
  if (plan.frequency === 'mensual') return plan.installmentAmount / 2;
  return plan.installmentAmount;
}

export function calculateEnvelopeSummaries(movements: LedgerMovement[]): EnvelopeSummary[] {
  const totals: Record<EnvelopeId, { assigned: number; spent: number }> = {
    ahorro_inversion: { assigned: 0, spent: 0 },
    imprescindibles: { assigned: 0, spent: 0 },
    disfrute: { assigned: 0, spent: 0 },
    crecimiento_personal: { assigned: 0, spent: 0 },
  };

  for (const m of movements) {
    if (!ENVELOPE_IDS.includes(m.bucket as EnvelopeId)) continue;
    const envId = m.bucket as EnvelopeId;
    if (
      m.type === 'Ingreso a Sobre' ||
      m.type === 'Transferencia (Entrada)' ||
      (m.type === 'Ajuste' && m.amountUsd >= 0)
    ) {
      totals[envId].assigned += Math.abs(m.amountUsd);
    } else if (OUTFLOW_TYPES.has(m.type) || (m.type === 'Ajuste' && m.amountUsd < 0)) {
      totals[envId].spent += Math.abs(m.amountUsd);
    }
  }

  const totalAssigned = ENVELOPE_IDS.reduce((acc, id) => acc + totals[id].assigned, 0);

  return ENVELOPE_IDS.map((id) => {
    const { assigned, spent } = totals[id];
    const available = assigned - spent;
    return {
      id,
      name: ENVELOPE_META[id].name,
      assigned,
      spent,
      available,
      percentage: totalAssigned > 0 ? (assigned / totalAssigned) * 100 : 0,
    };
  });
}

function sumBucketBalance(movements: LedgerMovement[], buckets: AssetBucketId[]): number {
  const set = new Set(buckets);
  let total = 0;
  for (const m of movements) {
    if (!set.has(m.bucket)) continue;
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
  return total;
}

export function calculateFundSummaries(movements: LedgerMovement[]): {
  funds: FundSummary[];
  totalNetWorth: number;
  envelopes: EnvelopeSummary[];
} {
  const envelopes = calculateEnvelopeSummaries(movements);
  const efectivoSobres = envelopes.reduce((acc, e) => acc + e.available, 0);
  const inversionesBinance = sumBucketBalance(movements, [
    'binance_crypto',
    'binance_usdt',
    'binance_paxg',
  ]);
  const fondoEmergencia = sumBucketBalance(movements, ['emergencias', 'binance_usdc']);
  const billeteraBtc = sumBucketBalance(movements, ['wallet_btc']);

  const rawFunds: Omit<FundSummary, 'percentage'>[] = [
    {
      id: 'efectivo_sobres',
      name: 'Efectivo en Sobres',
      assetType: 'Efectivo Físico',
      notes: 'Presupuesto quincenal operativo en sobres',
      balance: efectivoSobres,
    },
    {
      id: 'inversiones_binance',
      name: 'Inversiones Binance',
      assetType: 'Binance (Crypto + USDT + PAXG)',
      notes: 'Capital activo de inversión y liquidez',
      balance: inversionesBinance,
    },
    {
      id: 'fondo_emergencia',
      name: 'Fondo de Emergencia',
      assetType: 'Efectivo + Binance USDC',
      notes: 'Reserva de seguridad y estabilidad',
      balance: fondoEmergencia,
    },
    {
      id: 'billetera_btc',
      name: 'Billetera BTC',
      assetType: 'Trust Wallet / BTC',
      notes: 'Reserva de valor estratégica',
      balance: billeteraBtc,
    },
  ];

  const totalNetWorth = rawFunds.reduce((acc, f) => acc + f.balance, 0);

  const funds: FundSummary[] = rawFunds.map((f) => ({
    ...f,
    percentage: totalNetWorth > 0 ? (f.balance / totalNetWorth) * 100 : 0,
  }));

  return { funds, totalNetWorth, envelopes };
}

export interface QuincenaPreview {
  grossAmount: number;
  expensesProvision: number;
  installmentsProvision: number;
  totalProvision: number;
  distributableAmount: number;
  envelopeAllocations: {
    envelopeId: EnvelopeId;
    name: string;
    amountUsd: number;
    shareOfGross: number;
  }[];
  totalAssignedToEnvelopes: number;
  unallocated: number;
  isOverAllocated: boolean;
}

export function computeQuincenaPreview(params: {
  grossAmount: number;
  rules: EnvelopeRule[];
  autoProvisionExpenses: boolean;
  autoProvisionInstallments: boolean;
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
}): QuincenaPreview {
  const {
    grossAmount,
    rules,
    autoProvisionExpenses,
    autoProvisionInstallments,
    expenses,
    installments,
  } = params;

  const expensesProvision = autoProvisionExpenses
    ? expenses.reduce((acc, e) => acc + getExpenseBiweeklyQuota(e), 0)
    : 0;

  const installmentsProvision = autoProvisionInstallments
    ? installments.reduce((acc, p) => acc + getInstallmentBiweeklyQuota(p), 0)
    : 0;

  const totalProvision = Number((expensesProvision + installmentsProvision).toFixed(2));
  const distributableAmount = Math.max(0, Number((grossAmount - totalProvision).toFixed(2)));

  const fixedSum = rules
    .filter((r) => r.mode === 'fixed')
    .reduce((acc, r) => acc + Math.max(0, r.value), 0);

  const remainingForPercent = Math.max(0, distributableAmount - fixedSum);

  const envelopeAllocations = rules.map((rule) => {
    const rawAmount =
      rule.mode === 'fixed'
        ? Math.max(0, rule.value)
        : (remainingForPercent * Math.max(0, rule.value)) / 100;
    const amountUsd = Number(rawAmount.toFixed(2));
    return {
      envelopeId: rule.envelopeId,
      name: ENVELOPE_META[rule.envelopeId].name,
      amountUsd,
      shareOfGross: grossAmount > 0 ? (amountUsd / grossAmount) * 100 : 0,
    };
  });

  const totalAssignedToEnvelopes = Number(
    envelopeAllocations.reduce((acc, a) => acc + a.amountUsd, 0).toFixed(2),
  );
  const totalCommitted = Number((totalProvision + totalAssignedToEnvelopes).toFixed(2));
  const unallocated = Number((grossAmount - totalCommitted).toFixed(2));

  return {
    grossAmount,
    expensesProvision: Number(expensesProvision.toFixed(2)),
    installmentsProvision: Number(installmentsProvision.toFixed(2)),
    totalProvision,
    distributableAmount,
    envelopeAllocations,
    totalAssignedToEnvelopes,
    unallocated,
    isOverAllocated: unallocated < -0.01,
  };
}
