import type { CoinHolding } from '../../../shared/types';
import { ENVELOPE_META } from '../data/defaultSeed';
import type {
  AssetBucketId,
  CustomAccount,
  EmergencyGoalConfig,
  EnvelopeId,
  EnvelopeRule,
  EnvelopeSummary,
  FundSummary,
  InstallmentPlan,
  LedgerMovement,
  LiveCryptoBalances,
  ReadyToAssignAndRunwaySummary,
  ReadyToAssignItem,
  RecurringExpense,
} from '../types';

const ENVELOPE_IDS: EnvelopeId[] = [
  'ahorro_inversion',
  'imprescindibles',
  'disfrute',
  'crecimiento_personal',
  'provisiones_anuales',
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

export function formatBs(amount: number): string {
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function calculateDaysLeft(nextDueDate: string): number {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = nextDueDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const targetMidnight = new Date(y, m - 1, d).getTime();
  return Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}

export function advanceDueDate(
  currentIso: string,
  frequency: RecurringExpense['frequency'] | 'semanal',
): string {
  const [y, m, d] = currentIso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (frequency === 'semanal') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'quincenal') {
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
  if ((plan.direction ?? 'receivable') === 'receivable') return 0;
  if (plan.maxCap !== null && plan.paidTotal >= plan.maxCap) return 0;
  if (plan.frequency === 'semanal') return plan.installmentAmount * 2;
  if (plan.frequency === 'mensual') return plan.installmentAmount / 2;
  if (plan.frequency === 'anual') return plan.installmentAmount / 24;
  return plan.installmentAmount;
}

export function getInstallmentArrears(plan: InstallmentPlan): {
  arrearsUsd: number;
  behindPeriods: number;
  expectedTotal: number;
} | null {
  if (!plan.startDate) return null;
  if (plan.maxCap !== null && plan.paidTotal >= plan.maxCap) {
    return { arrearsUsd: 0, behindPeriods: 0, expectedTotal: plan.maxCap };
  }

  const daysSinceStart = Math.max(0, -calculateDaysLeft(plan.startDate));
  const periodDays =
    plan.frequency === 'semanal'
      ? 7
      : plan.frequency === 'quincenal'
        ? 15
        : plan.frequency === 'mensual'
          ? 30
          : 365;
  const elapsedPeriods = Math.floor(daysSinceStart / periodDays);
  const expectedRaw = elapsedPeriods * plan.installmentAmount;
  const expectedTotal =
    plan.maxCap !== null ? Math.min(plan.maxCap, expectedRaw) : expectedRaw;
  const arrearsUsd = Math.max(0, Number((expectedTotal - plan.paidTotal).toFixed(2)));
  const behindPeriods =
    plan.installmentAmount > 0 ? Math.floor(arrearsUsd / plan.installmentAmount) : 0;

  return { arrearsUsd, behindPeriods, expectedTotal: Number(expectedTotal.toFixed(2)) };
}

export function calculateMonthlyEssentials(expenses: RecurringExpense[]): number {
  const total = expenses
    .filter(
      (e) =>
        e.active &&
        (e.envelopeId === 'imprescindibles' || e.envelopeId === 'provisiones_anuales'),
    )
    .reduce((acc, e) => {
      if (e.frequency === 'anual') return acc + e.amountUsd / 12;
      if (e.frequency === 'quincenal') return acc + e.amountUsd * 2;
      return acc + e.amountUsd;
    }, 0);
  return Number(total.toFixed(2));
}

export function calculateEmergencyGoalTarget(
  config: EmergencyGoalConfig,
  expenses: RecurringExpense[],
): {
  targetUsd: number;
  monthlyEssentials: number;
} {
  const monthlyEssentials = calculateMonthlyEssentials(expenses);
  const targetUsd =
    config.mode === 'months_of_essentials'
      ? Number((monthlyEssentials * Math.max(0, config.months)).toFixed(2))
      : Number(Math.max(0, config.customAmount).toFixed(2));
  return { targetUsd, monthlyEssentials };
}

export function calculateEnvelopeSummaries(movements: LedgerMovement[]): EnvelopeSummary[] {
  const totals: Record<
    EnvelopeId,
    {
      assigned: number;
      spent: number;
      byMethod: { efectivo: number; binance: number; bolivares: number };
    }
  > = {
    ahorro_inversion: { assigned: 0, spent: 0, byMethod: { efectivo: 0, binance: 0, bolivares: 0 } },
    imprescindibles: { assigned: 0, spent: 0, byMethod: { efectivo: 0, binance: 0, bolivares: 0 } },
    disfrute: { assigned: 0, spent: 0, byMethod: { efectivo: 0, binance: 0, bolivares: 0 } },
    crecimiento_personal: { assigned: 0, spent: 0, byMethod: { efectivo: 0, binance: 0, bolivares: 0 } },
    provisiones_anuales: { assigned: 0, spent: 0, byMethod: { efectivo: 0, binance: 0, bolivares: 0 } },
  };

  for (const m of movements) {
    if (!ENVELOPE_IDS.includes(m.bucket as EnvelopeId)) continue;
    const envId = m.bucket as EnvelopeId;
    const custody: 'efectivo' | 'binance' | 'bolivares' =
      m.paymentMethod === 'binance_usdt'
        ? 'binance'
        : m.paymentMethod === 'bolivares_pago_movil'
          ? 'bolivares'
          : 'efectivo';

    if (
      m.type === 'Ingreso a Sobre' ||
      m.type === 'Transferencia (Entrada)' ||
      (m.type === 'Ajuste' && m.amountUsd >= 0)
    ) {
      const amt = Math.abs(m.amountUsd);
      totals[envId].assigned += amt;
      totals[envId].byMethod[custody] += amt;
    } else if (m.type === 'Transferencia (Salida)') {
      // Las transferencias/cambios mueven saldo asignado o custodia sin contar como egreso/gasto real
      const amt = Math.abs(m.amountUsd);
      totals[envId].assigned -= amt;
      totals[envId].byMethod[custody] -= amt;
    } else if (OUTFLOW_TYPES.has(m.type) || (m.type === 'Ajuste' && m.amountUsd < 0)) {
      const amt = Math.abs(m.amountUsd);
      totals[envId].spent += amt;
      totals[envId].byMethod[custody] -= amt;
    }
  }

  const totalAssigned = ENVELOPE_IDS.reduce((acc, id) => acc + totals[id].assigned, 0);

  return ENVELOPE_IDS.map((id) => {
    const { assigned, spent, byMethod } = totals[id];
    const available = assigned - spent;
    return {
      id,
      name: ENVELOPE_META[id].name,
      assigned,
      spent,
      available,
      percentage: totalAssigned > 0 ? (assigned / totalAssigned) * 100 : 0,
      byMethod,
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

function sumBolivaresBalance(movements: LedgerMovement[], bcvRate: number | null): {
  balanceBs: number;
  hasBsData: boolean;
} {
  let balanceBs = 0;
  let hasBsData = false;
  for (const m of movements) {
    const isBsBucket =
      m.bucket === 'banco_bolivares' ||
      (ENVELOPE_IDS.includes(m.bucket as EnvelopeId) &&
        m.paymentMethod === 'bolivares_pago_movil');
    if (!isBsBucket) continue;

    hasBsData = true;
    const bsVal =
      typeof m.amountBs === 'number'
        ? Math.abs(m.amountBs)
        : bcvRate && bcvRate > 0
          ? Math.abs(m.amountUsd) * bcvRate
          : 0;

    if (
      m.type === 'Gasto en Efectivo' ||
      m.type === 'Cambio a Bolívares' ||
      m.type === 'Pago de Cuota' ||
      m.type === 'Transferencia (Salida)' ||
      (m.type === 'Ajuste' && m.amountUsd < 0)
    ) {
      balanceBs -= bsVal;
    } else {
      balanceBs += bsVal;
    }
  }
  return { balanceBs, hasBsData };
}

function sumCustomBsBalance(
  movements: LedgerMovement[],
  bucketId: AssetBucketId,
  bcvRate: number | null,
): { balanceBs: number; hasBsData: boolean } {
  let balanceBs = 0;
  let hasBsData = false;
  for (const m of movements) {
    if (m.bucket !== bucketId) continue;
    hasBsData = true;
    const bsVal =
      typeof m.amountBs === 'number'
        ? Math.abs(m.amountBs)
        : bcvRate && bcvRate > 0
          ? Math.abs(m.amountUsd) * bcvRate
          : 0;

    if (
      m.type === 'Gasto en Efectivo' ||
      m.type === 'Cambio a Bolívares' ||
      m.type === 'Pago de Cuota' ||
      m.type === 'Transferencia (Salida)' ||
      (m.type === 'Ajuste' && m.amountUsd < 0)
    ) {
      balanceBs -= bsVal;
    } else {
      balanceBs += bsVal;
    }
  }
  return { balanceBs, hasBsData };
}

export function extractLiveCryptoBalances(holdings: CoinHolding[]): LiveCryptoBalances {
  let cryptoSum = 0;
  let paxgSum = 0;
  let btcSum = 0;
  let hasCrypto = false;
  let hasPaxg = false;
  let hasBtc = false;

  for (const h of holdings) {
    if (h.isStablecoin || h.currentTokens <= 0) continue;
    const ticker = h.ticker.toUpperCase();
    const effectiveUsd = h.currentValue > 0 ? h.currentValue : Math.max(0, h.investedUsd);

    if (ticker === 'BTC') {
      btcSum += effectiveUsd;
      hasBtc = true;
    } else if (ticker === 'PAXG') {
      paxgSum += effectiveUsd;
      hasPaxg = true;
    } else {
      cryptoSum += effectiveUsd;
      hasCrypto = true;
    }
  }

  return {
    binanceCryptoUsd: hasCrypto ? Number(cryptoSum.toFixed(2)) : undefined,
    binancePaxgUsd: hasPaxg ? Number(paxgSum.toFixed(2)) : undefined,
    walletBtcUsd: hasBtc ? Number(btcSum.toFixed(2)) : undefined,
  };
}

export function calculateFundSummaries(
  movements: LedgerMovement[],
  bcvRate: number | null = null,
  customAccounts: CustomAccount[] = [],
  liveCrypto?: LiveCryptoBalances,
): {
  funds: FundSummary[];
  totalNetWorth: number;
  envelopes: EnvelopeSummary[];
} {
  const envelopes = calculateEnvelopeSummaries(movements);
  const efectivoSobres = envelopes.reduce((acc, e) => acc + e.byMethod.efectivo, 0);
  const bolivaresSobres = envelopes.reduce((acc, e) => acc + e.byMethod.bolivares, 0);
  const binanceSobres = envelopes.reduce((acc, e) => acc + e.byMethod.binance, 0);

  const cuentaBolivaresUsdLedger = sumBucketBalance(movements, ['banco_bolivares']) + bolivaresSobres;
  const { balanceBs, hasBsData } = sumBolivaresBalance(movements, bcvRate);
  const cuentaBolivares =
    hasBsData && bcvRate && bcvRate > 0 ? balanceBs / bcvRate : cuentaBolivaresUsdLedger;
  const binanceCryptoBal =
    liveCrypto?.binanceCryptoUsd !== undefined
      ? Number(liveCrypto.binanceCryptoUsd.toFixed(2))
      : sumBucketBalance(movements, ['binance_crypto']);
  const binanceUsdtBal = sumBucketBalance(movements, ['binance_usdt']) + binanceSobres;
  const binancePaxgBal =
    liveCrypto?.binancePaxgUsd !== undefined
      ? Number(liveCrypto.binancePaxgUsd.toFixed(2))
      : sumBucketBalance(movements, ['binance_paxg']);
  const inversionesBinance = binanceCryptoBal + binanceUsdtBal + binancePaxgBal;

  const emergenciaEfectivoBal = sumBucketBalance(movements, ['emergencias']);
  const emergenciaUsdcBal = sumBucketBalance(movements, ['binance_usdc']);
  const fondoEmergencia = emergenciaEfectivoBal + emergenciaUsdcBal;
  const billeteraBtc =
    liveCrypto?.walletBtcUsd !== undefined
      ? Number(liveCrypto.walletBtcUsd.toFixed(2))
      : sumBucketBalance(movements, ['wallet_btc']);

  const rawFunds: Omit<FundSummary, 'percentage'>[] = [
    {
      id: 'efectivo_sobres',
      name: 'Efectivo en Sobres',
      assetType: 'Efectivo Físico USD',
      notes: 'Billetes físicos asignados a sobres',
      balance: efectivoSobres,
    },
    {
      id: 'cuenta_bolivares',
      name: 'Cuenta en Bolívares',
      assetType: 'Banco / Pago Móvil',
      notes: 'Saldo operativo para recargas, parking y pagos en Bs',
      balance: cuentaBolivares,
      balanceBs: hasBsData ? balanceBs : bcvRate && bcvRate > 0 ? cuentaBolivares * bcvRate : 0,
    },
    {
      id: 'inversiones_binance',
      name: 'Inversiones y USDT Binance',
      assetType: 'Binance (Crypto + USDT + PAXG)',
      notes: 'Incluye capital activo y USDT asignado a sobres',
      balance: inversionesBinance,
      breakdown: [
        { label: 'Crypto', amount: binanceCryptoBal },
        { label: 'USDT', amount: binanceUsdtBal },
        { label: 'PAXG', amount: binancePaxgBal },
      ],
    },
    {
      id: 'fondo_emergencia',
      name: 'Fondo de Emergencia',
      assetType: 'Efectivo + Binance USDC',
      notes: 'Reserva de seguridad y estabilidad',
      balance: fondoEmergencia,
      breakdown: [
        { label: 'Efectivo', amount: emergenciaEfectivoBal },
        { label: 'USDC', amount: emergenciaUsdcBal },
      ],
    },
    {
      id: 'billetera_btc',
      name: 'Billetera BTC',
      assetType: 'Trust Wallet / BTC',
      notes: 'Reserva de valor estratégica',
      balance: billeteraBtc,
    },
  ];

  for (const acct of customAccounts) {
    const usdLedger = sumBucketBalance(movements, [acct.id]);
    if (acct.currency === 'VES') {
      const bsInfo = sumCustomBsBalance(movements, acct.id, bcvRate);
      const usdVal =
        bsInfo.hasBsData && bcvRate && bcvRate > 0 ? bsInfo.balanceBs / bcvRate : usdLedger;
      rawFunds.push({
        id: acct.id,
        name: acct.name,
        assetType: acct.subtitle || 'Cuenta en Bolívares',
        notes: acct.subtitle || 'Cuenta personalizada en Bs',
        balance: usdVal,
        balanceBs: bsInfo.hasBsData
          ? bsInfo.balanceBs
          : bcvRate && bcvRate > 0
            ? usdVal * bcvRate
            : 0,
        isCustom: true,
        currency: 'VES',
      });
    } else {
      rawFunds.push({
        id: acct.id,
        name: acct.name,
        assetType: acct.subtitle || 'Cuenta en Dólares (USD)',
        notes: acct.subtitle || 'Cuenta personalizada en USD',
        balance: usdLedger,
        isCustom: true,
        currency: 'USD',
      });
    }
  }

  const totalNetWorth = rawFunds.reduce((acc, f) => acc + f.balance, 0);

  const funds: FundSummary[] = rawFunds.map((f) => ({
    ...f,
    percentage: totalNetWorth > 0 ? (f.balance / totalNetWorth) * 100 : 0,
  }));

  return { funds, totalNetWorth, envelopes };
}

export interface QuincenaPreview {
  grossAmount: number;
  monthlyExpensesProvision: number;
  annualExpensesProvision: number;
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

  const monthlyExpensesProvision = autoProvisionExpenses
    ? expenses
        .filter((e) => e.frequency !== 'anual')
        .reduce((acc, e) => acc + getExpenseBiweeklyQuota(e), 0)
    : 0;

  const annualExpensesProvision = autoProvisionExpenses
    ? expenses
        .filter((e) => e.frequency === 'anual')
        .reduce((acc, e) => acc + getExpenseBiweeklyQuota(e), 0)
    : 0;

  const expensesProvision = monthlyExpensesProvision + annualExpensesProvision;

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
    monthlyExpensesProvision: Number(monthlyExpensesProvision.toFixed(2)),
    annualExpensesProvision: Number(annualExpensesProvision.toFixed(2)),
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

export function calculateReadyToAssignAndRunway(params: {
  movements: LedgerMovement[];
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  bcvRate?: number | null;
  customAccounts?: CustomAccount[];
}): ReadyToAssignAndRunwaySummary {
  const {
    movements,
    expenses,
    installments,
    bcvRate = null,
    customAccounts = [],
  } = params;

  const items: ReadyToAssignItem[] = [];

  const unassignedUsdt = Math.max(
    0,
    Number(sumBucketBalance(movements, ['binance_usdt']).toFixed(2)),
  );
  if (unassignedUsdt > 0.01) {
    items.push({
      sourceBucket: 'binance_usdt',
      label: 'Binance USDT (sin sobre)',
      paymentMethod: 'binance_usdt',
      amountUsd: unassignedUsdt,
    });
  }

  const bsInfo = sumCustomBsBalance(movements, 'banco_bolivares', bcvRate);
  const usdLedgerBs = sumBucketBalance(movements, ['banco_bolivares']);
  const unassignedBsUsdRaw =
    bsInfo.hasBsData && bcvRate && bcvRate > 0 ? bsInfo.balanceBs / bcvRate : usdLedgerBs;
  const unassignedBsUsd = Math.max(0, Number(unassignedBsUsdRaw.toFixed(2)));
  const unassignedBsVal = bsInfo.hasBsData
    ? Math.max(0, Number(bsInfo.balanceBs.toFixed(2)))
    : bcvRate && bcvRate > 0
      ? Number((unassignedBsUsd * bcvRate).toFixed(2))
      : undefined;

  if (unassignedBsUsd > 0.01) {
    items.push({
      sourceBucket: 'banco_bolivares',
      label: 'Cuenta en Bolívares (sin sobre)',
      paymentMethod: 'bolivares_pago_movil',
      amountUsd: unassignedBsUsd,
      amountBs: unassignedBsVal,
    });
  }

  const totalReadyToAssignUsd = Number(
    items.reduce((acc, item) => acc + item.amountUsd, 0).toFixed(2),
  );

  // Liquid reserve excludes volatile crypto holdings (binance_crypto, paxg, wallet_btc)
  const { funds, envelopes } = calculateFundSummaries(movements, bcvRate, customAccounts);
  const getFundBal = (id: FundSummary['id']) =>
    Math.max(0, funds.find((f) => f.id === id)?.balance ?? 0);

  const binanceUsdtTotal = Math.max(
    0,
    sumBucketBalance(movements, ['binance_usdt']) +
      envelopes.reduce((acc, e) => acc + e.byMethod.binance, 0),
  );
  const customLiquid = funds
    .filter((f) => f.isCustom)
    .reduce((acc, f) => acc + Math.max(0, f.balance), 0);

  const liquidReserveUsd = Number(
    (
      getFundBal('efectivo_sobres') +
      getFundBal('cuenta_bolivares') +
      getFundBal('fondo_emergencia') +
      binanceUsdtTotal +
      customLiquid
    ).toFixed(2),
  );

  const monthlyEssentials = calculateMonthlyEssentials(expenses);
  const monthlyPayableInstallments = installments.reduce(
    (acc, p) => acc + getInstallmentBiweeklyQuota(p) * 2,
    0,
  );
  const monthlyBurnRateUsd = Number(
    (monthlyEssentials + monthlyPayableInstallments).toFixed(2),
  );
  const dailyBurnRateUsd = Number((monthlyBurnRateUsd / 30).toFixed(2));
  const runwayDays =
    monthlyBurnRateUsd > 0
      ? Math.floor(liquidReserveUsd / (monthlyBurnRateUsd / 30))
      : null;
  const runwayMonths =
    monthlyBurnRateUsd > 0
      ? Number((liquidReserveUsd / monthlyBurnRateUsd).toFixed(1))
      : null;

  return {
    totalReadyToAssignUsd,
    items,
    liquidReserveUsd,
    monthlyBurnRateUsd,
    dailyBurnRateUsd,
    runwayDays,
    runwayMonths,
  };
}

/**
 * Eligible liquid capital for tactical crypto dip-buying:
 * exclusively digital Binance USDT inside Ahorro e Inversión envelope + unassigned Binance USDT.
 * Never touches physical USD cash, Emergency Fund, Bolivares, or other envelopes.
 */
export function calculateEligibleInvestmentCapital(movements: LedgerMovement[]): {
  ahorroEnvelopeUsd: number;
  unassignedUsdtUsd: number;
  totalEligibleUsd: number;
  excludedPhysicalCashUsd: number;
} {
  const envelopes = calculateEnvelopeSummaries(movements);
  const ahorroEnv = envelopes.find((e) => e.id === 'ahorro_inversion');
  const ahorroEnvelopeUsd = Math.max(
    0,
    Number((ahorroEnv?.byMethod.binance ?? 0).toFixed(2)),
  );
  const excludedPhysicalCashUsd = Math.max(
    0,
    Number((ahorroEnv?.byMethod.efectivo ?? 0).toFixed(2)),
  );
  const unassignedUsdtUsd = Math.max(
    0,
    Number(sumBucketBalance(movements, ['binance_usdt']).toFixed(2)),
  );
  const totalEligibleUsd = Number((ahorroEnvelopeUsd + unassignedUsdtUsd).toFixed(2));
  return {
    ahorroEnvelopeUsd,
    unassignedUsdtUsd,
    totalEligibleUsd,
    excludedPhysicalCashUsd,
  };
}
