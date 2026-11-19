import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  MinusCircle,
  PlusCircle,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { ENVELOPE_META, PAYMENT_METHOD_LABELS } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type {
  AssetBucketId,
  CustomAccount,
  EnvelopeId,
  MovementType,
  PaymentMethod,
} from '../types';
import {
  calculateEnvelopeSummaries,
  calculateFundSummaries,
  formatBs,
  formatUsd,
} from '../utils/calculations';

const ENVELOPE_IDS = Object.keys(ENVELOPE_META) as EnvelopeId[];

export type QuickModalTab = 'movement' | 'transfer';
export type MovementDirection = 'out' | 'in' | 'set_balance';

interface QuickMovementModalProps {
  isOpen: boolean;
  initialBucket?: AssetBucketId;
  initialTab?: QuickModalTab;
  initialDirection?: MovementDirection;
  onClose: () => void;
}

const ENVELOPE_SET = new Set<AssetBucketId>([
  'ahorro_inversion',
  'imprescindibles',
  'disfrute',
  'crecimiento_personal',
  'provisiones_anuales',
]);

function getEnvelopeMethodBalance(
  byMethod: { efectivo: number; binance: number; bolivares: number },
  totalBalance: number,
  method: PaymentMethod,
): number {
  if (method === 'efectivo_usd') return byMethod.efectivo;
  if (method === 'binance_usdt') return byMethod.binance;
  if (method === 'bolivares_pago_movil') return byMethod.bolivares;
  return Math.max(0, totalBalance - byMethod.efectivo - byMethod.binance - byMethod.bolivares);
}

function isUsdtCustodyHolder(bucket: AssetBucketId, method: PaymentMethod): boolean {
  return bucket === 'binance_usdt' || (ENVELOPE_SET.has(bucket) && method === 'binance_usdt');
}

function buildPortfolioDateStr(dateIso: string): string {
  const now = new Date();
  const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return `${dateIso} ${timePart}`;
}

const INVESTMENT_BUCKETS = new Set<AssetBucketId>([
  'binance_usdt',
  'binance_crypto',
  'binance_paxg',
  'binance_usdc',
  'wallet_btc',
]);

const BUCKET_OPTIONS: { id: AssetBucketId; label: string }[] = [
  { id: 'imprescindibles', label: `Sobre: ${ENVELOPE_META.imprescindibles.name}` },
  { id: 'disfrute', label: `Sobre: ${ENVELOPE_META.disfrute.name}` },
  { id: 'crecimiento_personal', label: `Sobre: ${ENVELOPE_META.crecimiento_personal.name}` },
  { id: 'provisiones_anuales', label: `Sobre: ${ENVELOPE_META.provisiones_anuales.name}` },
  { id: 'ahorro_inversion', label: `Sobre: ${ENVELOPE_META.ahorro_inversion.name}` },
  { id: 'banco_bolivares', label: 'Cuenta en Bolívares (Pago Móvil)' },
  { id: 'binance_usdt', label: 'Inversiones Binance (USDT)' },
  { id: 'binance_crypto', label: 'Inversiones Binance (Crypto)' },
  { id: 'binance_paxg', label: 'Inversiones Binance (PAXG)' },
  { id: 'emergencias', label: 'Fondo Emergencia (Efectivo)' },
  { id: 'binance_usdc', label: 'Fondo Emergencia (Binance USDC)' },
  { id: 'wallet_btc', label: 'Billetera BTC' },
];

const OUTFLOW_TYPES: MovementType[] = [
  'Gasto en Efectivo',
  'Cambio a Bolívares',
  'Pago de Cuota',
];

function isBsBucketOrAccount(bucket: AssetBucketId, customAccounts: CustomAccount[]): boolean {
  if (bucket === 'banco_bolivares') return true;
  const acct = customAccounts.find((a) => a.id === bucket);
  return acct?.currency === 'VES';
}

function inferDefaultMethod(
  bucket: AssetBucketId,
  customAccounts: CustomAccount[],
): PaymentMethod {
  if (isBsBucketOrAccount(bucket, customAccounts)) return 'bolivares_pago_movil';
  if (
    bucket === 'binance_usdt' ||
    bucket === 'binance_crypto' ||
    bucket === 'binance_paxg' ||
    bucket === 'binance_usdc'
  ) {
    return 'binance_usdt';
  }
  const custom = customAccounts.find((a) => a.id === bucket);
  if (custom) return 'otro';
  return 'efectivo_usd';
}

function getBucketBalance(
  bucket: AssetBucketId,
  movements: ReturnType<typeof useBudgetStore.getState>['movements'],
  bcvRate: number | null,
  customAccounts: CustomAccount[],
  freeBsPoolMode: boolean,
): { usd: number; bs: number } {
  if (ENVELOPE_SET.has(bucket)) {
    const { envelopes } = calculateFundSummaries(movements, bcvRate, customAccounts, undefined, {
      freeBsPoolMode,
    });
    const found = envelopes.find((e) => e.id === bucket);
    const usd = found?.available ?? 0;
    return { usd, bs: bcvRate ? usd * bcvRate : 0 };
  }

  const isBsBucket = isBsBucketOrAccount(bucket, customAccounts);
  let usd = 0;
  let bs = 0;
  for (const m of movements) {
    if (m.bucket !== bucket) continue;
    const isOut =
      m.type === 'Gasto en Efectivo' ||
      m.type === 'Cambio a Bolívares' ||
      m.type === 'Pago de Cuota' ||
      m.type === 'Transferencia (Salida)';
    const sign = isOut ? -1 : 1;
    usd += sign * (m.type === 'Ajuste' ? m.amountUsd : Math.abs(m.amountUsd));
    if (isBsBucket) {
      const mBs =
        typeof m.amountBs === 'number'
          ? Math.abs(m.amountBs)
          : bcvRate
            ? Math.abs(m.amountUsd) * bcvRate
            : 0;
      const bsSign = m.type === 'Ajuste' && m.amountUsd < 0 ? -1 : sign;
      bs += bsSign * mBs;
    }
  }
  const effectiveUsd =
    isBsBucket && bcvRate && bcvRate > 0 ? bs / bcvRate : usd;
  return {
    usd: Number(effectiveUsd.toFixed(2)),
    bs: isBsBucket ? Number(bs.toFixed(2)) : bcvRate ? Number((usd * bcvRate).toFixed(2)) : 0,
  };
}

