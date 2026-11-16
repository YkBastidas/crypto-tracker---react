import { ENVELOPE_META } from '../data/defaultSeed';
import type {
  AssetBucketId,
  EnvelopeId,
  EnvelopeSummary,
  InstallmentPlan,
  LedgerMovement,
  MonthEndEnvelopeOutcome,
  MonthEndSimulationResult,
  MonthEndSweepMovement,
  PaymentMethod,
  QuincenaConfig,
  RecurringExpense,
} from '../types';
import { calculateDaysLeft, calculateMonthlyEssentials } from '../utils/calculations';

export interface MonthEndSimulationInput {
  envelopes: EnvelopeSummary[];
  emergencyBalance: number;
  emergencyTarget: number;
  disfruteMaxCap: number;
  imprescindiblesReserve?: number;
  annualProvisionsTopUp?: number;
  date?: string;
}

export interface AnnualProvisionItem {
  id: string;
  name: string;
  amountUsd: number;
  daysLeft: number;
  quincenasLeft: number;
  requiredToday: number;
}

export interface AnnualProvisionsTargetSummary {
  targetToday: number;
  items: AnnualProvisionItem[];
}

export function computeAnnualProvisionsTargetToday(
  expenses: RecurringExpense[],
): AnnualProvisionsTargetSummary {
  const items: AnnualProvisionItem[] = [];
  for (const exp of expenses) {
    if (!exp.active || exp.frequency !== 'anual') continue;
    const daysLeft = calculateDaysLeft(exp.nextDueDate);
    const quincenasLeft =
      daysLeft <= 0 ? 0 : Math.min(24, Math.floor(daysLeft / 15));
    const biweeklyQuota = exp.amountUsd / 24;
    const requiredToday = round2(
      Math.max(0, exp.amountUsd - quincenasLeft * biweeklyQuota),
    );
    if (requiredToday > 0) {
      items.push({
        id: exp.id,
        name: exp.name,
        amountUsd: exp.amountUsd,
        daysLeft,
        quincenasLeft,
        requiredToday,
      });
    }
  }
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  const targetToday = round2(items.reduce((acc, i) => acc + i.requiredToday, 0));
  return { targetToday, items };
}

export interface UpcomingEssentialItem {
  id: string;
  name: string;
  amountUsd: number;
  nextDueDate: string;
  daysLeft: number;
}

export interface ImprescindiblesReserveSuggestion {
  upcomingBeforePayday: number;
  monthlyEssentialsTotal: number;
  items: UpcomingEssentialItem[];
}

export function getDefaultNextPaydayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  let target: Date;
  if (d < 15) {
    target = new Date(y, m, 15);
  } else {
    const lastDay = new Date(y, m + 1, 0);
    target = d < lastDay.getDate() ? lastDay : new Date(y, m + 1, 15);
  }
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function computeImprescindiblesSuggestedReserve(params: {
  expenses: RecurringExpense[];
  installments: InstallmentPlan[];
  nextPaydayDate: string;
}): ImprescindiblesReserveSuggestion {
  const { expenses, installments, nextPaydayDate } = params;
  const items: UpcomingEssentialItem[] = [];

  for (const exp of expenses) {
    if (!exp.active || exp.envelopeId !== 'imprescindibles') continue;
    if (exp.nextDueDate <= nextPaydayDate) {
      items.push({
        id: exp.id,
        name: exp.name,
        amountUsd: exp.amountUsd,
        nextDueDate: exp.nextDueDate,
        daysLeft: calculateDaysLeft(exp.nextDueDate),
      });
    }
  }

  for (const plan of installments) {
    if (
      plan.direction !== 'payable' ||
      !plan.nextDueDate ||
      (plan.maxCap !== null && plan.paidTotal >= plan.maxCap)
    ) {
      continue;
    }
    if (plan.nextDueDate <= nextPaydayDate) {
      items.push({
        id: plan.id,
        name: plan.name,
        amountUsd: plan.installmentAmount,
        nextDueDate: plan.nextDueDate,
        daysLeft: calculateDaysLeft(plan.nextDueDate),
      });
    }
  }

  items.sort((a, b) => a.daysLeft - b.daysLeft);
  const upcomingBeforePayday = round2(items.reduce((acc, i) => acc + i.amountUsd, 0));
  const monthlyEssentialsTotal = calculateMonthlyEssentials(expenses);

  return {
    upcomingBeforePayday,
    monthlyEssentialsTotal,
    items,
  };
}

