import type { CoinHolding } from '../../../shared/types';
import { ENVELOPE_META, PAYMENT_METHOD_LABELS } from '../data/defaultSeed';
import type {
  AccountCurrency,
  AssetBucketId,
  BuiltinFundId,
  CustomAccount,
  CustomAccountId,
  EmergencyGoalConfig,
  EnvelopeId,
  EnvelopeRule,
  EnvelopeSummary,
  FundSummary,
  InstallmentPaymentRecord,
  InstallmentPlan,
  LedgerMovement,
  LiveCryptoBalances,
  NativeAccountOverrides,
  PaymentMethod,
  ReadyToAssignAndRunwaySummary,
  ReadyToAssignItem,
  RecurringExpense,
} from '../types';

export const DEFAULT_NATIVE_FUND_META: Record<
  BuiltinFundId,
  { name: string; assetType: string; notes: string }
> = {
  efectivo_sobres: {
    name: 'Efectivo en Sobres',
    assetType: 'Efectivo Físico USD',
    notes: 'Billetes físicos asignados a sobres',
  },
  cuenta_bolivares: {
    name: 'Cuenta en Bolívares',
    assetType: 'Banco / Pago Móvil',
    notes: 'Saldo operativo para recargas, parking y pagos en Bs',
  },
  inversiones_binance: {
    name: 'Inversiones y USDT Binance',
    assetType: 'Binance (Crypto + USDT + PAXG)',
    notes: 'Incluye capital activo y USDT asignado a sobres',
  },
  fondo_emergencia: {
    name: 'Fondo de Emergencia',
    assetType: 'Efectivo + Binance USDC',
    notes: 'Reserva de seguridad y estabilidad',
  },
  billetera_btc: {
    name: 'Billetera BTC',
    assetType: 'Trust Wallet / BTC',
    notes: 'Reserva de valor estratégica',
  },
};

export interface CustodyOption {
  id: PaymentMethod;
  label: string;
  shortLabel: string;
  currency: AccountCurrency;
  isCustom: boolean;
}

export function isCustomAccountId(value: string | undefined | null): value is CustomAccountId {
  return typeof value === 'string' && value.startsWith('acct_');
}

export function isBsPaymentMethod(
  method: PaymentMethod | undefined,
  customAccounts: CustomAccount[] = [],
): boolean {
  if (method === 'bolivares_pago_movil') return true;
  if (isCustomAccountId(method)) {
    return customAccounts.some((a) => a.id === method && a.currency === 'VES');
  }
  return false;
}

export function getPaymentMethodLabel(
  method: PaymentMethod,
  customAccounts: CustomAccount[] = [],
  nativeAccountOverrides?: NativeAccountOverrides,
): string {
  if (isCustomAccountId(method)) {
    const found = customAccounts.find((a) => a.id === method);
    return found ? `${found.name} (${found.currency})` : 'Cuenta personalizada';
  }
  if (method === 'efectivo_usd') {
    const customName = nativeAccountOverrides?.efectivo_sobres?.name?.trim();
    return customName || PAYMENT_METHOD_LABELS.efectivo_usd;
  }
  if (method === 'binance_usdt') {
    const customName = nativeAccountOverrides?.inversiones_binance?.name?.trim();
    return customName || PAYMENT_METHOD_LABELS.binance_usdt;
  }
  if (method === 'bolivares_pago_movil') {
    const customName = nativeAccountOverrides?.cuenta_bolivares?.name?.trim();
    return customName || PAYMENT_METHOD_LABELS.bolivares_pago_movil;
  }
  return PAYMENT_METHOD_LABELS[method] ?? 'Otro';
}

