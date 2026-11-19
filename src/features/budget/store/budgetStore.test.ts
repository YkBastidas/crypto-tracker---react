import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeAnnualProvisionsTargetToday,
  simulateMonthEndRollover,
} from '../services/monthEndEngine';
import type { EnvelopeSummary, RecurringExpense } from '../types';
import { calculateEnvelopeSummaries, calculateFundSummaries } from '../utils/calculations';
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
        byMethod: { efectivo: 200, binance: 100, bolivares: 0 },
      },
      {
        id: 'disfrute',
        name: 'Disfrute',
        assigned: 150,
        spent: 0,
        available: 150,
        percentage: 25,
        byMethod: { efectivo: 150, binance: 0, bolivares: 0 },
      },
      {
        id: 'crecimiento_personal',
        name: 'Crecimiento Personal',
        assigned: 60,
        spent: 0,
        available: 60,
        percentage: 10,
        byMethod: { efectivo: 60, binance: 0, bolivares: 0 },
      },
      {
        id: 'provisiones_anuales',
        name: 'Provisiones Anuales',
        assigned: 100,
        spent: 0,
        available: 100,
        percentage: 15,
        byMethod: { efectivo: 100, binance: 0, bolivares: 0 },
      },
      {
        id: 'ahorro_inversion',
        name: 'Ahorro e Inversión',
        assigned: 0,
        spent: 0,
        available: 0,
        percentage: 0,
        byMethod: { efectivo: 0, binance: 0, bolivares: 0 },
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
});