export function QuickMovementModal({
  isOpen,
  initialBucket = 'imprescindibles',
  initialTab = 'movement',
  initialDirection = 'out',
  onClose,
}: QuickMovementModalProps) {
  const {
    movements,
    expenses,
    customAccounts,
    freeBsPoolMode,
    setFreeBsPoolMode,
    addMovement,
    transferBetweenBuckets,
    multiEnvelopeCustodyExchange,
    bcvRate,
  } = useBudgetStore();
  const [tab, setTab] = useState<QuickModalTab>(initialTab);
  const [transferMode, setTransferMode] = useState<'single' | 'multi'>('single');
  const [direction, setDirection] = useState<MovementDirection>(initialDirection);
  const [bucket, setBucket] = useState<AssetBucketId>(initialBucket);
  const [outflowType, setOutflowType] = useState<MovementType>('Gasto en Efectivo');
  const [inputCurrency, setInputCurrency] = useState<'USD' | 'BS'>(() =>
    isBsBucketOrAccount(initialBucket, customAccounts) && bcvRate ? 'BS' : 'USD',
  );
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    inferDefaultMethod(initialBucket, customAccounts),
  );
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Transfer state (single)
  const [fromBucket, setFromBucket] = useState<AssetBucketId>('binance_usdt');
  const [toBucket, setToBucket] = useState<AssetBucketId>('imprescindibles');
  const [fromMethod, setFromMethod] = useState<PaymentMethod>('binance_usdt');
  const [toMethod, setToMethod] = useState<PaymentMethod>('efectivo_usd');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [transferToInBs, setTransferToInBs] = useState(false);

  // Multi-envelope custody exchange state
  const [multiFromMethod, setMultiFromMethod] = useState<PaymentMethod>('binance_usdt');
  const [multiToMethod, setMultiToMethod] = useState<PaymentMethod>('efectivo_usd');
  const [multiTotalUsd, setMultiTotalUsd] = useState('');
  const [multiReceived, setMultiReceived] = useState('');
  const [multiSplits, setMultiSplits] = useState<Record<EnvelopeId, string>>({
    imprescindibles: '',
    disfrute: '',
    crecimiento_personal: '',
    provisiones_anuales: '',
    ahorro_inversion: '',
  });

  const bucketOptions = useMemo(
    () => [
      ...BUCKET_OPTIONS,
      ...customAccounts.map((a) => ({
        id: a.id as AssetBucketId,
        label: `Cuenta: ${a.name} (${a.currency})`,
      })),
    ],
    [customAccounts],
  );

  const currentBucketBalance = useMemo(
    () => getBucketBalance(bucket, movements, bcvRate, customAccounts, freeBsPoolMode),
    [bucket, movements, bcvRate, customAccounts, freeBsPoolMode],
  );

  const envelopeSummaries = useMemo(
    () => calculateEnvelopeSummaries(movements, { freeBsPoolMode }),
    [movements, freeBsPoolMode],
  );

  const multiEnvelopeMeta = useMemo(() => {
    return ENVELOPE_IDS.map((envId) => {
      const summary = envelopeSummaries.find((e) => e.id === envId);
      const byMethod = summary?.byMethod ?? {
        efectivo: 0,
        binance: 0,
        bolivares: 0,
      };
      const totalBal = summary?.available ?? 0;
      const originAvail = Math.max(
        0,
        getEnvelopeMethodBalance(byMethod, totalBal, multiFromMethod),
      );
      const destAvail = Math.max(
        0,
        getEnvelopeMethodBalance(byMethod, totalBal, multiToMethod),
      );

      const activeInEnv = expenses.filter((e) => e.active && e.envelopeId === envId);
      const destPrefDemand = activeInEnv
        .filter((e) => e.preferredPaymentMethod === multiToMethod)
        .reduce((acc, e) => acc + e.amountUsd, 0);
      const originProtected = activeInEnv
        .filter((e) => e.preferredPaymentMethod === multiFromMethod)
        .reduce((acc, e) => acc + e.amountUsd, 0);

      const destNeed = Math.max(0, Number((destPrefDemand - destAvail).toFixed(2)));
      const excessOrigin = Math.max(0, Number((originAvail - originProtected).toFixed(2)));

      return {
        id: envId,
        name: ENVELOPE_META[envId].shortName,
        originAvail: Number(originAvail.toFixed(2)),
        destNeed,
        originProtected: Number(originProtected.toFixed(2)),
        excessOrigin,
      };
    });
  }, [envelopeSummaries, expenses, multiFromMethod, multiToMethod]);

  if (!isOpen) return null;

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const effectiveRate = bcvRate ?? 0;

  const parsedInput = parseFloat(amount);
  const safeParsed = Number.isFinite(parsedInput) ? parsedInput : 0;
  const computedUsdFromInput =
    inputCurrency === 'BS' && hasValidRate ? safeParsed / effectiveRate : safeParsed;
  const computedBsFromInput =
    inputCurrency === 'BS'
      ? safeParsed
      : hasValidRate
        ? safeParsed * effectiveRate
        : 0;

  // Delta calculation for set_balance mode
  const setBalanceDeltaUsd =
    inputCurrency === 'BS' && hasValidRate
      ? Number(((safeParsed - currentBucketBalance.bs) / effectiveRate).toFixed(2))
      : Number((safeParsed - currentBucketBalance.usd).toFixed(2));
  const setBalanceDeltaBs =
    inputCurrency === 'BS'
      ? Number((safeParsed - currentBucketBalance.bs).toFixed(2))
      : hasValidRate
        ? Number((setBalanceDeltaUsd * effectiveRate).toFixed(2))
        : 0;

  const isSameTransferTarget =
    fromBucket === toBucket && (!ENVELOPE_SET.has(fromBucket) || fromMethod === toMethod);

  const isDestinationBs =
    isBsBucketOrAccount(toBucket, customAccounts) ||
    (ENVELOPE_SET.has(toBucket) && toMethod === 'bolivares_pago_movil');

  const isOriginBs =
    isBsBucketOrAccount(fromBucket, customAccounts) ||
    (ENVELOPE_SET.has(fromBucket) && fromMethod === 'bolivares_pago_movil');

  const handleSelectBucket = (next: AssetBucketId) => {
    setBucket(next);
    const inferred = inferDefaultMethod(next, customAccounts);
    setPaymentMethod(inferred);
    if (inferred === 'bolivares_pago_movil' && hasValidRate) {
      setInputCurrency('BS');
    } else if (inferred !== 'bolivares_pago_movil') {
      setInputCurrency('USD');
    }
  };

  const handleSelectMethod = (next: PaymentMethod) => {
    setPaymentMethod(next);
    if (next === 'bolivares_pago_movil' && hasValidRate) {
      setInputCurrency('BS');
    } else if (next !== 'bolivares_pago_movil') {
      setInputCurrency('USD');
    }
  };

  const handleSelectFromBucket = (next: AssetBucketId) => {
    setFromBucket(next);
    setFromMethod(inferDefaultMethod(next, customAccounts));
  };

  const handleSelectToBucket = (next: AssetBucketId) => {
    setToBucket(next);
    const nextMethod = inferDefaultMethod(next, customAccounts);
    setToMethod(nextMethod);
    setTransferToInBs(nextMethod === 'bolivares_pago_movil' && hasValidRate);
  };

  const handleSubmitMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCurrency === 'BS' && !hasValidRate) return;

    const isBsMovement =
      inputCurrency === 'BS' ||
      isBsBucketOrAccount(bucket, customAccounts) ||
      paymentMethod === 'bolivares_pago_movil';

    if (direction === 'set_balance') {
      if (!Number.isFinite(parsedInput) || parsedInput < 0) return;
      if (Math.abs(setBalanceDeltaUsd) < 0.01 && Math.abs(setBalanceDeltaBs) < 0.01) {
        onClose();
        return;
      }

      addMovement({
        date,
        bucket,
        type: 'Ajuste',
        amountUsd: setBalanceDeltaUsd,
        amountBs: isBsMovement && hasValidRate ? setBalanceDeltaBs : undefined,
        bcvRateUsed: isBsMovement && hasValidRate ? effectiveRate : undefined,
        paymentMethod,
        notes:
          notes.trim() ||
          `Ajuste de saldo (${inputCurrency === 'BS' ? formatBs(safeParsed) : formatUsd(safeParsed)})`,
      });
      setAmount('');
      setNotes('');
      onClose();
      return;
    }

    if (!Number.isFinite(parsedInput) || parsedInput <= 0) return;

    const amountUsd = Number(computedUsdFromInput.toFixed(2));
    const finalType: MovementType =
      direction === 'in'
        ? INVESTMENT_BUCKETS.has(bucket)
          ? 'Barrido a Inversión'
          : 'Ingreso a Sobre'
        : outflowType;

    addMovement({
      date,
      bucket,
      type: finalType,
      amountUsd,
      amountBs:
        isBsMovement && hasValidRate ? Number(computedBsFromInput.toFixed(2)) : undefined,
      bcvRateUsed: isBsMovement && hasValidRate ? effectiveRate : undefined,
      paymentMethod,
      notes:
        notes.trim() ||
        (direction === 'in' ? 'Ingreso / Saldo inicial' : undefined),
    });
    setAmount('');
    setNotes('');
    onClose();
  };

  const handleSubmitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const numFrom = parseFloat(amountFrom);
    if (!Number.isFinite(numFrom) || numFrom <= 0) return;
    if (isSameTransferTarget) return;

    const rawTo = amountTo.trim() ? parseFloat(amountTo) : NaN;
    let finalUsdTo = numFrom;
    let finalBsTo: number | undefined;

    if (transferToInBs && hasValidRate) {
      const bsReceived = Number.isFinite(rawTo) && rawTo > 0 ? rawTo : numFrom * effectiveRate;
      finalBsTo = Number(bsReceived.toFixed(2));
      finalUsdTo = Number((bsReceived / effectiveRate).toFixed(2));
    } else {
      finalUsdTo = Number.isFinite(rawTo) && rawTo > 0 ? rawTo : numFrom;
      if (isDestinationBs && hasValidRate) {
        finalBsTo = Number((finalUsdTo * effectiveRate).toFixed(2));
      }
    }

    const finalBsFrom =
      isOriginBs && hasValidRate ? Number((numFrom * effectiveRate).toFixed(2)) : undefined;

    const actualFromMethod = ENVELOPE_SET.has(fromBucket)
      ? fromMethod
      : inferDefaultMethod(fromBucket, customAccounts);
    const actualToMethod = ENVELOPE_SET.has(toBucket)
      ? toMethod
      : inferDefaultMethod(toBucket, customAccounts);

    transferBetweenBuckets({
      date,
      fromBucket,
      toBucket,
      fromPaymentMethod: actualFromMethod,
      toPaymentMethod: actualToMethod,
      amountFrom: numFrom,
      amountTo: finalUsdTo,
      amountBsFrom: finalBsFrom,
      amountBsTo: finalBsTo,
      bcvRateUsed: (isOriginBs || isDestinationBs) && hasValidRate ? effectiveRate : undefined,
      notes: notes.trim() || undefined,
    });

    // Keep Portafolio Crypto USDT balance in sync when USDT leaves or enters Binance
    const originHoldsUsdt = isUsdtCustodyHolder(fromBucket, actualFromMethod);
    const destHoldsUsdt = isUsdtCustodyHolder(toBucket, actualToMethod);
    if (originHoldsUsdt && !destHoldsUsdt) {
      const cleanAmt = Number(Math.abs(numFrom).toFixed(2));
      usePortfolioStore.getState().addTransaction({
        date: buildPortfolioDateStr(date),
        type: 'Withdraw',
        asset: 'USDT',
        tokens: cleanAmt.toFixed(2),
        usdValue: cleanAmt,
      });
    } else if (!originHoldsUsdt && destHoldsUsdt) {
      const cleanAmt = Number(Math.abs(finalUsdTo).toFixed(2));
      usePortfolioStore.getState().addTransaction({
        date: buildPortfolioDateStr(date),
        type: 'Deposit',
        asset: 'USDT',
        tokens: cleanAmt.toFixed(2),
        usdValue: cleanAmt,
      });
    }

    setAmountFrom('');
    setAmountTo('');
    setNotes('');
    onClose();
  };

  const multiAllocatedTotal = ENVELOPE_IDS.reduce((acc, id) => {
    const val = parseFloat(multiSplits[id]);
    return acc + (Number.isFinite(val) && val > 0 ? val : 0);
  }, 0);

  const handleAutoSuggestMultiSplit = () => {
    const parsedTarget = parseFloat(multiTotalUsd);
    const totalOriginAvail = multiEnvelopeMeta.reduce((acc, m) => acc + m.originAvail, 0);
    const target =
      Number.isFinite(parsedTarget) && parsedTarget > 0
        ? Math.min(parsedTarget, totalOriginAvail)
        : totalOriginAvail;

    if (target <= 0) return;
    if (!multiTotalUsd.trim()) {
      setMultiTotalUsd(target.toFixed(2));
    }

    const allocated: Record<EnvelopeId, number> = {
      imprescindibles: 0,
      disfrute: 0,
      crecimiento_personal: 0,
      provisiones_anuales: 0,
      ahorro_inversion: 0,
    };

    let remaining = target;

    // Pass 1: Cover destination custody needs (expenses preferring multiToMethod)
    const needCaps = multiEnvelopeMeta.map((m) => ({
      id: m.id,
      cap: Math.min(m.originAvail, m.destNeed),
    }));
    const totalNeedCap = needCaps.reduce((acc, x) => acc + x.cap, 0);
    if (totalNeedCap > 0 && remaining > 0) {
      const ratio = totalNeedCap > remaining ? remaining / totalNeedCap : 1;
      for (const item of needCaps) {
        if (item.cap <= 0) continue;
        const take = Number((item.cap * ratio).toFixed(2));
        allocated[item.id] += take;
        remaining = Number((remaining - take).toFixed(2));
      }
    }

    // Pass 2: Use excess origin balance above expenses preferring multiFromMethod
    if (remaining > 0.01) {
      const excessCaps = multiEnvelopeMeta.map((m) => ({
        id: m.id,
        cap: Math.max(0, Math.min(m.originAvail - allocated[m.id], m.excessOrigin - allocated[m.id])),
      }));
      const totalExcess = excessCaps.reduce((acc, x) => acc + x.cap, 0);
      if (totalExcess > 0) {
        const ratio = totalExcess > remaining ? remaining / totalExcess : 1;
        for (const item of excessCaps) {
          if (item.cap <= 0) continue;
          const take = Number((item.cap * ratio).toFixed(2));
          allocated[item.id] += take;
          remaining = Number((remaining - take).toFixed(2));
        }
      }
    }

    // Pass 3: Fallback to any remaining origin balance across envelopes
    if (remaining > 0.01) {
      const remCaps = multiEnvelopeMeta.map((m) => ({
        id: m.id,
        cap: Math.max(0, Number((m.originAvail - allocated[m.id]).toFixed(2))),
      }));
      const totalRem = remCaps.reduce((acc, x) => acc + x.cap, 0);
      if (totalRem > 0) {
        const ratio = totalRem > remaining ? remaining / totalRem : 1;
        for (const item of remCaps) {
          if (item.cap <= 0) continue;
          const take = Number((item.cap * ratio).toFixed(2));
          allocated[item.id] += take;
          remaining = Number((remaining - take).toFixed(2));
        }
      }
    }

    // Fix rounding residual on the largest allocated or available envelope
    const sumAllocated = Object.values(allocated).reduce((a, b) => a + b, 0);
    const diff = Number((target - sumAllocated).toFixed(2));
    if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05) {
      const candidate = multiEnvelopeMeta.find(
        (m) => m.originAvail - allocated[m.id] >= diff && allocated[m.id] + diff >= 0,
      );
      if (candidate) {
        allocated[candidate.id] = Number((allocated[candidate.id] + diff).toFixed(2));
      }
    }

    setMultiSplits({
      imprescindibles: allocated.imprescindibles > 0 ? allocated.imprescindibles.toFixed(2) : '',
      disfrute: allocated.disfrute > 0 ? allocated.disfrute.toFixed(2) : '',
      crecimiento_personal:
        allocated.crecimiento_personal > 0 ? allocated.crecimiento_personal.toFixed(2) : '',
      provisiones_anuales:
        allocated.provisiones_anuales > 0 ? allocated.provisiones_anuales.toFixed(2) : '',
      ahorro_inversion:
        allocated.ahorro_inversion > 0 ? allocated.ahorro_inversion.toFixed(2) : '',
    });
  };

  const handleSubmitMultiTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (multiFromMethod === multiToMethod) return;
    if (multiAllocatedTotal <= 0) return;

    const totalOut = multiAllocatedTotal;
    const rawReceived = multiReceived.trim() ? parseFloat(multiReceived) : NaN;
    const toIsBs = multiToMethod === 'bolivares_pago_movil';
    const fromIsBs = multiFromMethod === 'bolivares_pago_movil';

    let totalUsdIn = totalOut;
    let totalBsIn: number | undefined;

    if (toIsBs && hasValidRate) {
      totalBsIn = Number.isFinite(rawReceived) && rawReceived > 0 ? rawReceived : totalOut * effectiveRate;
      totalUsdIn = Number((totalBsIn / effectiveRate).toFixed(2));
    } else if (Number.isFinite(rawReceived) && rawReceived > 0) {
      totalUsdIn = rawReceived;
    }

    const scaleRatio = totalOut > 0 ? totalUsdIn / totalOut : 1;

    const allocations = ENVELOPE_IDS.map((envId) => {
      const amtFrom = parseFloat(multiSplits[envId]);
      if (!Number.isFinite(amtFrom) || amtFrom <= 0) return null;
      const amtTo = Number((amtFrom * scaleRatio).toFixed(2));
      return {
        bucket: envId as AssetBucketId,
        amountFrom: Number(amtFrom.toFixed(2)),
        amountTo: amtTo,
        amountBsFrom:
          fromIsBs && hasValidRate ? Number((amtFrom * effectiveRate).toFixed(2)) : undefined,
        amountBsTo:
          toIsBs && totalBsIn !== undefined
            ? Number(((amtFrom / totalOut) * totalBsIn).toFixed(2))
            : undefined,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    if (allocations.length === 0) return;

    multiEnvelopeCustodyExchange({
      date,
      fromPaymentMethod: multiFromMethod,
      toPaymentMethod: multiToMethod,
      allocations,
      bcvRateUsed: (fromIsBs || toIsBs) && hasValidRate ? effectiveRate : undefined,
      notes: notes.trim() || undefined,
    });

    if (multiFromMethod === 'binance_usdt' && multiToMethod !== 'binance_usdt') {
      const cleanAmt = Number(Math.abs(totalOut).toFixed(2));
      usePortfolioStore.getState().addTransaction({
        date: buildPortfolioDateStr(date),
        type: 'Withdraw',
        asset: 'USDT',
        tokens: cleanAmt.toFixed(2),
        usdValue: cleanAmt,
      });
    } else if (multiFromMethod !== 'binance_usdt' && multiToMethod === 'binance_usdt') {
      const cleanAmt = Number(Math.abs(totalUsdIn).toFixed(2));
      usePortfolioStore.getState().addTransaction({
        date: buildPortfolioDateStr(date),
        type: 'Deposit',
        asset: 'USDT',
        tokens: cleanAmt.toFixed(2),
        usdValue: cleanAmt,
      });
    }

    setMultiTotalUsd('');
    setMultiReceived('');
    setMultiSplits({
      imprescindibles: '',
      disfrute: '',
      crecimiento_personal: '',
      provisiones_anuales: '',
      ahorro_inversion: '',
    });
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
            {tab === 'transfer' ? (
              <>
                <ArrowLeftRight size={18} className="text-accent-blue" /> Cambiar / Transferir Fondos
              </>
            ) : (
              <>
                <Zap size={18} className="text-accent-gold" /> Movimiento Rápido
              </>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary bg-bg-input border-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-input border border-border mb-4">
          <button
            type="button"
            onClick={() => setTab('movement')}
            className={`py-2 rounded-lg text-xs font-semibold transition-all border-none cursor-pointer ${
              tab === 'movement'
                ? 'bg-bg-card text-text-primary shadow-sm'
                : 'bg-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            Gasto / Ingreso
          </button>
          <button
            type="button"
            onClick={() => setTab('transfer')}
            className={`py-2 rounded-lg text-xs font-semibold transition-all border-none cursor-pointer ${
              tab === 'transfer'
                ? 'bg-accent-blue/20 text-accent-blue shadow-sm'
                : 'bg-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            Cambiar / Transferir
          </button>
        </div>

        {tab === 'movement' ? (
          <form onSubmit={handleSubmitMovement} className="space-y-4">
            {/* Direction Selector: Gasto vs Ingreso vs Fijar Saldo */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setDirection('out')}
                className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  direction === 'out'
                    ? 'bg-accent-red/15 border-accent-red/50 text-accent-red'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                <MinusCircle size={13} /> Gasto
              </button>
              <button
                type="button"
                onClick={() => setDirection('in')}
                className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  direction === 'in'
                    ? 'bg-accent-green/15 border-accent-green/50 text-accent-green'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                <PlusCircle size={13} /> Ingreso
              </button>
              <button
                type="button"
                onClick={() => setDirection('set_balance')}
                className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  direction === 'set_balance'
                    ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                <SlidersHorizontal size={13} /> Fijar Saldo
              </button>
            </div>

            {/* Envelope / Bucket first so currency auto-adapts */}
            <div>
              <label className="text-xs text-text-muted block mb-1.5">
                {direction === 'out'
                  ? 'Sale de (Sobre o Fondo)'
                  : direction === 'in'
                    ? 'Entra a (Sobre o Fondo)'
                    : 'Fondo o Sobre a ajustar'}
              </label>
              <select
                value={bucket}
                onChange={(e) => handleSelectBucket(e.target.value as EnvelopeId | AssetBucketId)}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {bucketOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {direction === 'set_balance' && (
                <p className="text-[11px] text-text-muted mt-1">
                  Saldo actual registrado:{' '}
                  <strong className="text-text-primary">
                    {inputCurrency === 'BS'
                      ? formatBs(currentBucketBalance.bs)
                      : formatUsd(currentBucketBalance.usd)}
                  </strong>
                </p>
              )}
            </div>

            {/* Amount + Currency Toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-muted">
                  {direction === 'set_balance'
                    ? `Nuevo saldo exacto (${inputCurrency === 'BS' ? 'Bs' : 'USD'})`
                    : `Monto (${inputCurrency === 'BS' ? 'Bolívares' : 'USD'})`}
                </label>
                <div className="flex rounded-lg overflow-hidden border border-border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setInputCurrency('USD')}
                    className={`px-2.5 py-0.5 font-semibold border-none cursor-pointer ${
                      inputCurrency === 'USD'
                        ? 'bg-accent-blue text-white'
                        : 'bg-bg-input text-text-muted'
                    }`}
                  >
                    USD ($)
                  </button>
                  <button
                    type="button"
                    disabled={!hasValidRate}
                    onClick={() => setInputCurrency('BS')}
                    title={hasValidRate ? `Tasa BCV: Bs. ${effectiveRate}` : 'Tasa BCV no disponible'}
                    className={`px-2.5 py-0.5 font-semibold border-none cursor-pointer disabled:opacity-40 ${
                      inputCurrency === 'BS'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-bg-input text-text-muted'
                    }`}
                  >
                    Bs (BCV)
                  </button>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-semibold text-sm">
                  {inputCurrency === 'BS' ? 'Bs.' : '$'}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min={direction === 'set_balance' ? '0' : '0.01'}
                  inputMode="decimal"
                  autoFocus
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-xl font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              {inputCurrency === 'BS' && hasValidRate && (
                <p className="text-[11px] text-cyan-300 mt-1">
                  ≈ {formatUsd(computedUsdFromInput)} USD según tasa BCV (Bs.{' '}
                  {effectiveRate.toFixed(2)}/$)
                </p>
              )}
              {inputCurrency === 'USD' && hasValidRate && paymentMethod === 'bolivares_pago_movil' && (
                <p className="text-[11px] text-cyan-300 mt-1">
                  ≈ {formatBs(computedBsFromInput)} según tasa BCV
                </p>
              )}
              {direction === 'set_balance' && amount.trim() !== '' && (
                <p className="text-[11px] text-accent-gold mt-1">
                  Ajuste automático:{' '}
                  {setBalanceDeltaUsd >= 0 ? '+' : ''}
                  {formatUsd(setBalanceDeltaUsd)}
                  {inputCurrency === 'BS' ? ` (${setBalanceDeltaBs >= 0 ? '+' : ''}${formatBs(setBalanceDeltaBs)})` : ''}
                </p>
              )}

              {direction !== 'set_balance' && (
                <div className="flex gap-2 mt-2">
                  {(inputCurrency === 'BS' ? [100, 500, 1000, 2500, 5000] : [5, 10, 20, 50, 100]).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(String(preset))}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
                      >
                        {inputCurrency === 'BS' ? `${preset}` : `$${preset}`}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* Outflow subtype only when direction === 'out' */}
            {direction === 'out' && (
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Tipo de egreso</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {OUTFLOW_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOutflowType(t)}
                      className={`px-2 py-2 rounded-lg text-[11px] font-medium border text-center transition-all cursor-pointer ${
                        outflowType === t
                          ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                          : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Method + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Medio / Custodia</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => handleSelectMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((k) => (
                    <option key={k} value={k}>
                      {PAYMENT_METHOD_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>

            {direction === 'out' &&
              paymentMethod === 'bolivares_pago_movil' &&
              ENVELOPE_SET.has(bucket) &&
              (() => {
                const envBsAvail = Math.max(
                  0,
                  envelopeSummaries.find((e) => e.id === bucket)?.byMethod.bolivares ?? 0,
                );
                if (computedUsdFromInput <= envBsAvail + 0.01) return null;
                return (
                  <div
                    className={`rounded-xl p-2.5 border text-[11px] flex items-center justify-between gap-2 ${
                      freeBsPoolMode
                        ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-200'
                        : 'bg-accent-gold/10 border-accent-gold/35 text-accent-gold'
                    }`}
                  >
                    <span className="leading-snug">
                      {freeBsPoolMode
                        ? `ℹ️ Modo Saldo Libre Bs: el excedente sobre los Bs del sobre (${formatUsd(envBsAvail)}) se descontará de tu saldo libre en Bs.`
                        : `⚠️ Este sobre solo tiene ${formatUsd(envBsAvail)} en Bs y quedará con custodia Bs en negativo.`}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={freeBsPoolMode}
                      onClick={() => setFreeBsPoolMode(!freeBsPoolMode)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold border cursor-pointer shrink-0 transition-colors ${
                        freeBsPoolMode
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                          : 'bg-bg-card border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                          freeBsPoolMode ? 'bg-cyan-400' : 'bg-white/20'
                        }`}
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 transform rounded-full bg-bg-primary shadow transition-transform ${
                            freeBsPoolMode ? 'translate-x-3' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                      <span>
                        <span className={freeBsPoolMode ? 'text-cyan-300 font-bold' : 'text-text-muted/60'}>
                          Saldo Libre
                        </span>
                        <span className="text-text-muted/40 mx-0.5">/</span>
                        <span className={!freeBsPoolMode ? 'text-text-primary font-bold' : 'text-text-muted/60'}>
                          Estricto
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })()}

            {/* Notes */}
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Nota (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  direction === 'in'
                    ? 'Ej. Saldo inicial, bono, venta...'
                    : direction === 'set_balance'
                      ? 'Ej. Cuadre de saldo real'
                      : 'Ej. Mercado, recarga, parking...'
                }
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>

            <button
              type="submit"
              className={`w-full py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                direction === 'in'
                  ? 'bg-accent-green/20 border-accent-green/40 text-accent-green hover:bg-accent-green/30'
                  : direction === 'set_balance'
                    ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30'
                    : 'bg-accent-gold/20 border-accent-gold/40 text-accent-gold hover:bg-accent-gold/30'
              }`}
            >
              {direction === 'in'
                ? 'Guardar Ingreso / Saldo'
                : direction === 'set_balance'
                  ? 'Aplicar Ajuste de Saldo'
                  : 'Guardar Gasto'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Transfer mode switcher */}
            <div className="grid grid-cols-2 gap-1.5 bg-bg-input/60 p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setTransferMode('single')}
                className={`py-1.5 rounded-lg text-[11px] font-semibold border-none cursor-pointer transition-colors ${
                  transferMode === 'single'
                    ? 'bg-accent-blue text-white'
                    : 'bg-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                1 a 1 (Simple)
              </button>
              <button
                type="button"
                onClick={() => setTransferMode('multi')}
                className={`py-1.5 rounded-lg text-[11px] font-semibold border-none cursor-pointer transition-colors ${
                  transferMode === 'multi'
                    ? 'bg-accent-blue text-white'
                    : 'bg-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Multi-Sobre (Repartir)
              </button>
            </div>

            {transferMode === 'multi' ? (
              <form onSubmit={handleSubmitMultiTransfer} className="space-y-3.5">
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Cambia la custodia de tus sobres (ej. 500 USDT → 500$ Efectivo) en una sola operación, con sugerencia automática según la forma de pago de tus gastos.
                </p>

                {/* Quick custody presets */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMultiFromMethod('binance_usdt');
                      setMultiToMethod('efectivo_usd');
                      setNotes('Cambio multi-sobre USDT a Efectivo');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent-blue/10 border border-accent-blue/30 text-accent-blue cursor-pointer"
                  >
                    USDT → Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMultiFromMethod('binance_usdt');
                      setMultiToMethod('bolivares_pago_movil');
                      setNotes('Cambio multi-sobre USDT a Bs');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent-gold/10 border border-accent-gold/30 text-accent-gold cursor-pointer"
                  >
                    USDT → Bolívares
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMultiFromMethod('efectivo_usd');
                      setMultiToMethod('bolivares_pago_movil');
                      setNotes('Cambio multi-sobre Efectivo a Bs');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent-green/10 border border-accent-green/30 text-accent-green cursor-pointer"
                  >
                    Efectivo → Bolívares
                  </button>
                </div>

                {/* Custody origin & destination */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">Sale de custodia</label>
                    <select
                      value={multiFromMethod}
                      onChange={(e) => setMultiFromMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                    >
                      <option value="binance_usdt">Binance USDT</option>
                      <option value="efectivo_usd">Efectivo USD</option>
                      <option value="bolivares_pago_movil">Bolívares</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">Entra a custodia</label>
                    <select
                      value={multiToMethod}
                      onChange={(e) => setMultiToMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                    >
                      <option value="efectivo_usd">Efectivo USD</option>
                      <option value="binance_usdt">Binance USDT</option>
                      <option value="bolivares_pago_movil">Bolívares</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>

                {multiFromMethod === multiToMethod && (
                  <p className="text-xs text-accent-red">
                    La custodia de origen y destino deben ser distintas.
                  </p>
                )}

                {/* Total target & received */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">Monto total ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      inputMode="decimal"
                      value={multiTotalUsd}
                      onChange={(e) => setMultiTotalUsd(e.target.value)}
                      placeholder="500.00"
                      className="w-full px-3 py-2 rounded-xl text-sm font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">
                      {multiToMethod === 'bolivares_pago_movil'
                        ? 'Recibido (Bs opcional)'
                        : 'Recibido ($ opcional)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      inputMode="decimal"
                      value={multiReceived}
                      onChange={(e) => setMultiReceived(e.target.value)}
                      placeholder={
                        multiToMethod === 'bolivares_pago_movil' && hasValidRate
                          ? ((parseFloat(multiTotalUsd) || multiAllocatedTotal || 0) * effectiveRate).toFixed(2)
                          : multiTotalUsd || 'Igual'
                      }
                      className="w-full px-3 py-2 rounded-xl text-sm font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                </div>

                {/* Auto-suggest button */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-text-muted">Reparto por sobre:</span>
                  <button
                    type="button"
                    onClick={handleAutoSuggestMultiSplit}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-accent-purple/15 border border-accent-purple/40 text-accent-purple hover:bg-accent-purple/25 cursor-pointer"
                  >
                    <Sparkles size={13} /> Auto-repartir según gastos
                  </button>
                </div>

                {/* Per-envelope rows */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                  {multiEnvelopeMeta.map((meta) => {
                    const currentVal = parseFloat(multiSplits[meta.id]) || 0;
                    const overLimit = currentVal > meta.originAvail + 0.01;
                    return (
                      <div
                        key={meta.id}
                        className="p-2.5 rounded-xl bg-bg-input/40 border border-border flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-text-primary truncate">
                              {meta.name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setMultiSplits((prev) => ({
                                  ...prev,
                                  [meta.id]: meta.originAvail > 0 ? meta.originAvail.toFixed(2) : '',
                                }))
                              }
                              className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input text-text-muted hover:text-accent-blue border border-border cursor-pointer"
                            >
                              Disp: {formatUsd(meta.originAvail)}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[10px]">
                            {meta.destNeed > 0 && (
                              <span className="text-accent-green">
                                Cubre gastos destino: {formatUsd(meta.destNeed)}
                              </span>
                            )}
                            {meta.originProtected > 0 && (
                              <span className="text-accent-gold">
                                Protege origen: {formatUsd(meta.originProtected)}
                              </span>
                            )}
                            {overLimit && (
                              <span className="text-accent-red font-semibold">
                                Excede disponible
                              </span>
                            )}
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={multiSplits[meta.id]}
                          onChange={(e) =>
                            setMultiSplits((prev) => ({ ...prev, [meta.id]: e.target.value }))
                          }
                          placeholder="0.00"
                          className={`w-24 px-2.5 py-1.5 rounded-lg text-xs font-bold text-right bg-bg-input border focus:outline-none ${
                            overLimit
                              ? 'border-accent-red text-accent-red'
                              : 'border-border text-text-primary focus:border-accent-blue'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Summary total */}
                {(() => {
                  const targetNum = parseFloat(multiTotalUsd);
                  const hasTarget = Number.isFinite(targetNum) && targetNum > 0;
                  const diff = hasTarget ? targetNum - multiAllocatedTotal : 0;
                  return (
                    <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-bg-input/60 border border-border">
                      <span className="text-text-muted">Total repartido:</span>
                      <span
                        className={`font-bold ${
                          hasTarget && Math.abs(diff) > 0.02
                            ? 'text-accent-gold'
                            : 'text-accent-green'
                        }`}
                      >
                        {formatUsd(multiAllocatedTotal)}
                        {hasTarget ? ` / ${formatUsd(targetNum)}` : ''}
                      </span>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted block mb-1.5">Fecha</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1.5">Nota</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Cambio con amigo"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={multiFromMethod === multiToMethod || multiAllocatedTotal <= 0}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-40 transition-all cursor-pointer"
                >
                  Confirmar Cambio Multi-Sobre ({formatUsd(multiAllocatedTotal)})
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitTransfer} className="space-y-4">
            {/* Quick presets */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFromBucket('binance_usdt');
                  setFromMethod('binance_usdt');
                  setToBucket('imprescindibles');
                  setToMethod('efectivo_usd');
                  setTransferToInBs(false);
                  setNotes('Cambio USDT a USD efectivo');
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent-blue/10 border border-accent-blue/30 text-accent-blue cursor-pointer"
              >
                USDT → Efectivo
              </button>
              <button
                type="button"
                onClick={() => {
                  setFromBucket('binance_usdt');
                  setFromMethod('binance_usdt');
                  setToBucket('banco_bolivares');
                  setToMethod('bolivares_pago_movil');
                  setTransferToInBs(hasValidRate);
                  setNotes('Cambio USDT a Bolívares');
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent-gold/10 border border-accent-gold/30 text-accent-gold cursor-pointer"
              >
                USDT → Cuenta Bs
              </button>
              <button
                type="button"
                onClick={() => {
                  setFromBucket('imprescindibles');
                  setFromMethod('efectivo_usd');
                  setToBucket('banco_bolivares');
                  setToMethod('bolivares_pago_movil');
                  setTransferToInBs(hasValidRate);
                  setNotes('Cambio efectivo a Bolívares');
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-accent-green/10 border border-accent-green/30 text-accent-green cursor-pointer"
              >
                Efectivo → Cuenta Bs
              </button>
            </div>

            {/* Origin */}
            <div className="space-y-2 bg-bg-input/40 border border-border rounded-xl p-3">
              <label className="text-xs text-text-muted block">Sale de (Origen)</label>
              <select
                value={fromBucket}
                onChange={(e) => handleSelectFromBucket(e.target.value as AssetBucketId)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {bucketOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {ENVELOPE_SET.has(fromBucket) && (
                <select
                  value={fromMethod}
                  onChange={(e) => setFromMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-1.5 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted"
                >
                  <option value="efectivo_usd">Custodia: Efectivo USD</option>
                  <option value="binance_usdt">Custodia: Binance USDT</option>
                  <option value="bolivares_pago_movil">Custodia: Bolívares</option>
                </select>
              )}
            </div>

            {/* Destination */}
            <div className="space-y-2 bg-bg-input/40 border border-border rounded-xl p-3">
              <label className="text-xs text-text-muted block">Entra a (Destino)</label>
              <select
                value={toBucket}
                onChange={(e) => handleSelectToBucket(e.target.value as AssetBucketId)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {bucketOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {ENVELOPE_SET.has(toBucket) && (
                <select
                  value={toMethod}
                  onChange={(e) => {
                    const next = e.target.value as PaymentMethod;
                    setToMethod(next);
                    setTransferToInBs(next === 'bolivares_pago_movil' && hasValidRate);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted"
                >
                  <option value="efectivo_usd">Custodia: Efectivo USD</option>
                  <option value="binance_usdt">Custodia: Binance USDT</option>
                  <option value="bolivares_pago_movil">Custodia: Bolívares</option>
                </select>
              )}
            </div>

            {isSameTransferTarget && (
              <p className="text-xs text-accent-red">
                El origen y el destino deben ser distintos (o cambia la custodia).
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Monto que sale ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  required
                  value={amountFrom}
                  onChange={(e) => setAmountFrom(e.target.value)}
                  placeholder="100.00"
                  className="w-full px-3 py-2.5 rounded-xl text-base font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-text-muted">
                    {transferToInBs ? 'Recibido (Bs)' : 'Recibido ($)'}
                  </label>
                  {isDestinationBs && hasValidRate && (
                    <button
                      type="button"
                      onClick={() => {
                        setTransferToInBs((v) => !v);
                        setAmountTo('');
                      }}
                      className="text-[10px] text-cyan-300 underline bg-transparent border-none cursor-pointer"
                    >
                      {transferToInBs ? 'En $' : 'En Bs'}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  value={amountTo}
                  onChange={(e) => setAmountTo(e.target.value)}
                  placeholder={
                    transferToInBs && hasValidRate
                      ? ((parseFloat(amountFrom) || 0) * effectiveRate).toFixed(2)
                      : amountFrom || 'Igual'
                  }
                  className="w-full px-3 py-2.5 rounded-xl text-base font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
                {transferToInBs && hasValidRate && amountTo.trim() && (
                  <p className="text-[10px] text-cyan-300 mt-1">
                    ≈ {formatUsd((parseFloat(amountTo) || 0) / effectiveRate)} (BCV)
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Nota</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. P2P / Pago Móvil"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSameTransferTarget}
              className="w-full py-3 rounded-xl text-sm font-bold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-40 transition-all cursor-pointer"
            >
              Confirmar Cambio / Transferencia
            </button>
          </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