export function getActiveCustodyOptions(
  customAccounts: CustomAccount[] = [],
  nativeAccountOverrides?: NativeAccountOverrides,
  options?: { includeOtro?: boolean; forceInclude?: PaymentMethod },
): CustodyOption[] {
  const result: CustodyOption[] = [];
  const force = options?.forceInclude;

  const efectivoName = nativeAccountOverrides?.efectivo_sobres?.name?.trim();
  if (!nativeAccountOverrides?.efectivo_sobres?.hidden || force === 'efectivo_usd') {
    result.push({
      id: 'efectivo_usd',
      label: efectivoName || PAYMENT_METHOD_LABELS.efectivo_usd,
      shortLabel: efectivoName || 'Efectivo USD',
      currency: 'USD',
      isCustom: false,
    });
  }

  const binanceName = nativeAccountOverrides?.inversiones_binance?.name?.trim();
  if (!nativeAccountOverrides?.inversiones_binance?.hidden || force === 'binance_usdt') {
    result.push({
      id: 'binance_usdt',
      label: binanceName || PAYMENT_METHOD_LABELS.binance_usdt,
      shortLabel: binanceName || 'USDT',
      currency: 'USD',
      isCustom: false,
    });
  }

  const bsName = nativeAccountOverrides?.cuenta_bolivares?.name?.trim();
  if (!nativeAccountOverrides?.cuenta_bolivares?.hidden || force === 'bolivares_pago_movil') {
    result.push({
      id: 'bolivares_pago_movil',
      label: bsName || PAYMENT_METHOD_LABELS.bolivares_pago_movil,
      shortLabel: bsName || 'Bolívares',
      currency: 'VES',
      isCustom: false,
    });
  }

  for (const acct of customAccounts) {
    result.push({
      id: acct.id,
      label: `${acct.name} (${acct.currency})`,
      shortLabel: acct.name,
      currency: acct.currency,
      isCustom: true,
    });
  }

  if (options?.includeOtro !== false || result.length === 0 || force === 'otro') {
    result.push({
      id: 'otro',
      label: PAYMENT_METHOD_LABELS.otro,
      shortLabel: 'Otro',
      currency: 'USD',
      isCustom: false,
    });
  }

  return result;
}

export function getEnvelopeCustodyBalance(
  env: EnvelopeSummary | undefined,
  method: PaymentMethod,
): number {
  if (!env) return 0;
  if (method === 'efectivo_usd') return env.byMethod.efectivo;
  if (method === 'binance_usdt') return env.byMethod.binance;
  if (method === 'bolivares_pago_movil') return env.byMethod.bolivares;
  if (isCustomAccountId(method)) return env.byMethod.custom?.[method] ?? 0;

  const customSum = Object.values(env.byMethod.custom ?? {}).reduce((a, b) => a + b, 0);
  return roundCurrency(
    Math.max(
      0,
      env.available -
        env.byMethod.efectivo -
        env.byMethod.binance -
        env.byMethod.bolivares -
        customSum,
    ),
  );
}

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

/**
 * Determines whether a ledger adjustment represents an outflow/reduction.
 * Supports tiny negative Bolívares adjustments whose USD equivalent rounds to $0.00.
 */
export function isNegativeAdjustmentMovement(
  m: Pick<LedgerMovement, 'type' | 'amountUsd' | 'amountBs'>,
): boolean {
  if (m.type !== 'Ajuste') return false;
  return m.amountUsd < 0 || (typeof m.amountBs === 'number' && m.amountBs < 0);
}

function roundCurrency(val: number): number {
  if (!Number.isFinite(val) || Math.abs(val) < 0.005) return 0;
  const rounded = Number(val.toFixed(2));
  return Object.is(rounded, -0) || Math.abs(rounded) < 0.005 ? 0 : rounded;
}

export function formatUsd(amount: number): string {
  const clean = Math.abs(amount) < 0.005 ? 0 : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(clean);
}