export function computeDisfruteMaxCap(
  quincenaConfig: QuincenaConfig,
  referenceQuincenaUsd = 500,
): number {
  const rule = quincenaConfig.rules.find((r) => r.envelopeId === 'disfrute');
  if (!rule) return 500;
  const biweekly =
    rule.mode === 'fixed'
      ? Math.max(0, rule.value)
      : Math.max(0, referenceQuincenaUsd) * (Math.max(0, rule.value) / 100);
  const threeMonths = Number((biweekly * 2 * 3).toFixed(2));
  return threeMonths > 0 ? threeMonths : 500;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function simulateMonthEndRollover(
  input: MonthEndSimulationInput,
): MonthEndSimulationResult {
  const {
    envelopes,
    emergencyBalance,
    emergencyTarget,
    disfruteMaxCap,
    imprescindiblesReserve = 0,
    annualProvisionsTopUp = 0,
    date = new Date().toISOString().slice(0, 10),
  } = input;

  const getBal = (id: EnvelopeId): number =>
    round2(envelopes.find((e) => e.id === id)?.available ?? 0);

  const impBalance = getBal('imprescindibles');
  const disBalance = getBal('disfrute');
  const creBalance = getBal('crecimiento_personal');
  const ahoBalance = getBal('ahorro_inversion');
  const provBalance = getBal('provisiones_anuales');

  const initialEmergency = round2(emergencyBalance);
  const target = round2(Math.max(0, emergencyTarget));
  const initialPhase: 1 | 2 = target > 0 && initialEmergency < target ? 1 : 2;

  let runningEmergency = initialEmergency;
  let emergencyGap = target > 0 ? round2(Math.max(0, target - runningEmergency)) : 0;

  const movements: MonthEndSweepMovement[] = [];
  let seq = 1;
  const pushMov = (
    type: MonthEndSweepMovement['type'],
    fromBucket: AssetBucketId,
    toBucket: AssetBucketId,
    amountUsd: number,
    reason: string,
  ) => {
    const clean = round2(amountUsd);
    if (clean <= 0) return;
    movements.push({
      id: `me-${seq++}`,
      date,
      type,
      fromBucket,
      toBucket,
      amountUsd: clean,
      reason,
    });
  };

  // Track totals
  let impRolled = 0;
  let impSwept = 0;
  let disRolled = 0;
  let disSwept = 0;
  let creRolled = 0;
  let sweptToAnnual = 0;
  let sweptToEmergency = 0;
  let sweptToInvestment = 0;

  // 1. IMPRESCINDIBLES (SWEEP_ALL con reserva sugerida opcional + fondeo de Sinking Fund anual)
  if (impBalance > 0) {
    const protectedReserve = round2(Math.min(impBalance, Math.max(0, imprescindiblesReserve)));
    let sweepableImp = round2(Math.max(0, impBalance - protectedReserve));
    impRolled = protectedReserve;
    impSwept = sweepableImp;

    if (protectedReserve > 0) {
      pushMov(
        'ROLLOVER',
        'imprescindibles',
        'imprescindibles',
        protectedReserve,
        'Reserva protegida en Imprescindibles para gastos próximos',
      );
    }

    if (sweepableImp > 0 && annualProvisionsTopUp > 0) {
      const toAnnual = round2(Math.min(sweepableImp, annualProvisionsTopUp));
      if (toAnnual > 0) {
        pushMov(
          'SWEEP',
          'imprescindibles',
          'provisiones_anuales',
          toAnnual,
          'Fondear déficit de Provisiones Anuales (vencimientos cercanos)',
        );
        sweptToAnnual = round2(sweptToAnnual + toAnnual);
        sweepableImp = round2(sweepableImp - toAnnual);
      }
    }

    if (sweepableImp > 0) {
      if (emergencyGap > 0) {
        const toEmergency = round2(Math.min(sweepableImp, emergencyGap));
        const toInvestment = round2(sweepableImp - toEmergency);
        if (toEmergency > 0) {
          pushMov(
            'SWEEP',
            'imprescindibles',
            'emergencias',
            toEmergency,
            'Cierre Imprescindibles → completar Fondo de Emergencia',
          );
          runningEmergency = round2(runningEmergency + toEmergency);
          emergencyGap = round2(Math.max(0, target - runningEmergency));
          sweptToEmergency = round2(sweptToEmergency + toEmergency);
        }
        if (toInvestment > 0) {
          pushMov(
            'SWEEP',
            'imprescindibles',
            'ahorro_inversion',
            toInvestment,
            'Excedente Imprescindibles tras llenar Emergencia → Ahorro e Inversión',
          );
          sweptToInvestment = round2(sweptToInvestment + toInvestment);
        }
      } else {
        pushMov(
          'SWEEP',
          'imprescindibles',
          'ahorro_inversion',
          sweepableImp,
          'Cierre Imprescindibles (Emergencia al 100%) → Ahorro e Inversión',
        );
        sweptToInvestment = round2(sweptToInvestment + sweepableImp);
      }
    }
  } else {
    impRolled = impBalance;
  }

  // 2. DISFRUTE (PHASED_CAP)
  const effectiveDisCap = disfruteMaxCap > 0 ? round2(disfruteMaxCap) : 500;
  if (disBalance > 0) {
    if (emergencyGap > 0) {
      // Fase 1: 50% se queda en Disfrute, 50% al Fondo de Emergencia
      const keep = round2(disBalance * 0.5);
      const sweepPool = round2(disBalance - keep);
      const toEmergency = round2(Math.min(sweepPool, emergencyGap));
      const toInvestment = round2(sweepPool - toEmergency);

      disRolled = keep;
      disSwept = sweepPool;

      if (keep > 0) {
        pushMov(
          'ROLLOVER',
          'disfrute',
          'disfrute',
          keep,
          'Fase 1 (Emergencia incompleta): 50% acumulado en Disfrute',
        );
      }
      if (toEmergency > 0) {
        pushMov(
          'SWEEP',
          'disfrute',
          'emergencias',
          toEmergency,
          'Fase 1 (Emergencia incompleta): 50% barrido a Fondo de Emergencia',
        );
        runningEmergency = round2(runningEmergency + toEmergency);
        emergencyGap = round2(Math.max(0, target - runningEmergency));
        sweptToEmergency = round2(sweptToEmergency + toEmergency);
      }
      if (toInvestment > 0) {
        pushMov(
          'SWEEP',
          'disfrute',
          'ahorro_inversion',
          toInvestment,
          'Excedente Disfrute tras llenar Emergencia → Ahorro e Inversión',
        );
        sweptToInvestment = round2(sweptToInvestment + toInvestment);
      }
    } else {
      // Fase 2: 100% acumulado hasta el techo máximo (3 meses / $500)
      if (disBalance > effectiveDisCap) {
        const keep = effectiveDisCap;
        const excess = round2(disBalance - effectiveDisCap);
        disRolled = keep;
        disSwept = excess;

        if (keep > 0) {
          pushMov(
            'ROLLOVER',
            'disfrute',
            'disfrute',
            keep,
            `Fase 2: acumulado en Disfrute hasta techo (${effectiveDisCap})`,
          );
        }
        if (excess > 0) {
          pushMov(
            'SWEEP',
            'disfrute',
            'ahorro_inversion',
            excess,
            `Fase 2: excedente sobre techo de $${effectiveDisCap} → Ahorro e Inversión`,
          );
          sweptToInvestment = round2(sweptToInvestment + excess);
        }
      } else {
        disRolled = disBalance;
        pushMov(
          'ROLLOVER',
          'disfrute',
          'disfrute',
          disBalance,
          'Fase 2 (Emergencia al 100%): 100% acumulado en Disfrute',
        );
      }
    }
  } else {
    disRolled = disBalance;
  }

  // 3. CRECIMIENTO PERSONAL (ACCUMULATE)
  if (creBalance > 0) {
    creRolled = creBalance;
    pushMov(
      'ROLLOVER',
      'crecimiento_personal',
      'crecimiento_personal',
      creBalance,
      '100% acumulado sin techo en Crecimiento Personal',
    );
  } else {
    creRolled = creBalance;
  }

  // 3.5 PROVISIONES ANUALES (SINKING FUND - ACCUMULATE)
  if (provBalance > 0) {
    pushMov(
      'ROLLOVER',
      'provisiones_anuales',
      'provisiones_anuales',
      provBalance,
      '100% protegido en Provisiones Anuales (Sinking Fund)',
    );
  }

  // 4. AHORRO E INVERSION (INVESTMENT_POOL) & FONDO DE EMERGENCIA (TARGET_VAULT)
  if (ahoBalance > 0) {
    pushMov(
      'ROLLOVER',
      'ahorro_inversion',
      'ahorro_inversion',
      ahoBalance,
      'Saldo base mantenido en Ahorro e Inversión',
    );
  }
  if (initialEmergency > 0) {
    pushMov(
      'ROLLOVER',
      'emergencias',
      'emergencias',
      initialEmergency,
      'Saldo base mantenido en Fondo de Emergencia',
    );
  }

  const outcomes: MonthEndEnvelopeOutcome[] = [
    {
      id: 'imprescindibles',
      name: ENVELOPE_META.imprescindibles.name,
      rolloverRule: 'SWEEP_ALL',
      maxCap: 0,
      previousBalance: impBalance,
      rolledOverAmount: impRolled,
      sweptOutAmount: impSwept,
      receivedSweepAmount: 0,
      newBalance: impBalance < 0 ? impBalance : impRolled,
    },
    {
      id: 'disfrute',
      name: ENVELOPE_META.disfrute.name,
      rolloverRule: 'PHASED_CAP',
      maxCap: effectiveDisCap,
      previousBalance: disBalance,
      rolledOverAmount: disRolled,
      sweptOutAmount: disSwept,
      receivedSweepAmount: 0,
      newBalance: disBalance < 0 ? disBalance : disRolled,
    },
    {
      id: 'crecimiento_personal',
      name: ENVELOPE_META.crecimiento_personal.name,
      rolloverRule: 'ACCUMULATE',
      maxCap: null,
      previousBalance: creBalance,
      rolledOverAmount: creRolled,
      sweptOutAmount: 0,
      receivedSweepAmount: 0,
      newBalance: creBalance,
    },
    {
      id: 'provisiones_anuales',
      name: ENVELOPE_META.provisiones_anuales.name,
      rolloverRule: 'ACCUMULATE',
      maxCap: null,
      previousBalance: provBalance,
      rolledOverAmount: provBalance,
      sweptOutAmount: 0,
      receivedSweepAmount: sweptToAnnual,
      newBalance: round2(provBalance + sweptToAnnual),
    },
    {
      id: 'ahorro_inversion',
      name: ENVELOPE_META.ahorro_inversion.name,
      rolloverRule: 'INVESTMENT_POOL',
      maxCap: null,
      previousBalance: ahoBalance,
      rolledOverAmount: ahoBalance,
      sweptOutAmount: 0,
      receivedSweepAmount: sweptToInvestment,
      newBalance: round2(ahoBalance + sweptToInvestment),
    },
    {
      id: 'fondo_emergencia',
      name: 'Fondo de Emergencia',
      rolloverRule: 'TARGET_VAULT',
      maxCap: target > 0 ? target : null,
      previousBalance: initialEmergency,
      rolledOverAmount: initialEmergency,
      sweptOutAmount: 0,
      receivedSweepAmount: sweptToEmergency,
      newBalance: runningEmergency,
    },
  ];

  const totalSwept = round2(sweptToAnnual + sweptToEmergency + sweptToInvestment);
  const totalRolledOver = round2(
    Math.max(0, impRolled) +
      Math.max(0, disRolled) +
      Math.max(0, creRolled) +
      Math.max(0, provBalance) +
      Math.max(0, ahoBalance),
  );

  return {
    date,
    initialPhase,
    emergencyBefore: initialEmergency,
    emergencyAfter: runningEmergency,
    emergencyTarget: target,
    disfruteMaxCap: effectiveDisCap,
    totalSwept,
    totalSweptToEmergency: sweptToEmergency,
    totalSweptToInvestment: sweptToInvestment,
    totalRolledOver,
    movements,
    outcomes,
  };
}

/**
 * Convierte los barridos (SWEEP) calculados en pares de movimientos internos
 * para el ledger, respetando las custodias (efectivo, USDT, Bs) de cada sobre origen.
 */
export function buildLedgerMovementsFromSimulation(
  simulation: MonthEndSimulationResult,
  envelopes: EnvelopeSummary[],
  bcvRate: number | null,
): Omit<LedgerMovement, 'id'>[] {
  const custodyPools: Record<
    string,
    { efectivo_usd: number; binance_usdt: number; bolivares_pago_movil: number }
  > = {};

  for (const env of envelopes) {
    custodyPools[env.id] = {
      efectivo_usd: Math.max(0, env.byMethod.efectivo),
      binance_usdt: Math.max(0, env.byMethod.binance),
      bolivares_pago_movil: Math.max(0, env.byMethod.bolivares),
    };
  }

  const ledgerEntries: Omit<LedgerMovement, 'id'>[] = [];
  const sweeps = simulation.movements.filter((m) => m.type === 'SWEEP');

  for (const sw of sweeps) {
    let remaining = sw.amountUsd;
    const pool = custodyPools[sw.fromBucket];

    const slices: { method: PaymentMethod; amount: number }[] = [];
    if (pool) {
      const order: PaymentMethod[] = ['efectivo_usd', 'binance_usdt', 'bolivares_pago_movil'];
      for (const method of order) {
        if (remaining <= 0.005) break;
        const avail = pool[method as keyof typeof pool];
        if (avail > 0) {
          const take = round2(Math.min(remaining, avail));
          if (take > 0) {
            pool[method as keyof typeof pool] = round2(avail - take);
            remaining = round2(remaining - take);
            slices.push({ method, amount: take });
          }
        }
      }
    }

    if (remaining > 0.005) {
      slices.push({ method: 'efectivo_usd', amount: round2(remaining) });
    }

    for (const slice of slices) {
      const isBs = slice.method === 'bolivares_pago_movil' && Boolean(bcvRate && bcvRate > 0);
      const bsVal = isBs && bcvRate ? round2(slice.amount * bcvRate) : undefined;
      const toBucket: AssetBucketId =
        sw.toBucket === 'emergencias' && slice.method === 'binance_usdt'
          ? 'binance_usdc'
          : sw.toBucket;

      ledgerEntries.push({
        date: simulation.date,
        bucket: sw.fromBucket,
        type: 'Transferencia (Salida)',
        internalType: 'SWEEP',
        amountUsd: slice.amount,
        amountBs: bsVal,
        bcvRateUsed: isBs && bcvRate ? bcvRate : undefined,
        paymentMethod: slice.method,
        notes: `[SWEEP] ${sw.reason}`,
      });

      ledgerEntries.push({
        date: simulation.date,
        bucket: toBucket,
        type: 'Transferencia (Entrada)',
        internalType: 'SWEEP',
        amountUsd: slice.amount,
        amountBs: bsVal,
        bcvRateUsed: isBs && bcvRate ? bcvRate : undefined,
        paymentMethod: slice.method,
        notes: `[SWEEP] ${sw.reason}`,
      });
    }
  }

  return ledgerEntries;
}
