import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeAnnualProvisionsTargetToday,
  simulateMonthEndRollover,
} from '../services/monthEndEngine';
import type { EnvelopeSummary, RecurringExpense } from '../types';
import {
  calculateEnvelopeSummaries,
  calculateFundSummaries,
  calculateReadyToAssignAndRunway,
  getInstallmentPaymentHistory,
} from '../utils/calculations';
import { useBudgetStore } from './budgetStore';

describe('budget/store & monthEndEngine invariants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00'));
    useBudgetStore.getState().clearAllData();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes annual sinking fund target and executes 2-phase month-end sweep simulation', () => {
    const expenses: RecurringExpense[] = [
      {
        id: 'exp-anual',
        name: 'Seguro Anual',
        amountUsd: 240,
        frequency: 'anual',
        nextDueDate: '2026-12-18', // 30 days left -> 2 quincenas left -> target = 240 - 2*10 = 220
        envelopeId: 'provisiones_anuales',
        active: true,
      },
    ];

    const annualTarget = computeAnnualProvisionsTargetToday(expenses);
    expect(annualTarget.targetToday).toBeCloseTo(220, 2);

    const envelopes: EnvelopeSummary[] = [
      {
        id: 'imprescindibles',
        name: 'Imprescindibles',
        assigned: 300,
        spent: 0,
        available: 300,
        percentage: 50,
        byMethod: { efectivo: 200, binance: 100, bolivares: 0, custom: {} },
      },
      {
        id: 'disfrute',
        name: 'Disfrute',
        assigned: 150,
        spent: 0,
        available: 150,
        percentage: 25,
        byMethod: { efectivo: 150, binance: 0, bolivares: 0, custom: {} },
      },
      {
        id: 'crecimiento_personal',
        name: 'Crecimiento Personal',
        assigned: 60,
        spent: 0,
        available: 60,
        percentage: 10,
        byMethod: { efectivo: 60, binance: 0, bolivares: 0, custom: {} },
      },
      {
        id: 'provisiones_anuales',
        name: 'Provisiones Anuales',
        assigned: 100,
        spent: 0,
        available: 100,
        percentage: 15,
        byMethod: { efectivo: 100, binance: 0, bolivares: 0, custom: {} },
      },
      {
        id: 'ahorro_inversion',
        name: 'Ahorro e Inversión',
        assigned: 0,
        spent: 0,
        available: 0,
        percentage: 0,
        byMethod: { efectivo: 0, binance: 0, bolivares: 0, custom: {} },
      },
    ];

    const sim = simulateMonthEndRollover({
      envelopes,
      emergencyBalance: 400,
      emergencyTarget: 550, // gap = 150
      disfruteMaxCap: 50, // disfrute sweeps 100
      imprescindiblesReserve: 100, // keeps 100, sweeps 200
      annualProvisionsTopUp: 120, // takes 120 from imprescindibles sweep (leaves 80 for emergency)
      date: '2026-11-30',
    });

    // Imprescindibles sweeps 200 -> 120 to annual, 80 to emergency (gap left: 70).
    // Disfrute enters Phase 1 (emergency still incomplete): keeps 50% (75), sweeps 75 -> 70 to emergency + 5 to ahorro_inversion.
    // Total swept = 275 (120 annual + 150 emergency + 5 investment).
    expect(sim.initialPhase).toBe(1);
    expect(sim.totalSwept).toBeCloseTo(275, 2);
    expect(sim.totalSweptToEmergency).toBeCloseTo(150, 2);
    expect(sim.totalSweptToInvestment).toBeCloseTo(5, 2);
    expect(sim.emergencyAfter).toBeCloseTo(550, 2);
    expect(sim.outcomes.find((o) => o.id === 'disfrute')!.newBalance).toBeCloseTo(75, 2);
    expect(sim.outcomes.find((o) => o.id === 'crecimiento_personal')!.newBalance).toBeCloseTo(60, 2);
    expect(sim.outcomes.find((o) => o.id === 'provisiones_anuales')!.newBalance).toBeCloseTo(220, 2);

    // Phase 2 simulation (emergency already 100% funded): disfrute obeys disfruteMaxCap (50) and sweeps 100
    const simPhase2 = simulateMonthEndRollover({
      envelopes,
      emergencyBalance: 550,
      emergencyTarget: 550,
      disfruteMaxCap: 50,
      imprescindiblesReserve: 100,
      annualProvisionsTopUp: 120,
      date: '2026-11-30',
    });

    expect(simPhase2.initialPhase).toBe(2);
    expect(simPhase2.totalSwept).toBeCloseTo(300, 2); // 200 imp + 100 disfrute
    expect(simPhase2.totalSweptToEmergency).toBeCloseTo(0, 2);
    expect(simPhase2.totalSweptToInvestment).toBeCloseTo(180, 2); // 80 imp + 100 disfrute
    expect(simPhase2.outcomes.find((o) => o.id === 'disfrute')!.newBalance).toBeCloseTo(50, 2);
  });

  it('INVARIANT: multiEnvelopeCustodyExchange moves custody cleanly with 0 expense and intact net worth', () => {
    const store = useBudgetStore.getState();

    // Seed envelopes with USDT
    store.addMovement({
      date: '2026-11-10',
      bucket: 'imprescindibles',
      type: 'Ingreso a Sobre',
      amountUsd: 300,
      paymentMethod: 'binance_usdt',
    });
    store.addMovement({
      date: '2026-11-10',
      bucket: 'disfrute',
      type: 'Ingreso a Sobre',
      amountUsd: 200,
      paymentMethod: 'binance_usdt',
    });
    store.addMovement({
      date: '2026-11-10',
      bucket: 'crecimiento_personal',
      type: 'Ingreso a Sobre',
      amountUsd: 100,
      paymentMethod: 'binance_usdt',
    });

    const beforeFunds = calculateFundSummaries(useBudgetStore.getState().movements);
    expect(beforeFunds.totalNetWorth).toBeCloseTo(600, 2);
    expect(beforeFunds.funds.find((f) => f.id === 'inversiones_binance')!.balance).toBeCloseTo(600, 2);
    expect(beforeFunds.funds.find((f) => f.id === 'efectivo_sobres')!.balance).toBeCloseTo(0, 2);

    // Exchange 500 USDT -> 500 Cash across all 3 envelopes in one atomic operation
    useBudgetStore.getState().multiEnvelopeCustodyExchange({
      date: '2026-11-18',
      fromPaymentMethod: 'binance_usdt',
      toPaymentMethod: 'efectivo_usd',
      allocations: [
        { bucket: 'imprescindibles', amountFrom: 250, amountTo: 250 },
        { bucket: 'disfrute', amountFrom: 150, amountTo: 150 },
        { bucket: 'crecimiento_personal', amountFrom: 100, amountTo: 100 },
      ],
      notes: 'Cambio con amigo',
    });

    const afterState = useBudgetStore.getState();
    const afterFunds = calculateFundSummaries(afterState.movements);
    const afterEnvs = calculateEnvelopeSummaries(afterState.movements);

    // Net worth unchanged; 500 moved from Binance fund to Cash fund
    expect(afterFunds.totalNetWorth).toBeCloseTo(600, 2);
    expect(afterFunds.funds.find((f) => f.id === 'inversiones_binance')!.balance).toBeCloseTo(100, 2);
    expect(afterFunds.funds.find((f) => f.id === 'efectivo_sobres')!.balance).toBeCloseTo(500, 2);

    // Envelope available balances unchanged, zero spent, custody updated
    expect(afterEnvs.every((e) => e.spent === 0)).toBe(true);
    const imp = afterEnvs.find((e) => e.id === 'imprescindibles')!;
    expect(imp.available).toBeCloseTo(300, 2);
    expect(imp.byMethod.efectivo).toBeCloseTo(250, 2);
    expect(imp.byMethod.binance).toBeCloseTo(50, 2);

    // Memento Undo restores exact pre-exchange custody
    useBudgetStore.getState().undoLastAction();
    const undoneFunds = calculateFundSummaries(useBudgetStore.getState().movements);
    expect(undoneFunds.funds.find((f) => f.id === 'inversiones_binance')!.balance).toBeCloseTo(600, 2);
    expect(undoneFunds.funds.find((f) => f.id === 'efectivo_sobres')!.balance).toBeCloseTo(0, 2);
  });

  it('restores linked expenses and installments on Undo and removeMovement', () => {
    const store = useBudgetStore.getState();
    store.addExpense({
      name: 'Netflix',
      amountUsd: 15,
      frequency: 'mensual',
      nextDueDate: '2026-11-20',
      envelopeId: 'disfrute',
      preferredPaymentMethod: 'efectivo_usd',
      active: true,
    });
    store.addMovement({
      date: '2026-11-01',
      bucket: 'disfrute',
      type: 'Ingreso a Sobre',
      amountUsd: 100,
      paymentMethod: 'efectivo_usd',
    });

    const exp = useBudgetStore.getState().expenses[0];
    useBudgetStore.getState().markExpensePaid(exp.id, {
      logToLedger: true,
      paymentMethod: 'efectivo_usd',
      amountUsd: 15,
    });

    let current = useBudgetStore.getState();
    expect(current.expenses[0].nextDueDate).toBe('2026-12-20');
    expect(calculateEnvelopeSummaries(current.movements).find((e) => e.id === 'disfrute')!.available).toBeCloseTo(85, 2);

    // removeMovement should revert the expense due date and refund the envelope balance
    const paymentMov = current.movements.find((m) => m.linkedExpense?.id === exp.id)!;
    useBudgetStore.getState().removeMovement(paymentMov.id);

    current = useBudgetStore.getState();
    expect(current.expenses[0].nextDueDate).toBe('2026-11-20');
    expect(calculateEnvelopeSummaries(current.movements).find((e) => e.id === 'disfrute')!.available).toBeCloseTo(100, 2);

    // Undo restores the deleted payment and advanced due date
    useBudgetStore.getState().undoLastAction();
    current = useBudgetStore.getState();
    expect(current.expenses[0].nextDueDate).toBe('2026-12-20');
    expect(calculateEnvelopeSummaries(current.movements).find((e) => e.id === 'disfrute')!.available).toBeCloseTo(85, 2);

    // Executing markExpensePaid and immediately calling undoLastAction reverts both due date and balance
    useBudgetStore.getState().markExpensePaid(exp.id, {
      logToLedger: true,
      paymentMethod: 'efectivo_usd',
      amountUsd: 15,
    });
    expect(useBudgetStore.getState().expenses[0].nextDueDate).toBe('2027-01-20');
    useBudgetStore.getState().undoLastAction();
    current = useBudgetStore.getState();
    expect(current.expenses[0].nextDueDate).toBe('2026-12-20');
    expect(calculateEnvelopeSummaries(current.movements).find((e) => e.id === 'disfrute')!.available).toBeCloseTo(85, 2);
  });

  it('INVARIANT: applyMonthEndRollover sweeps custody-aware movements and undoLastAction restores exact prior balances', () => {
    const store = useBudgetStore.getState();
    store.addMovement({
      date: '2026-11-01',
      bucket: 'imprescindibles',
      type: 'Ingreso a Sobre',
      amountUsd: 300,
      paymentMethod: 'efectivo_usd',
    });
    store.addMovement({
      date: '2026-11-01',
      bucket: 'emergencias',
      type: 'Ingreso a Sobre',
      amountUsd: 100,
      paymentMethod: 'efectivo_usd',
    });

    const envsBefore = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    const fundsBefore = calculateFundSummaries(useBudgetStore.getState().movements);

    const sim = simulateMonthEndRollover({
      envelopes: envsBefore,
      emergencyBalance: 100,
      emergencyTarget: 250,
      disfruteMaxCap: 500,
      imprescindiblesReserve: 100,
      annualProvisionsTopUp: 0,
      date: '2026-11-30',
    });

    useBudgetStore.getState().applyMonthEndRollover(sim, envsBefore);
    const afterFunds = calculateFundSummaries(useBudgetStore.getState().movements);
    const afterEnvs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);

    expect(afterFunds.totalNetWorth).toBeCloseTo(fundsBefore.totalNetWorth, 2);
    expect(afterFunds.funds.find((f) => f.id === 'fondo_emergencia')!.balance).toBeCloseTo(250, 2);
    expect(afterEnvs.find((e) => e.id === 'imprescindibles')!.available).toBeCloseTo(100, 2);
    expect(afterEnvs.find((e) => e.id === 'ahorro_inversion')!.available).toBeCloseTo(50, 2);

    // Undo restores exact prior balances to the cent
    useBudgetStore.getState().undoLastAction();
    const undoneEnvs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    const undoneFunds = calculateFundSummaries(useBudgetStore.getState().movements);
    expect(undoneFunds.funds.find((f) => f.id === 'fondo_emergencia')!.balance).toBeCloseTo(100, 2);
    expect(undoneEnvs.find((e) => e.id === 'imprescindibles')!.available).toBeCloseTo(300, 2);
    expect(undoneEnvs.find((e) => e.id === 'ahorro_inversion')!.available).toBeCloseTo(0, 2);
  });

  it('recordCryptoPortfolioUsdtFlow prioritizes Ahorro USDT, supports cascading overdraft, and Undo restores atomically', () => {
    const store = useBudgetStore.getState();
    store.addMovement({
      date: '2026-11-10',
      bucket: 'ahorro_inversion',
      type: 'Ingreso a Sobre',
      amountUsd: 100,
      paymentMethod: 'binance_usdt',
    });
    store.addMovement({
      date: '2026-11-10',
      bucket: 'binance_usdt',
      type: 'Transferencia (Entrada)',
      amountUsd: 50,
      paymentMethod: 'binance_usdt',
    });
    store.addMovement({
      date: '2026-11-10',
      bucket: 'disfrute',
      type: 'Ingreso a Sobre',
      amountUsd: 80,
      paymentMethod: 'binance_usdt',
    });
    store.addMovement({
      date: '2026-11-10',
      bucket: 'imprescindibles',
      type: 'Ingreso a Sobre',
      amountUsd: 120,
      paymentMethod: 'binance_usdt',
    });

    // Spend $200 with allowOverdraftFromOtherEnvelopes: true ->
    // takes $100 from ahorro_inversion, $50 from unassigned binance_usdt, $50 from disfrute ($30 left in disfrute)
    useBudgetStore.getState().recordCryptoPortfolioUsdtFlow({
      date: '2026-11-18',
      direction: 'out',
      amountUsd: 200,
      notes: 'Compra Crypto BTC',
      allowOverdraftFromOtherEnvelopes: true,
    });

    const envs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    const funds = calculateFundSummaries(useBudgetStore.getState().movements);

    expect(envs.find((e) => e.id === 'ahorro_inversion')!.byMethod.binance).toBeCloseTo(0, 2);
    expect(envs.find((e) => e.id === 'disfrute')!.byMethod.binance).toBeCloseTo(30, 2);
    expect(envs.find((e) => e.id === 'imprescindibles')!.byMethod.binance).toBeCloseTo(120, 2);
    expect(
      funds.funds.find((f) => f.id === 'inversiones_binance')?.breakdown?.find((b) => b.label === 'USDT')?.amount,
    ).toBeCloseTo(150, 2);

    // Memento Undo restores all cascading entries at once
    useBudgetStore.getState().undoLastAction();
    const undoneEnvs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    expect(undoneEnvs.find((e) => e.id === 'ahorro_inversion')!.byMethod.binance).toBeCloseTo(100, 2);
    expect(undoneEnvs.find((e) => e.id === 'disfrute')!.byMethod.binance).toBeCloseTo(80, 2);
  });

  it('recordCryptoPortfolioUsdcFlow updates Emergency Fund USDC balance in both directions', () => {
    useBudgetStore.getState().recordCryptoPortfolioUsdcFlow({
      date: '2026-11-18',
      direction: 'in',
      amountUsd: 250,
      notes: 'Emergencia USDC (Deposit)',
    });

    let funds = calculateFundSummaries(useBudgetStore.getState().movements);
    expect(
      funds.funds.find((f) => f.id === 'fondo_emergencia')?.breakdown?.find((b) => b.label === 'USDC')?.amount,
    ).toBeCloseTo(250, 2);

    useBudgetStore.getState().recordCryptoPortfolioUsdcFlow({
      date: '2026-11-18',
      direction: 'out',
      amountUsd: 100,
      notes: 'Emergencia USDC (Withdraw)',
    });

    funds = calculateFundSummaries(useBudgetStore.getState().movements);
    expect(
      funds.funds.find((f) => f.id === 'fondo_emergencia')?.breakdown?.find((b) => b.label === 'USDC')?.amount,
    ).toBeCloseTo(150, 2);
  });

  it('routes Bs expenses to free Bs pool without leaving envelopes negative when freeBsPoolMode is enabled, and supports atomic removal', () => {
    const store = useBudgetStore.getState();
    store.setManualBcvRate(948.35);
    expect(store.freeBsPoolMode).toBe(true);

    // Exchanged 20,000 Bs ($21.09) into free Bs bank float, plus $5 partial Bs inside Disfrute & $50 Efectivo in Disfrute
    store.addMovement({
      date: '2026-11-19',
      bucket: 'banco_bolivares',
      type: 'Transferencia (Entrada)',
      amountUsd: 16.09,
      amountBs: 15258.95,
      bcvRateUsed: 948.35,
      paymentMethod: 'bolivares_pago_movil',
      notes: 'Cambio USDT a Bs saldo libre',
    });
    store.addMovement({
      date: '2026-11-19',
      bucket: 'disfrute',
      type: 'Ingreso a Sobre',
      amountUsd: 5,
      amountBs: 4741.75,
      bcvRateUsed: 948.35,
      paymentMethod: 'bolivares_pago_movil',
    });
    store.addMovement({
      date: '2026-11-19',
      bucket: 'disfrute',
      type: 'Ingreso a Sobre',
      amountUsd: 50,
      paymentMethod: 'efectivo_usd',
    });

    useBudgetStore.getState().addExpense({
      name: 'Cena en Bs',
      amountUsd: 20,
      frequency: 'mensual',
      nextDueDate: '2026-11-20',
      envelopeId: 'disfrute',
      preferredPaymentMethod: 'bolivares_pago_movil',
      active: true,
    });
    const exp = useBudgetStore.getState().expenses[0];

    // Pay $20 (18,967 Bs) from Disfrute -> consumes $5 from Disfrute Bs + $15 from banco_bolivares free float
    useBudgetStore.getState().markExpensePaid(exp.id, {
      logToLedger: true,
      paymentMethod: 'bolivares_pago_movil',
      amountUsd: 20,
      amountBs: 18967,
      bcvRateUsed: 948.35,
      envelopeId: 'disfrute',
    });

    const stateAfter = useBudgetStore.getState();
    const { funds, envelopes } = calculateFundSummaries(
      stateAfter.movements,
      948.35,
      [],
      undefined,
      { freeBsPoolMode: true },
    );
    const disfrute = envelopes.find((e) => e.id === 'disfrute')!;
    const bsFund = funds.find((f) => f.id === 'cuenta_bolivares')!;

    expect(disfrute.byMethod.bolivares).toBeCloseTo(0, 2); // Never negative!
    expect(disfrute.available).toBeCloseTo(50, 2); // Physical $50 in Disfrute intact
    expect(bsFund.balanceBs).toBeCloseTo(20000.7 - 18967, 1); // Leftover petty cash stays in banco_bolivares

    // Deleting either leg of the split removes the entire split expense atomically and reverts due date
    const splitLeg = stateAfter.movements.find((m) => m.bucket === 'banco_bolivares' && m.splitGroupId)!;
    useBudgetStore.getState().removeMovement(splitLeg.id);
    expect(useBudgetStore.getState().expenses[0].nextDueDate).toBe('2026-11-20');
    const restoredEnvs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    expect(restoredEnvs.find((e) => e.id === 'disfrute')!.byMethod.bolivares).toBeCloseTo(5, 2);

    // With strict mode disabled, spending $20 Bs without routing leaves disfrute Bs negative (-$15)
    useBudgetStore.getState().setFreeBsPoolMode(false);
    useBudgetStore.getState().markExpensePaid(exp.id, {
      logToLedger: true,
      paymentMethod: 'bolivares_pago_movil',
      amountUsd: 20,
      amountBs: 18967,
      bcvRateUsed: 948.35,
      envelopeId: 'disfrute',
    });
    const strictEnvs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    expect(strictEnvs.find((e) => e.id === 'disfrute')!.byMethod.bolivares).toBeCloseTo(-15, 2);
  });

  it('assigns custom account balance to an envelope keeping custody, supports native overrides undo/snapshot, and remaps deleted custom custody safely', () => {
    const store = useBudgetStore.getState();
    const bancamigaId = store.addCustomAccount({
      name: 'Bancamiga Cash',
      currency: 'USD',
      initialBalance: 10.2,
    });

    // Unassigned $10.20 in Bancamiga appears in Ready to Assign
    let current = useBudgetStore.getState();
    const rtaBefore = calculateReadyToAssignAndRunway({
      movements: current.movements,
      expenses: current.expenses,
      installments: current.installments,
      customAccounts: current.customAccounts,
    });
    expect(rtaBefore.totalReadyToAssignUsd).toBeCloseTo(10.2, 2);

    // Quick-assign from Bancamiga (unassigned) -> Disfrute preserving Bancamiga custody
    useBudgetStore.getState().transferBetweenBuckets({
      date: '2026-11-20',
      fromBucket: bancamigaId,
      toBucket: 'disfrute',
      fromPaymentMethod: bancamigaId,
      toPaymentMethod: bancamigaId,
      amountFrom: 10.2,
      amountTo: 10.2,
      notes: 'Asignación rápida (Por Asignar)',
    });

    current = useBudgetStore.getState();
    const rtaAfter = calculateReadyToAssignAndRunway({
      movements: current.movements,
      expenses: current.expenses,
      installments: current.installments,
      customAccounts: current.customAccounts,
    });
    expect(rtaAfter.totalReadyToAssignUsd).toBeCloseTo(0, 2);

    const { funds, envelopes } = calculateFundSummaries(
      current.movements,
      null,
      current.customAccounts,
    );
    expect(envelopes.find((e) => e.id === 'disfrute')!.available).toBeCloseTo(10.2, 2);
    expect(envelopes.find((e) => e.id === 'disfrute')!.byMethod.custom[bancamigaId]).toBeCloseTo(10.2, 2);
    expect(funds.find((f) => f.id === bancamigaId)!.balance).toBeCloseTo(10.2, 2);

    // Native account customization + Undo + snapshot roundtrip
    useBudgetStore.getState().updateNativeAccount('cuenta_bolivares', { hidden: true });
    expect(useBudgetStore.getState().nativeAccountOverrides.cuenta_bolivares?.hidden).toBe(true);
    const snap = useBudgetStore.getState().exportSnapshot();
    expect(snap.nativeAccountOverrides?.cuenta_bolivares?.hidden).toBe(true);
    useBudgetStore.getState().undoLastAction();
    expect(useBudgetStore.getState().nativeAccountOverrides.cuenta_bolivares).toBeUndefined();
    useBudgetStore.getState().importSnapshot(snap);
    expect(useBudgetStore.getState().nativeAccountOverrides.cuenta_bolivares?.hidden).toBe(true);

    // Deleting custom account remaps envelope movements to 'otro' instead of losing Disfrute balance
    useBudgetStore.getState().removeCustomAccount(bancamigaId);
    const afterDeleteEnvs = calculateEnvelopeSummaries(useBudgetStore.getState().movements);
    expect(afterDeleteEnvs.find((e) => e.id === 'disfrute')!.available).toBeCloseTo(10.2, 2);
  });

  it('records off-ledger in-kind debt settlements with date & notes without touching envelopes or net worth, and supports Undo', () => {
    const store = useBudgetStore.getState();
    store.addMovement({
      date: '2026-11-01',
      bucket: 'ahorro_inversion',
      type: 'Ingreso a Sobre',
      amountUsd: 100,
      paymentMethod: 'efectivo_usd',
    });
    store.addInstallment({
      name: 'Deuda Hermano',
      direction: 'receivable',
      installmentAmount: 50,
      frequency: 'semanal',
      maxCap: 300,
      paidTotal: 0,
      paymentsCount: 0,
      nextDueDate: '2026-11-25',
    });

    const plan = useBudgetStore.getState().installments[0];
    const movCountBefore = useBudgetStore.getState().movements.length;
    const fundsBefore = calculateFundSummaries(useBudgetStore.getState().movements);
    const envsBefore = calculateEnvelopeSummaries(useBudgetStore.getState().movements);

    useBudgetStore.getState().recordInstallmentPayment(plan.id, {
      amountOverride: 120,
      settlementKind: 'in_kind',
      date: '2026-11-20',
      notes: 'Trueque reloj',
    });

    let afterState = useBudgetStore.getState();
    let updatedPlan = afterState.installments[0];
    expect(updatedPlan.paidTotal).toBeCloseTo(120, 2);
    expect(updatedPlan.paymentsCount).toBe(1);
    expect(updatedPlan.lastPaidDate).toBe('2026-11-20');
    expect(updatedPlan.nextDueDate).toBe('2026-11-25'); // in_kind preserves nextDueDate by default
    expect(updatedPlan.paymentHistory).toHaveLength(1);
    expect(updatedPlan.paymentHistory![0]).toMatchObject({
      date: '2026-11-20',
      amountUsd: 120,
      settlementKind: 'in_kind',
      notes: 'Trueque reloj',
    });

    // Movements, Net Worth, and Envelopes remain 100% invariant
    expect(afterState.movements).toHaveLength(movCountBefore);
    const fundsAfter = calculateFundSummaries(afterState.movements);
    const envsAfter = calculateEnvelopeSummaries(afterState.movements);
    expect(fundsAfter.totalNetWorth).toBeCloseTo(fundsBefore.totalNetWorth, 2);
    expect(envsAfter.find((e) => e.id === 'ahorro_inversion')!.available).toBeCloseTo(
      envsBefore.find((e) => e.id === 'ahorro_inversion')!.available,
      2,
    );

    // Memento Undo reverts in-kind settlement completely
    useBudgetStore.getState().undoLastAction();
    afterState = useBudgetStore.getState();
    updatedPlan = afterState.installments[0];
    expect(updatedPlan.paidTotal).toBeCloseTo(0, 2);
    expect(updatedPlan.paymentsCount).toBe(0);
    expect(updatedPlan.lastPaidDate).toBeUndefined();
    expect(updatedPlan.paymentHistory ?? []).toHaveLength(0);

    // Opt-in advanceDueDate: true advances nextDueDate on in_kind too
    useBudgetStore.getState().recordInstallmentPayment(plan.id, {
      amountOverride: 120,
      settlementKind: 'in_kind',
      date: '2026-11-20',
      notes: 'Trueque reloj',
      advanceDueDate: true,
    });
    expect(useBudgetStore.getState().installments[0].nextDueDate).toBe('2026-12-02');
  });

  it('merges plan paymentHistory & legacy ledger movements, syncs note edits, deletes bidirectionally, and preserves history across snapshot roundtrip', () => {
    const store = useBudgetStore.getState();
    store.addInstallment({
      name: 'Préstamo Amigo',
      direction: 'receivable',
      installmentAmount: 50,
      frequency: 'semanal',
      maxCap: 400,
      paidTotal: 100, // $100 pre-existing unlogged prior balance across 2 payments
      paymentsCount: 2,
      nextDueDate: '2026-11-25',
    });

    const planId = useBudgetStore.getState().installments[0].id;

    // Simulate a legacy ledger-linked payment already present without paymentHistory
    store.addMovement({
      date: '2026-11-12',
      bucket: 'ahorro_inversion',
      type: 'Ingreso a Sobre',
      amountUsd: 40,
      paymentMethod: 'efectivo_usd',
      notes: 'Cobro #1: Préstamo Amigo',
      linkedInstallment: {
        id: planId,
        amount: 40,
      },
    });
    // Adjust plan paidTotal/paymentsCount as legacy data would look
    useBudgetStore.getState().updateInstallment(planId, {
      paidTotal: 140,
      paymentsCount: 3,
    });

    // Record a new monetary payment with note + an in-kind payment
    useBudgetStore.getState().recordInstallmentPayment(planId, {
      amountOverride: 60,
      settlementKind: 'monetary',
      date: '2026-11-18',
      notes: 'Efectivo entregado en mano',
      envelopeId: 'ahorro_inversion',
      paymentMethod: 'efectivo_usd',
    });
    useBudgetStore.getState().recordInstallmentPayment(planId, {
      amountOverride: 120,
      settlementKind: 'in_kind',
      date: '2026-11-20',
      notes: 'Trueque reloj',
    });

    let current = useBudgetStore.getState();
    const summary = getInstallmentPaymentHistory(current.installments[0], current.movements);
    expect(summary.records).toHaveLength(3); // No duplicate counting between paymentHistory & legacy mov
    expect(summary.inKindTotalUsd).toBeCloseTo(120, 2);
    expect(summary.monetaryTotalUsd).toBeCloseTo(100, 2); // 60 + 40 legacy
    expect(summary.loggedTotalUsd).toBeCloseTo(220, 2);
    expect(summary.unloggedTotalUsd).toBeCloseTo(100, 2); // 320 total - 220 logged = 100
    expect(summary.unloggedCount).toBe(2); // 5 count - 3 logged = 2

    // Edit note on monetary plan payment -> updates both paymentHistory & linked ledger movement
    const monetaryRecord = summary.records.find((r) => r.amountUsd === 60)!;
    useBudgetStore
      .getState()
      .updateInstallmentPaymentNote(planId, monetaryRecord.id, 'Efectivo verificado');
    current = useBudgetStore.getState();
    expect(
      current.installments[0].paymentHistory!.find((r) => r.id === monetaryRecord.id)!.notes,
    ).toBe('Efectivo verificado');
    const linkedMov = current.movements.find((m) => m.id === monetaryRecord.linkedMovementId)!;
    expect(linkedMov.notes).toContain('Efectivo verificado');
    expect(linkedMov.linkedInstallment?.note).toBe('Efectivo verificado');

    // Edit note on legacy ledger-only movement
    const legacyRecord = summary.records.find((r) => r.source === 'legacy_ledger')!;
    useBudgetStore
      .getState()
      .updateInstallmentPaymentNote(planId, legacyRecord.id, 'Abono inicial noviembre');
    current = useBudgetStore.getState();
    expect(current.movements.find((m) => m.id === legacyRecord.id)!.notes).toContain(
      'Abono inicial noviembre',
    );

    // Export/import snapshot roundtrip preserves paymentHistory
    const snap = useBudgetStore.getState().exportSnapshot();
    useBudgetStore.getState().clearAllData();
    expect(useBudgetStore.getState().importSnapshot(snap)).toBe(true);
    expect(useBudgetStore.getState().installments[0].paymentHistory).toHaveLength(2);

    // Removing the monetary payment removes both paymentHistory record and linked movement without double-decrement
    useBudgetStore.getState().removeInstallmentPayment(planId, monetaryRecord.id);
    current = useBudgetStore.getState();
    expect(current.installments[0].paidTotal).toBeCloseTo(260, 2); // 320 - 60
    expect(current.installments[0].paymentsCount).toBe(4);
    expect(current.installments[0].nextDueDate).toBe('2026-11-25'); // Reverted from 2026-12-02
    expect(current.movements.some((m) => m.id === monetaryRecord.linkedMovementId)).toBe(false);

    // Deleting the legacy ledger movement directly via removeMovement also updates plan counts safely
    useBudgetStore.getState().removeMovement(legacyRecord.id);
    current = useBudgetStore.getState();
    expect(current.installments[0].paidTotal).toBeCloseTo(220, 2); // 260 - 40
    expect(current.installments[0].paymentsCount).toBe(3);
  });

  it('backfills historical payments from unlogged prior balance and preserves exact inverses across overflow edits and deletes', () => {
    const store = useBudgetStore.getState();
    store.addInstallment({
      name: 'Deuda Hermano Histórica',
      direction: 'receivable',
      installmentAmount: 50,
      frequency: 'semanal',
      maxCap: 400,
      paidTotal: 100, // $100 pre-existing unlogged prior balance across 2 payments
      paymentsCount: 2,
      nextDueDate: '2026-11-25',
    });

    const planId = useBudgetStore.getState().installments[0].id;
    const fundsBefore = calculateFundSummaries(useBudgetStore.getState().movements);

    // 1. Backfill $40 historical payment from unlogged prior balance
    useBudgetStore.getState().recordInstallmentPayment(planId, {
      settlementKind: 'historical',
      date: '2026-10-05',
      amountOverride: 40,
      notes: 'Primer abono en efectivo',
      allocateFromUnlogged: true,
    });

    let current = useBudgetStore.getState();
    let plan = current.installments[0];
    expect(plan.paidTotal).toBeCloseTo(100, 2); // Did not double-count!
    expect(plan.paymentsCount).toBe(2);
    expect(plan.nextDueDate).toBe('2026-11-25');
    expect(current.movements).toHaveLength(0);
    expect(calculateFundSummaries(current.movements).totalNetWorth).toBeCloseTo(
      fundsBefore.totalNetWorth,
      2,
    );

    let summary = getInstallmentPaymentHistory(plan, current.movements);
    expect(summary.historicalTotalUsd).toBeCloseTo(40, 2);
    expect(summary.unloggedTotalUsd).toBeCloseTo(60, 2);
    expect(summary.unloggedCount).toBe(1);

    // Deleting the backfilled record restores unloggedTotalUsd without subtracting from paidTotal
    const histId1 = plan.paymentHistory![0].id;
    useBudgetStore.getState().removeInstallmentPayment(planId, histId1);
    current = useBudgetStore.getState();
    plan = current.installments[0];
    expect(plan.paidTotal).toBeCloseTo(100, 2);
    expect(plan.paymentsCount).toBe(2);
    summary = getInstallmentPaymentHistory(plan, current.movements);
    expect(summary.unloggedTotalUsd).toBeCloseTo(100, 2);
    expect(summary.unloggedCount).toBe(2);

    // 2. Overflow backfill: log $150 when only $100 unlogged remains -> absorbs $100 and adds $50
    useBudgetStore.getState().recordInstallmentPayment(planId, {
      settlementKind: 'historical',
      date: '2026-10-12',
      amountOverride: 150,
      notes: 'Abono acumulado octubre',
      allocateFromUnlogged: true,
    });

    current = useBudgetStore.getState();
    plan = current.installments[0];
    expect(plan.paidTotal).toBeCloseTo(150, 2);
    expect(plan.paymentsCount).toBe(2); // absorbed 1 unlogged count
    expect(plan.paymentHistory![0].absorbedUnloggedUsd).toBeCloseTo(100, 2);
    summary = getInstallmentPaymentHistory(plan, current.movements);
    expect(summary.unloggedTotalUsd).toBeCloseTo(0, 2);
    expect(summary.unloggedCount).toBe(1);

    // Editing down from $150 -> $80 reduces netAdded first ($50) and returns $20 to unloggedTotalUsd
    const histId2 = plan.paymentHistory![0].id;
    useBudgetStore.getState().updateInstallmentPayment(planId, histId2, {
      date: '2026-10-10',
      amountUsd: 80,
      notes: 'Ajustado octubre',
      settlementKind: 'in_kind',
    });
    current = useBudgetStore.getState();
    plan = current.installments[0];
    expect(plan.paidTotal).toBeCloseTo(100, 2);
    expect(plan.lastPaidDate).toBe('2026-10-10');
    expect(plan.paymentHistory![0]).toMatchObject({
      date: '2026-10-10',
      amountUsd: 80,
      notes: 'Ajustado octubre',
      settlementKind: 'in_kind',
      absorbedUnloggedUsd: 80,
    });
    expect(getInstallmentPaymentHistory(plan, current.movements).unloggedTotalUsd).toBeCloseTo(20, 2);

    // Removing the edited $80 absorbed record leaves paidTotal at $100 and restores $100 unlogged
    useBudgetStore.getState().removeInstallmentPayment(planId, histId2);
    current = useBudgetStore.getState();
    expect(current.installments[0].paidTotal).toBeCloseTo(100, 2);
    expect(
      getInstallmentPaymentHistory(current.installments[0], current.movements).unloggedTotalUsd,
    ).toBeCloseTo(100, 2);
  });

  it('edits date, amount, and note on monetary & legacy ledger payments with bidirectional ledger sync and Undo', () => {
    const store = useBudgetStore.getState();
    store.addInstallment({
      name: 'Préstamo Coche',
      direction: 'receivable',
      installmentAmount: 50,
      frequency: 'semanal',
      maxCap: 500,
      paidTotal: 0,
      paymentsCount: 0,
      nextDueDate: '2026-11-25',
    });

    const planId = useBudgetStore.getState().installments[0].id;

    // Legacy ledger-only movement
    store.addMovement({
      date: '2026-11-05',
      bucket: 'ahorro_inversion',
      type: 'Ingreso a Sobre',
      amountUsd: 40,
      paymentMethod: 'efectivo_usd',
      notes: 'Cobro #1: Préstamo Coche',
      linkedInstallment: {
        id: planId,
        amount: 40,
      },
    });
    useBudgetStore.getState().updateInstallment(planId, {
      paidTotal: 40,
      paymentsCount: 1,
      lastPaidDate: '2026-11-05',
    });
    const legacyMovId = useBudgetStore.getState().movements[0].id;

    // Newer tracked monetary payment
    useBudgetStore.getState().recordInstallmentPayment(planId, {
      amountOverride: 60,
      settlementKind: 'monetary',
      date: '2026-11-18',
      notes: 'Efectivo entregado',
      envelopeId: 'ahorro_inversion',
      paymentMethod: 'efectivo_usd',
    });

    let current = useBudgetStore.getState();
    const monetaryRecId = current.installments[0].paymentHistory![0].id;
    const linkedMovId = current.installments[0].paymentHistory![0].linkedMovementId!;

    // Edit date, amount, and note on the tracked monetary payment
    useBudgetStore.getState().updateInstallmentPayment(planId, monetaryRecId, {
      date: '2026-11-14',
      amountUsd: 75,
      notes: 'Transferencia confirmada',
    });

    current = useBudgetStore.getState();
    expect(current.installments[0].paidTotal).toBeCloseTo(115, 2); // 40 + 75
    expect(current.installments[0].lastPaidDate).toBe('2026-11-14');
    expect(current.installments[0].paymentHistory![0]).toMatchObject({
      date: '2026-11-14',
      amountUsd: 75,
      notes: 'Transferencia confirmada',
    });

    const updatedLinkedMov = current.movements.find((m) => m.id === linkedMovId)!;
    expect(updatedLinkedMov.date).toBe('2026-11-14');
    expect(updatedLinkedMov.amountUsd).toBeCloseTo(75, 2);
    expect(updatedLinkedMov.linkedInstallment?.amount).toBeCloseTo(75, 2);
    expect(updatedLinkedMov.linkedInstallment?.note).toBe('Transferencia confirmada');
    expect(updatedLinkedMov.notes).toContain('Transferencia confirmada');

    // Envelope reflects updated monetary amount ($40 + $75 = $115)
    let envs = calculateEnvelopeSummaries(current.movements);
    expect(envs.find((e) => e.id === 'ahorro_inversion')!.available).toBeCloseTo(115, 2);

    // Undo reverts edit atomically across plan & ledger
    useBudgetStore.getState().undoLastAction();
    current = useBudgetStore.getState();
    expect(current.installments[0].paidTotal).toBeCloseTo(100, 2);
    expect(current.installments[0].lastPaidDate).toBe('2026-11-18');
    expect(current.movements.find((m) => m.id === linkedMovId)!.amountUsd).toBeCloseTo(60, 2);

    // Edit legacy ledger-only payment (date, amount, note)
    useBudgetStore.getState().updateInstallmentPayment(planId, legacyMovId, {
      date: '2026-11-22',
      amountUsd: 55,
      notes: 'Corrección abono inicial',
    });
    current = useBudgetStore.getState();
    expect(current.installments[0].paidTotal).toBeCloseTo(115, 2); // 55 + 60
    expect(current.installments[0].lastPaidDate).toBe('2026-11-22'); // 11-22 > 11-18
    const editedLegacy = current.movements.find((m) => m.id === legacyMovId)!;
    expect(editedLegacy.date).toBe('2026-11-22');
    expect(editedLegacy.amountUsd).toBeCloseTo(55, 2);
    expect(editedLegacy.notes).toContain('Corrección abono inicial');

    envs = calculateEnvelopeSummaries(current.movements);
    expect(envs.find((e) => e.id === 'ahorro_inversion')!.available).toBeCloseTo(115, 2);
  });
});