export function formatBs(amount: number): string {
  const clean = Math.abs(amount) < 0.005 ? 0 : amount;
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(clean)}`;
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

function computeEnvelopeSummariesWithBsPool(
  movements: LedgerMovement[],
  options?: { freeBsPoolMode?: boolean },
): {
  envelopes: EnvelopeSummary[];
  absorbedFromUnassignedBsUsd: number;
} {
  const createEmptyMethodTotals = () => ({
    efectivo: 0,
    binance: 0,
    bolivares: 0,
    custom: {} as Record<CustomAccountId, number>,
  });

  const totals: Record<
    EnvelopeId,
    {
      assigned: number;
      spent: number;
      byMethod: {
        efectivo: number;
        binance: number;
        bolivares: number;
        custom: Record<CustomAccountId, number>;
      };
    }
  > = {
    ahorro_inversion: { assigned: 0, spent: 0, byMethod: createEmptyMethodTotals() },
    imprescindibles: { assigned: 0, spent: 0, byMethod: createEmptyMethodTotals() },
    disfrute: { assigned: 0, spent: 0, byMethod: createEmptyMethodTotals() },
    crecimiento_personal: { assigned: 0, spent: 0, byMethod: createEmptyMethodTotals() },
    provisiones_anuales: { assigned: 0, spent: 0, byMethod: createEmptyMethodTotals() },
  };

  for (const m of movements) {
    if (!ENVELOPE_IDS.includes(m.bucket as EnvelopeId)) continue;
    const envId = m.bucket as EnvelopeId;
    const amt = Math.abs(m.amountUsd);

    let deltaSign = 0;
    if (
      m.type === 'Ingreso a Sobre' ||
      m.type === 'Transferencia (Entrada)' ||
      (m.type === 'Ajuste' && !isNegativeAdjustmentMovement(m))
    ) {
      totals[envId].assigned += amt;
      deltaSign = 1;
    } else if (m.type === 'Transferencia (Salida)') {
      // Las transferencias/cambios mueven saldo asignado o custodia sin contar como egreso/gasto real
      totals[envId].assigned -= amt;
      deltaSign = -1;
    } else if (OUTFLOW_TYPES.has(m.type) || isNegativeAdjustmentMovement(m)) {
      totals[envId].spent += amt;
      deltaSign = -1;
    }

    if (deltaSign !== 0) {
      if (isCustomAccountId(m.paymentMethod)) {
        const prev = totals[envId].byMethod.custom[m.paymentMethod] ?? 0;
        totals[envId].byMethod.custom[m.paymentMethod] = prev + deltaSign * amt;
      } else {
        const custody: 'efectivo' | 'binance' | 'bolivares' =
          m.paymentMethod === 'binance_usdt'
            ? 'binance'
            : m.paymentMethod === 'bolivares_pago_movil'
              ? 'bolivares'
              : 'efectivo';
        totals[envId].byMethod[custody] += deltaSign * amt;
      }
    }
  }

  let absorbedFromUnassignedBsUsd = 0;

  // Shared free Bs float mode: absorb negative Bs custody on envelopes using free banco_bolivares first,
  // then surplus Bs remaining in other envelopes so total Net Worth & total Bs stay invariant
  if (options?.freeBsPoolMode) {
    let unassignedBsAvail = Math.max(0, sumBucketBalance(movements, ['banco_bolivares']));

    for (const envId of ENVELOPE_IDS) {
      if (totals[envId].byMethod.bolivares >= -0.001) continue;
      let deficit = -totals[envId].byMethod.bolivares;

      if (unassignedBsAvail > 0) {
        const takeUnassigned = Math.min(deficit, unassignedBsAvail);
        unassignedBsAvail -= takeUnassigned;
        absorbedFromUnassignedBsUsd += takeUnassigned;
        totals[envId].byMethod.bolivares += takeUnassigned;
        totals[envId].spent = Math.max(0, totals[envId].spent - takeUnassigned);
        deficit -= takeUnassigned;
      }

      if (deficit > 0.001) {
        for (const donorId of ENVELOPE_IDS) {
          if (donorId === envId || deficit <= 0.001) continue;
          const donorAvail = Math.max(0, totals[donorId].byMethod.bolivares);
          if (donorAvail <= 0.001) continue;
          const takeDonor = Math.min(deficit, donorAvail);
          totals[donorId].byMethod.bolivares -= takeDonor;
          totals[donorId].spent += takeDonor;
          totals[envId].byMethod.bolivares += takeDonor;
          totals[envId].spent = Math.max(0, totals[envId].spent - takeDonor);
          deficit -= takeDonor;
        }
      }
    }
  }

  const totalAssigned = ENVELOPE_IDS.reduce((acc, id) => acc + totals[id].assigned, 0);

  const envelopes = ENVELOPE_IDS.map((id) => {
    const rawAssigned = totals[id].assigned;
    const rawSpent = totals[id].spent;
    const rawAvailable = rawAssigned - rawSpent;
    const { efectivo, binance, bolivares, custom } = totals[id].byMethod;

    const cleanCustom: Record<CustomAccountId, number> = {};
    for (const [acctId, val] of Object.entries(custom)) {
      const rounded = roundCurrency(val);
      if (rounded !== 0) {
        cleanCustom[acctId as CustomAccountId] = rounded;
      }
    }

    return {
      id,
      name: ENVELOPE_META[id].name,
      assigned: roundCurrency(rawAssigned),
      spent: roundCurrency(rawSpent),
      available: roundCurrency(rawAvailable),
      percentage: totalAssigned > 0 ? (rawAssigned / totalAssigned) * 100 : 0,
      byMethod: {
        efectivo: roundCurrency(efectivo),
        binance: roundCurrency(binance),
        bolivares: roundCurrency(bolivares),
        custom: cleanCustom,
      },
    };
  });

  return { envelopes, absorbedFromUnassignedBsUsd };
}

export function calculateEnvelopeSummaries(
  movements: LedgerMovement[],
  options?: { freeBsPoolMode?: boolean },
): EnvelopeSummary[] {
  return computeEnvelopeSummariesWithBsPool(movements, options).envelopes;
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
  return roundCurrency(total);
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
      isNegativeAdjustmentMovement(m)
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
  includeEnvelopeCustody = false,
): { balanceBs: number; hasBsData: boolean } {
  let balanceBs = 0;
  let hasBsData = false;
  for (const m of movements) {
    const matchesDirect = m.bucket === bucketId;
    const matchesEnvelopeCustody =
      includeEnvelopeCustody &&
      ENVELOPE_IDS.includes(m.bucket as EnvelopeId) &&
      m.paymentMethod === bucketId;
    if (!matchesDirect && !matchesEnvelopeCustody) continue;
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
      isNegativeAdjustmentMovement(m)
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
  options?: {
    freeBsPoolMode?: boolean;
    nativeAccountOverrides?: NativeAccountOverrides;
  },
): {
  funds: FundSummary[];
  totalNetWorth: number;
  envelopes: EnvelopeSummary[];
} {
  const { envelopes, absorbedFromUnassignedBsUsd } = computeEnvelopeSummariesWithBsPool(
    movements,
    options,
  );
  const overrides = options?.nativeAccountOverrides ?? {};
  const efectivoSobres = envelopes.reduce((acc, e) => acc + e.byMethod.efectivo, 0);
  const bolivaresSobres = envelopes.reduce((acc, e) => acc + e.byMethod.bolivares, 0);
  const binanceSobres = envelopes.reduce((acc, e) => acc + e.byMethod.binance, 0);

  const cuentaBolivaresUsdLedger =
    sumBucketBalance(movements, ['banco_bolivares']) -
    absorbedFromUnassignedBsUsd +
    bolivaresSobres;
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

  const applyOverride = (
    id: BuiltinFundId,
    base: Omit<FundSummary, 'id' | 'percentage'>,
  ): Omit<FundSummary, 'percentage'> => {
    const def = DEFAULT_NATIVE_FUND_META[id];
    const patch = overrides[id];
    return {
      id,
      ...base,
      name: patch?.name?.trim() || def.name,
      assetType: patch?.assetType?.trim() || def.assetType,
      notes: patch?.notes?.trim() || def.notes,
      defaultName: def.name,
      defaultAssetType: def.assetType,
      hidden: Boolean(patch?.hidden),
    };
  };

  const rawFunds: Omit<FundSummary, 'percentage'>[] = [
    applyOverride('efectivo_sobres', {
      name: DEFAULT_NATIVE_FUND_META.efectivo_sobres.name,
      assetType: DEFAULT_NATIVE_FUND_META.efectivo_sobres.assetType,
      notes: DEFAULT_NATIVE_FUND_META.efectivo_sobres.notes,
      balance: efectivoSobres,
    }),
    applyOverride('cuenta_bolivares', {
      name: DEFAULT_NATIVE_FUND_META.cuenta_bolivares.name,
      assetType: DEFAULT_NATIVE_FUND_META.cuenta_bolivares.assetType,
      notes: DEFAULT_NATIVE_FUND_META.cuenta_bolivares.notes,
      balance: cuentaBolivares,
      balanceBs: hasBsData ? balanceBs : bcvRate && bcvRate > 0 ? cuentaBolivares * bcvRate : 0,
    }),
    applyOverride('inversiones_binance', {
      name: DEFAULT_NATIVE_FUND_META.inversiones_binance.name,
      assetType: DEFAULT_NATIVE_FUND_META.inversiones_binance.assetType,
      notes: DEFAULT_NATIVE_FUND_META.inversiones_binance.notes,
      balance: inversionesBinance,
      breakdown: [
        { label: 'Crypto', amount: binanceCryptoBal },
        { label: 'USDT', amount: binanceUsdtBal },
        { label: 'PAXG', amount: binancePaxgBal },
      ],
    }),
    applyOverride('fondo_emergencia', {
      name: DEFAULT_NATIVE_FUND_META.fondo_emergencia.name,
      assetType: DEFAULT_NATIVE_FUND_META.fondo_emergencia.assetType,
      notes: DEFAULT_NATIVE_FUND_META.fondo_emergencia.notes,
      balance: fondoEmergencia,
      breakdown: [
        { label: 'Efectivo', amount: emergenciaEfectivoBal },
        { label: 'USDC', amount: emergenciaUsdcBal },
      ],
    }),
    applyOverride('billetera_btc', {
      name: DEFAULT_NATIVE_FUND_META.billetera_btc.name,
      assetType: DEFAULT_NATIVE_FUND_META.billetera_btc.assetType,
      notes: DEFAULT_NATIVE_FUND_META.billetera_btc.notes,
      balance: billeteraBtc,
    }),
  ];

  for (const acct of customAccounts) {
    const usdLedger = sumBucketBalance(movements, [acct.id]);
    const customEnvelopeUsd = envelopes.reduce(
      (acc, e) => acc + (e.byMethod.custom?.[acct.id] ?? 0),
      0,
    );
    if (acct.currency === 'VES') {
      const bsInfo = sumCustomBsBalance(movements, acct.id, bcvRate, true);
      const usdVal =
        bsInfo.hasBsData && bcvRate && bcvRate > 0
          ? roundCurrency(bsInfo.balanceBs / bcvRate)
          : roundCurrency(usdLedger + customEnvelopeUsd);
      rawFunds.push({
        id: acct.id,
        name: acct.name,
        assetType: acct.subtitle || 'Cuenta en Bolívares',
        notes: acct.subtitle || 'Cuenta personalizada en Bs',
        balance: usdVal,
        balanceBs: bsInfo.hasBsData
          ? roundCurrency(bsInfo.balanceBs)
          : bcvRate && bcvRate > 0
            ? roundCurrency(usdVal * bcvRate)
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
        balance: roundCurrency(usdLedger + customEnvelopeUsd),
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
  freeBsPoolMode?: boolean;
  nativeAccountOverrides?: NativeAccountOverrides;
}): ReadyToAssignAndRunwaySummary {
  const {
    movements,
    expenses,
    installments,
    bcvRate = null,
    customAccounts = [],
    freeBsPoolMode = false,
    nativeAccountOverrides,
  } = params;

  const items: ReadyToAssignItem[] = [];

  const unassignedUsdt = Math.max(
    0,
    Number(sumBucketBalance(movements, ['binance_usdt']).toFixed(2)),
  );
  if (unassignedUsdt > 0.01) {
    const binanceCustomName = nativeAccountOverrides?.inversiones_binance?.name?.trim();
    items.push({
      sourceBucket: 'binance_usdt',
      label: binanceCustomName ? `${binanceCustomName} USDT (sin sobre)` : 'Binance USDT (sin sobre)',
      paymentMethod: 'binance_usdt',
      amountUsd: unassignedUsdt,
    });
  }

  const bsInfo = sumCustomBsBalance(movements, 'banco_bolivares', bcvRate, false);
  const usdLedgerBs = sumBucketBalance(movements, ['banco_bolivares']);
  const unassignedBsUsdRaw =
    bsInfo.hasBsData && bcvRate && bcvRate > 0 ? bsInfo.balanceBs / bcvRate : usdLedgerBs;
  const unassignedBsUsd = Math.max(0, Number(unassignedBsUsdRaw.toFixed(2)));
  const unassignedBsVal = bsInfo.hasBsData
    ? Math.max(0, Number(bsInfo.balanceBs.toFixed(2)))
    : bcvRate && bcvRate > 0
      ? Number((unassignedBsUsd * bcvRate).toFixed(2))
      : undefined;

  if (!freeBsPoolMode && unassignedBsUsd > 0.01) {
    const bsCustomName = nativeAccountOverrides?.cuenta_bolivares?.name?.trim();
    items.push({
      sourceBucket: 'banco_bolivares',
      label: bsCustomName ? `${bsCustomName} (sin sobre)` : 'Cuenta en Bolívares (sin sobre)',
      paymentMethod: 'bolivares_pago_movil',
      amountUsd: unassignedBsUsd,
      amountBs: unassignedBsVal,
    });
  }

  for (const acct of customAccounts) {
    const directUsdLedger = sumBucketBalance(movements, [acct.id]);
    if (acct.currency === 'VES') {
      const acctBsInfo = sumCustomBsBalance(movements, acct.id, bcvRate, false);
      const rawUsd =
        acctBsInfo.hasBsData && bcvRate && bcvRate > 0
          ? acctBsInfo.balanceBs / bcvRate
          : directUsdLedger;
      const cleanUsd = Math.max(0, roundCurrency(rawUsd));
      const cleanBs = acctBsInfo.hasBsData
        ? Math.max(0, roundCurrency(acctBsInfo.balanceBs))
        : bcvRate && bcvRate > 0
          ? roundCurrency(cleanUsd * bcvRate)
          : undefined;
      if (cleanUsd > 0.01) {
        items.push({
          sourceBucket: acct.id,
          label: `${acct.name} (sin sobre)`,
          paymentMethod: acct.id,
          amountUsd: cleanUsd,
          amountBs: cleanBs,
        });
      }
    } else {
      const cleanUsd = Math.max(0, roundCurrency(directUsdLedger));
      if (cleanUsd > 0.01) {
        items.push({
          sourceBucket: acct.id,
          label: `${acct.name} (sin sobre)`,
          paymentMethod: acct.id,
          amountUsd: cleanUsd,
        });
      }
    }
  }

  const totalReadyToAssignUsd = Number(
    items.reduce((acc, item) => acc + item.amountUsd, 0).toFixed(2),
  );

  // Liquid reserve excludes volatile crypto holdings (binance_crypto, paxg, wallet_btc)
  const { funds, envelopes } = calculateFundSummaries(
    movements,
    bcvRate,
    customAccounts,
    undefined,
    { freeBsPoolMode, nativeAccountOverrides },
  );
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

export interface ResolvedInstallmentPayment extends InstallmentPaymentRecord {
  source: 'plan' | 'legacy_ledger';
}

export interface InstallmentHistorySummary {
  records: ResolvedInstallmentPayment[];
  loggedTotalUsd: number;
  unloggedTotalUsd: number;
  unloggedCount: number;
  inKindTotalUsd: number;
  historicalTotalUsd: number;
  monetaryTotalUsd: number;
}

export function getInstallmentPaymentHistory(
  plan: InstallmentPlan,
  movements: LedgerMovement[],
): InstallmentHistorySummary {
  const planRecords: ResolvedInstallmentPayment[] = (plan.paymentHistory ?? []).map((r) => ({
    ...r,
    source: 'plan' as const,
  }));

  const linkedMovIds = new Set(
    planRecords.map((r) => r.linkedMovementId).filter((id): id is string => Boolean(id)),
  );
  const knownPaymentIds = new Set(planRecords.map((r) => r.id));

  const legacyRecords: ResolvedInstallmentPayment[] = [];
  for (const m of movements) {
    const link = m.linkedInstallment;
    if (!link || link.id !== plan.id) continue;
    if (linkedMovIds.has(m.id)) continue;
    if (link.paymentId && knownPaymentIds.has(link.paymentId)) continue;

    legacyRecords.push({
      id: m.id,
      date: m.date,
      amountUsd: roundCurrency(Math.abs(link.amount ?? m.amountUsd)),
      settlementKind: 'monetary',
      notes: link.note?.trim() || undefined,
      envelopeId: ENVELOPE_IDS.includes(m.bucket as EnvelopeId)
        ? (m.bucket as EnvelopeId)
        : undefined,
      paymentMethod: m.paymentMethod,
      amountBs: m.amountBs,
      bcvRateUsed: m.bcvRateUsed,
      linkedMovementId: m.id,
      previousDueDate: link.previousDueDate,
      source: 'legacy_ledger',
    });
  }

  const records = [...planRecords, ...legacyRecords].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const inKindTotalUsd = roundCurrency(
    records
      .filter((r) => r.settlementKind === 'in_kind')
      .reduce((acc, r) => acc + r.amountUsd, 0),
  );
  const historicalTotalUsd = roundCurrency(
    records
      .filter((r) => r.settlementKind === 'historical')
      .reduce((acc, r) => acc + r.amountUsd, 0),
  );
  const monetaryTotalUsd = roundCurrency(
    records
      .filter((r) => r.settlementKind !== 'in_kind' && r.settlementKind !== 'historical')
      .reduce((acc, r) => acc + r.amountUsd, 0),
  );
  const loggedTotalUsd = roundCurrency(monetaryTotalUsd + inKindTotalUsd + historicalTotalUsd);
  const unloggedTotalUsd = roundCurrency(Math.max(0, plan.paidTotal - loggedTotalUsd));
  const unloggedCount = Math.max(0, plan.paymentsCount - records.length);

  return {
    records,
    loggedTotalUsd,
    unloggedTotalUsd,
    unloggedCount,
    inKindTotalUsd,
    historicalTotalUsd,
    monetaryTotalUsd,
  };
}
