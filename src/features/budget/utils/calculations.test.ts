import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinHolding } from '../../../shared/types';
import type {
  CustomAccount,
  EnvelopeRule,
  InstallmentPlan,
  LedgerMovement,
  NativeAccountOverrides,
  RecurringExpense,
} from '../types';
import {
  advanceDueDate,
  calculateEligibleInvestmentCapital,
  calculateEnvelopeSummaries,
  calculateFundSummaries,
  calculateFxGapSummary,
  calculateReadyToAssignAndRunway,
  computeDualRateGap,
  computeExpenseExtrasBreakdown,
  computeQuincenaPreview,
  extractLiveCryptoBalances,
  formatBs,
  formatUsd,
  getActiveCustodyOptions,
  getInstallmentArrears,
  getPaymentMethodLabel,
  isNegativeAdjustmentMovement,
} from './calculations';

describe('budget/utils/calculations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives envelope custody balances, emergency fund split, and custom USD/VES accounts', () => {
    const movements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-01',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 200,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm2',
        date: '2026-11-02',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 100,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm3',
        date: '2026-11-03',
        bucket: 'imprescindibles',
        type: 'Gasto en Efectivo',
        amountUsd: 50,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm4',
        date: '2026-11-03',
        bucket: 'emergencias',
        type: 'Ingreso a Sobre',
        amountUsd: 300,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm5',
        date: '2026-11-03',
        bucket: 'binance_usdc',
        type: 'Barrido a Inversión',
        amountUsd: 200,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm6',
        date: '2026-11-04',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Entrada)',
        amountUsd: 20,
        amountBs: 1000,
        bcvRateUsed: 50,
        paymentMethod: 'bolivares_pago_movil',
      },
      {
        id: 'm7',
        date: '2026-11-04',
        bucket: 'acct_ves_1',
        type: 'Transferencia (Entrada)',
        amountUsd: 50,
        amountBs: 2500,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    const customAccounts: CustomAccount[] = [
      {
        id: 'acct_ves_1',
        name: 'Cuenta VES Extra',
        currency: 'VES',
        createdAt: '2026-11-01',
      },
    ];

    // BCV rate at 50 Bs/$
    const { funds, totalNetWorth, envelopes } = calculateFundSummaries(
      movements,
      50,
      customAccounts,
    );

    const imp = envelopes.find((e) => e.id === 'imprescindibles')!;
    expect(imp.assigned).toBeCloseTo(300, 2);
    expect(imp.spent).toBeCloseTo(50, 2);
    expect(imp.available).toBeCloseTo(250, 2);
    expect(imp.byMethod.efectivo).toBeCloseTo(150, 2);
    expect(imp.byMethod.binance).toBeCloseTo(100, 2);

    const cashFund = funds.find((f) => f.id === 'efectivo_sobres')!;
    const binanceFund = funds.find((f) => f.id === 'inversiones_binance')!;
    const bsFund = funds.find((f) => f.id === 'cuenta_bolivares')!;
    const emergFund = funds.find((f) => f.id === 'fondo_emergencia')!;
    const customVes = funds.find((f) => f.id === 'acct_ves_1')!;

    expect(cashFund.balance).toBeCloseTo(150, 2);
    expect(binanceFund.balance).toBeCloseTo(100, 2);
    expect(bsFund.balanceBs).toBeCloseTo(1000, 2);
    expect(bsFund.balance).toBeCloseTo(20, 2);
    expect(emergFund.balance).toBeCloseTo(500, 2);
    expect(emergFund.breakdown).toEqual([
      { label: 'Efectivo', amount: 300 },
      { label: 'USDC', amount: 200 },
    ]);
    expect(customVes.balance).toBeCloseTo(50, 2);
    expect(customVes.balanceBs).toBeCloseTo(2500, 2);

    // 150 (cash) + 100 (binance) + 20 (bs) + 500 (emerg) + 50 (custom) = 820
    expect(totalNetWorth).toBeCloseTo(820, 2);
  });

  it('INVARIANT: internal transfers and custody changes preserve totalNetWorth and keep spent at zero', () => {
    const baseMovements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-01',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 300,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm2',
        date: '2026-11-01',
        bucket: 'crecimiento_personal',
        type: 'Ingreso a Sobre',
        amountUsd: 200,
        paymentMethod: 'binance_usdt',
      },
    ];

    const before = calculateFundSummaries(baseMovements, 50);

    // Change 250 USDT -> Efectivo USD inside imprescindibles + move 100 from crecimiento_personal to disfrute
    const afterMovements: LedgerMovement[] = [
      ...baseMovements,
      {
        id: 't1-out',
        date: '2026-11-02',
        bucket: 'imprescindibles',
        type: 'Transferencia (Salida)',
        amountUsd: 250,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 't1-in',
        date: '2026-11-02',
        bucket: 'imprescindibles',
        type: 'Transferencia (Entrada)',
        amountUsd: 250,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 't2-out',
        date: '2026-11-02',
        bucket: 'crecimiento_personal',
        type: 'Transferencia (Salida)',
        amountUsd: 100,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 't2-in',
        date: '2026-11-02',
        bucket: 'disfrute',
        type: 'Transferencia (Entrada)',
        amountUsd: 100,
        paymentMethod: 'binance_usdt',
      },
    ];

    const after = calculateFundSummaries(afterMovements, 50);
    const envsAfter = calculateEnvelopeSummaries(afterMovements);

    expect(after.totalNetWorth).toBeCloseTo(before.totalNetWorth, 2);
    expect(envsAfter.every((e) => e.spent === 0)).toBe(true);
    expect(envsAfter.find((e) => e.id === 'imprescindibles')!.available).toBeCloseTo(300, 2);
    expect(envsAfter.find((e) => e.id === 'crecimiento_personal')!.available).toBeCloseTo(100, 2);
    expect(envsAfter.find((e) => e.id === 'disfrute')!.available).toBeCloseTo(100, 2);
  });

  it('computes quincena preview provisions (monthly, annual sinking fund, payable installments) and rules', () => {
    const expenses: RecurringExpense[] = [
      {
        id: 'e1',
        name: 'Internet',
        amountUsd: 40,
        frequency: 'mensual',
        nextDueDate: '2026-11-30',
        envelopeId: 'imprescindibles',
        active: true,
      },
      {
        id: 'e2',
        name: 'Dominio Anual',
        amountUsd: 24,
        frequency: 'anual',
        nextDueDate: '2027-06-01',
        envelopeId: 'provisiones_anuales',
        active: true,
      },
      {
        id: 'e3',
        name: 'Inactivo',
        amountUsd: 100,
        frequency: 'mensual',
        nextDueDate: '2026-11-25',
        envelopeId: 'disfrute',
        active: false,
      },
    ];

    const installments: InstallmentPlan[] = [
      {
        id: 'i1',
        name: 'Cuota Por Pagar',
        direction: 'payable',
        installmentAmount: 25,
        frequency: 'semanal', // 25 * 2 = 50 biweekly
        maxCap: 200,
        paidTotal: 50,
        paymentsCount: 2,
      },
      {
        id: 'i2',
        name: 'Me Deben',
        direction: 'receivable', // should NOT add to expenses provision
        installmentAmount: 50,
        frequency: 'quincenal',
        maxCap: 500,
        paidTotal: 100,
        paymentsCount: 2,
      },
    ];

    const rules: EnvelopeRule[] = [
      { envelopeId: 'crecimiento_personal', mode: 'fixed', value: 29 },
      { envelopeId: 'ahorro_inversion', mode: 'percentage', value: 50 },
      { envelopeId: 'disfrute', mode: 'percentage', value: 50 },
    ];

    const preview = computeQuincenaPreview({
      grossAmount: 200,
      rules,
      autoProvisionExpenses: true,
      autoProvisionInstallments: true,
      expenses,
      installments,
    });

    // Monthly = 40/2 = 20; Annual = 24/24 = 1; Payable weekly = 25*2 = 50 -> totalProvision = 71
    expect(preview.monthlyExpensesProvision).toBeCloseTo(20, 2);
    expect(preview.annualExpensesProvision).toBeCloseTo(1, 2);
    expect(preview.installmentsProvision).toBeCloseTo(50, 2);
    expect(preview.totalProvision).toBeCloseTo(71, 2);
    expect(preview.distributableAmount).toBeCloseTo(129, 2);

    // Remaining after fixed 29 = 100 -> 50% ahorro (50), 50% disfrute (50)
    expect(preview.totalAssignedToEnvelopes).toBeCloseTo(129, 2);
    expect(preview.unallocated).toBeCloseTo(0, 2);
    expect(preview.isOverAllocated).toBe(false);
  });

  it('computes installment arrears clamped to maxCap and advances due dates', () => {
    const plan: InstallmentPlan = {
      id: 'p1',
      name: 'Cuota Moto',
      direction: 'receivable',
      installmentAmount: 50,
      frequency: 'semanal',
      startDate: '2026-10-21', // 28 days before 2026-11-18 -> 4 elapsed weekly periods -> $200 expected
      maxCap: 180, // clamped to $180
      paidTotal: 100,
      paymentsCount: 2,
    };

    const arrears = getInstallmentArrears(plan);
    expect(arrears).toEqual({
      expectedTotal: 180,
      arrearsUsd: 80,
      behindPeriods: 1,
    });

    expect(advanceDueDate('2026-11-18', 'semanal')).toBe('2026-11-25');
    expect(advanceDueDate('2026-11-18', 'quincenal')).toBe('2026-12-03');
    expect(advanceDueDate('2026-11-18', 'mensual')).toBe('2026-12-18');
    expect(advanceDueDate('2026-11-18', 'anual')).toBe('2027-11-18');
  });

  it('extracts live DCA crypto balances with offline cost-basis fallback and preserves envelope USDT', () => {
    const baseHolding: Omit<CoinHolding, 'ticker' | 'currentValue' | 'investedUsd' | 'isStablecoin' | 'currentTokens'> = {
      coinGeckoId: 'id',
      totalSpent: 0,
      soldUsd: 0,
      dca: 0,
      livePrice: 0,
      pnl: 0,
      pnlPercent: 0,
      targetBuyPct: 20,
      targetSellPct: 20,
      targetBuyPrice: 0,
      targetSellPrice: 0,
      tradeSignal: 'WATCH',
    };

    const holdings: CoinHolding[] = [
      { ...baseHolding, ticker: 'BTC', isStablecoin: false, currentTokens: 0.01, currentValue: 900, investedUsd: 600 },
      { ...baseHolding, ticker: 'PAXG', isStablecoin: false, currentTokens: 0.1, currentValue: 0, investedUsd: 250 }, // offline fallback -> 250
      { ...baseHolding, ticker: 'ETH', isStablecoin: false, currentTokens: 0.2, currentValue: 600, investedUsd: 400 },
      { ...baseHolding, ticker: 'SOL', isStablecoin: false, currentTokens: 1, currentValue: 200, investedUsd: 150 },
      { ...baseHolding, ticker: 'USDT', isStablecoin: true, currentTokens: 500, currentValue: 500, investedUsd: 500 }, // ignored (stable)
    ];

    const live = extractLiveCryptoBalances(holdings);
    expect(live).toEqual({
      binanceCryptoUsd: 800, // ETH 600 + SOL 200
      binancePaxgUsd: 250,   // PAXG offline cost basis fallback
      walletBtcUsd: 900,
    });

    const movements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-01',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 150,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm2',
        date: '2026-11-01',
        bucket: 'binance_usdt',
        type: 'Transferencia (Entrada)',
        amountUsd: 50,
        paymentMethod: 'binance_usdt',
      },
    ];

    const { funds, totalNetWorth } = calculateFundSummaries(movements, null, [], live);
    const binanceFund = funds.find((f) => f.id === 'inversiones_binance')!;
    const btcFund = funds.find((f) => f.id === 'billetera_btc')!;

    // inversiones_binance = 800 (live crypto) + 250 (live PAXG fallback) + 200 (150 envelope + 50 ledger USDT) = 1250
    expect(binanceFund.balance).toBeCloseTo(1250, 2);
    expect(binanceFund.breakdown).toEqual([
      { label: 'Crypto', amount: 800 },
      { label: 'USDT', amount: 200 },
      { label: 'PAXG', amount: 250 },
    ]);
    expect(btcFund.balance).toBeCloseTo(900, 2);
    // 1250 + 900 = 2150
    expect(totalNetWorth).toBeCloseTo(2150, 2);
  });

  it('computes Ready to Assign liquidity, preserves invariance on assignment, and calculates Runway', () => {
    const movements: LedgerMovement[] = [
      // Unassigned liquidity in Binance USDT and Banco Bolivares
      {
        id: 'u1',
        date: '2026-11-10',
        bucket: 'binance_usdt',
        type: 'Ingreso a Sobre',
        amountUsd: 150,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'u2',
        date: '2026-11-10',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Entrada)',
        amountUsd: 50,
        amountBs: 2500,
        paymentMethod: 'bolivares_pago_movil',
      },
      // Already assigned to envelopes + Emergency + Volatile BTC (volatile should NOT inflate liquid runway)
      {
        id: 'a1',
        date: '2026-11-10',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 100,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'a2',
        date: '2026-11-10',
        bucket: 'emergencias',
        type: 'Ingreso a Sobre',
        amountUsd: 600,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'v1',
        date: '2026-11-10',
        bucket: 'wallet_btc',
        type: 'Barrido a Inversión',
        amountUsd: 5000,
        paymentMethod: 'otro',
      },
    ];

    const expenses: RecurringExpense[] = [
      {
        id: 'e1',
        name: 'Mercado',
        amountUsd: 150,
        frequency: 'mensual',
        nextDueDate: '2026-11-25',
        envelopeId: 'imprescindibles',
        active: true,
      },
      {
        id: 'e2',
        name: 'Seguro',
        amountUsd: 360,
        frequency: 'anual', // 360 / 12 = 30/mo
        nextDueDate: '2027-05-01',
        envelopeId: 'provisiones_anuales',
        active: true,
      },
    ];

    const installments: InstallmentPlan[] = [
      {
        id: 'i1',
        name: 'Cuota Deuda',
        direction: 'payable',
        installmentAmount: 60,
        frequency: 'quincenal', // 60 * 2 = 120/mo
        maxCap: 600,
        paidTotal: 120,
        paymentsCount: 2,
      },
    ];

    // Liquid reserve: 150 (unassigned USDT) + 50 (Bs) + 100 (imp USDT) + 600 (emerg) = 900
    // Monthly burn: 150 + 30 + 120 = 300/mo -> 10/day -> 90 days (3.0 months)
    const before = calculateReadyToAssignAndRunway({
      movements,
      expenses,
      installments,
      bcvRate: 50,
    });

    expect(before.totalReadyToAssignUsd).toBeCloseTo(200, 2);
    expect(before.items).toHaveLength(2);
    expect(before.liquidReserveUsd).toBeCloseTo(900, 2);
    expect(before.monthlyBurnRateUsd).toBeCloseTo(300, 2);
    expect(before.dailyBurnRateUsd).toBeCloseTo(10, 2);
    expect(before.runwayDays).toBe(90);
    expect(before.runwayMonths).toBe(3);

    const netWorthBefore = calculateFundSummaries(movements, 50).totalNetWorth;

    // Assign all $200 Ready to Assign into envelopes
    const assignedMovements: LedgerMovement[] = [
      ...movements,
      {
        id: 't1-out',
        date: '2026-11-18',
        bucket: 'binance_usdt',
        type: 'Transferencia (Salida)',
        amountUsd: 150,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 't1-in',
        date: '2026-11-18',
        bucket: 'ahorro_inversion',
        type: 'Transferencia (Entrada)',
        amountUsd: 150,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 't2-out',
        date: '2026-11-18',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Salida)',
        amountUsd: 50,
        amountBs: 2500,
        paymentMethod: 'bolivares_pago_movil',
      },
      {
        id: 't2-in',
        date: '2026-11-18',
        bucket: 'imprescindibles',
        type: 'Transferencia (Entrada)',
        amountUsd: 50,
        amountBs: 2500,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    const after = calculateReadyToAssignAndRunway({
      movements: assignedMovements,
      expenses,
      installments,
      bcvRate: 50,
    });

    expect(after.totalReadyToAssignUsd).toBe(0);
    expect(after.items).toHaveLength(0);
    expect(after.liquidReserveUsd).toBeCloseTo(900, 2);
    expect(calculateFundSummaries(assignedMovements, 50).totalNetWorth).toBeCloseTo(
      netWorthBefore,
      2,
    );
  });

  it('isolates digital Binance USDT eligible investment capital excluding physical cash, emergency fund, essentials, and bolivares', () => {
    const movements: LedgerMovement[] = [
      {
        id: 'e1-cash',
        date: '2026-11-18',
        bucket: 'ahorro_inversion',
        type: 'Ingreso a Sobre',
        amountUsd: 120,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'e1-binance',
        date: '2026-11-18',
        bucket: 'ahorro_inversion',
        type: 'Ingreso a Sobre',
        amountUsd: 150,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'e2',
        date: '2026-11-18',
        bucket: 'binance_usdt',
        type: 'Transferencia (Entrada)',
        amountUsd: 80,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'ignore-1',
        date: '2026-11-18',
        bucket: 'emergencias',
        type: 'Ingreso a Sobre',
        amountUsd: 1000,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'ignore-2',
        date: '2026-11-18',
        bucket: 'binance_usdc',
        type: 'Barrido a Inversión',
        amountUsd: 500,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'ignore-3',
        date: '2026-11-18',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Entrada)',
        amountUsd: 300,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    const eligible = calculateEligibleInvestmentCapital(movements);
    expect(eligible.ahorroEnvelopeUsd).toBeCloseTo(150, 2);
    expect(eligible.excludedPhysicalCashUsd).toBeCloseTo(120, 2);
    expect(eligible.unassignedUsdtUsd).toBeCloseTo(80, 2);
    expect(eligible.totalEligibleUsd).toBeCloseTo(230, 2);
  });

  it('absorbs negative Bs envelope custody against free Bs pool when freeBsPoolMode is active while preserving net worth and bank Bs', () => {
    const movements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-18',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Entrada)',
        amountUsd: 21.09,
        amountBs: 20000,
        bcvRateUsed: 948.35,
        paymentMethod: 'bolivares_pago_movil',
      },
      {
        id: 'm2',
        date: '2026-11-18',
        bucket: 'disfrute',
        type: 'Ingreso a Sobre',
        amountUsd: 50,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm3',
        date: '2026-11-18',
        bucket: 'disfrute',
        type: 'Cambio a Bolívares',
        amountUsd: 20,
        amountBs: 18967,
        bcvRateUsed: 948.35,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    // Strict mode: disfrute shows -$20 in Bs custody and +$21.09 sits in Ready to Assign
    const strictSummary = calculateFundSummaries(movements, null, [], undefined, {
      freeBsPoolMode: false,
    });
    const strictDisfrute = strictSummary.envelopes.find((e) => e.id === 'disfrute')!;
    expect(strictDisfrute.byMethod.bolivares).toBeCloseTo(-20, 2);
    expect(strictDisfrute.available).toBeCloseTo(30, 2);
    const strictRta = calculateReadyToAssignAndRunway({
      movements,
      expenses: [],
      installments: [],
      bcvRate: 948.35,
      freeBsPoolMode: false,
    });
    expect(strictRta.totalReadyToAssignUsd).toBeCloseTo(21.09, 2);

    // Free Bs pool mode: deficit absorbed by banco_bolivares, net worth & Cuenta en Bolívares unchanged, ReadyToAssign = $0
    const poolSummary = calculateFundSummaries(movements, null, [], undefined, {
      freeBsPoolMode: true,
    });
    const poolDisfrute = poolSummary.envelopes.find((e) => e.id === 'disfrute')!;
    expect(poolDisfrute.byMethod.bolivares).toBeCloseTo(0, 2);
    expect(poolDisfrute.available).toBeCloseTo(50, 2);
    expect(poolSummary.funds.find((f) => f.id === 'cuenta_bolivares')!.balance).toBeCloseTo(1.09, 2);
    expect(poolSummary.totalNetWorth).toBeCloseTo(strictSummary.totalNetWorth, 2);

    const poolRta = calculateReadyToAssignAndRunway({
      movements,
      expenses: [],
      installments: [],
      bcvRate: 948.35,
      freeBsPoolMode: true,
    });
    expect(poolRta.totalReadyToAssignUsd).toBe(0);
  });

  it('detects negative adjustments via isNegativeAdjustmentMovement including 0-USD tiny Bs deltas', () => {
    expect(
      isNegativeAdjustmentMovement({ type: 'Ajuste', amountUsd: 0, amountBs: -0.01 }),
    ).toBe(true);
    expect(
      isNegativeAdjustmentMovement({ type: 'Ajuste', amountUsd: 0, amountBs: 0.01 }),
    ).toBe(false);
    expect(
      isNegativeAdjustmentMovement({ type: 'Ajuste', amountUsd: -5, amountBs: undefined }),
    ).toBe(true);
    expect(
      isNegativeAdjustmentMovement({ type: 'Ajuste', amountUsd: -5, amountBs: 4500 }),
    ).toBe(true);
    expect(
      isNegativeAdjustmentMovement({ type: 'Ingreso a Sobre', amountUsd: -5, amountBs: -0.01 }),
    ).toBe(false);
  });

  it('adjusts Cuenta en Bolívares cleanly from 5509.24 to 5509.23 with envelope Bs balance present', () => {
    const rate = 948.35;
    const baseMovements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-18',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Entrada)',
        amountUsd: Number((5516.24 / rate).toFixed(2)),
        amountBs: 5516.24,
        bcvRateUsed: rate,
        paymentMethod: 'bolivares_pago_movil',
      },
      {
        id: 'm2',
        date: '2026-11-18',
        bucket: 'disfrute',
        type: 'Gasto en Efectivo',
        amountUsd: Number((7.0 / rate).toFixed(2)),
        amountBs: 7.0,
        bcvRateUsed: rate,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    const before = calculateFundSummaries(baseMovements, rate, [], undefined, {
      freeBsPoolMode: true,
    });
    const bsBefore = before.funds.find((f) => f.id === 'cuenta_bolivares')!;
    expect(bsBefore.balanceBs).toBeCloseTo(5509.24, 2);

    // Setting exact balance to 5509.23 produces deltaBs = -0.01 and deltaUsd = 0 at rate ~948.35
    const deltaBs = Number((5509.23 - (bsBefore.balanceBs ?? 0)).toFixed(2));
    const deltaUsd = Number((deltaBs / rate).toFixed(2)) || 0;
    expect(deltaBs).toBe(-0.01);
    expect(deltaUsd).toBe(0);

    const adjustedMovements: LedgerMovement[] = [
      ...baseMovements,
      {
        id: 'm3',
        date: '2026-11-19',
        bucket: 'banco_bolivares',
        type: 'Ajuste',
        amountUsd: deltaUsd,
        amountBs: deltaBs,
        bcvRateUsed: rate,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    const after = calculateFundSummaries(adjustedMovements, rate, [], undefined, {
      freeBsPoolMode: true,
    });
    const bsAfter = after.funds.find((f) => f.id === 'cuenta_bolivares')!;
    expect(bsAfter.balanceBs).toBeCloseTo(5509.23, 2);
  });

  it('applies tiny negative and positive Bs adjustments accurately on custom VES accounts', () => {
    const rate = 948.35;
    const customAccounts: CustomAccount[] = [
      {
        id: 'acct_ves_1',
        name: 'Banesco Bs',
        currency: 'VES',
        subtitle: 'Cuenta secundaria',
        createdAt: '2026-11-18',
      },
    ];

    const initialMovements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-18',
        bucket: 'acct_ves_1',
        type: 'Ingreso a Sobre',
        amountUsd: 10,
        amountBs: 9483.5,
        bcvRateUsed: rate,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];

    const afterNeg = calculateFundSummaries(
      [
        ...initialMovements,
        {
          id: 'm2',
          date: '2026-11-19',
          bucket: 'acct_ves_1',
          type: 'Ajuste',
          amountUsd: 0,
          amountBs: -0.01,
          bcvRateUsed: rate,
          paymentMethod: 'bolivares_pago_movil',
        },
      ],
      rate,
      customAccounts,
    );
    expect(afterNeg.funds.find((f) => f.id === 'acct_ves_1')!.balanceBs).toBeCloseTo(9483.49, 2);

    const afterPos = calculateFundSummaries(
      [
        ...initialMovements,
        {
          id: 'm2',
          date: '2026-11-19',
          bucket: 'acct_ves_1',
          type: 'Ajuste',
          amountUsd: 0,
          amountBs: 0.01,
          bcvRateUsed: rate,
          paymentMethod: 'bolivares_pago_movil',
        },
      ],
      rate,
      customAccounts,
    );
    expect(afterPos.funds.find((f) => f.id === 'acct_ves_1')!.balanceBs).toBeCloseTo(9483.51, 2);
  });

  it('snaps IEEE 754 / sub-cent residuals to exact +0 so emptying USDT custody never renders -$0.00', () => {
    expect(formatUsd(-0.004)).toBe('$0.00');
    expect(formatUsd(-3.55e-15)).toBe('$0.00');
    expect(formatUsd(-0)).toBe('$0.00');
    expect(formatBs(-0.004)).toBe('Bs. 0,00');

    // Simulate floating-point subtraction residual (35.42 - 12.14 - 23.28 = -3.5527136788e-15 in IEEE 754)
    const movements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-18',
        bucket: 'disfrute',
        type: 'Ingreso a Sobre',
        amountUsd: 35.42,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm2',
        date: '2026-11-19',
        bucket: 'disfrute',
        type: 'Gasto en Efectivo',
        amountUsd: 12.14,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm3',
        date: '2026-11-20',
        bucket: 'disfrute',
        type: 'Transferencia (Salida)',
        amountUsd: 23.28,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 'm4',
        date: '2026-11-20',
        bucket: 'ahorro_inversion',
        type: 'Transferencia (Entrada)',
        amountUsd: 23.28,
        paymentMethod: 'binance_usdt',
      },
    ];

    const envs = calculateEnvelopeSummaries(movements);
    const disfrute = envs.find((e) => e.id === 'disfrute')!;
    expect(Object.is(disfrute.byMethod.binance, 0)).toBe(true);
    expect(Object.is(disfrute.available, 0)).toBe(true);
    expect(formatUsd(disfrute.byMethod.binance)).toBe('$0.00');

    // Also test sub-half-cent rounding residual (14.336 - 14.34 = -0.004)
    const subCentMovements: LedgerMovement[] = [
      {
        id: 's1',
        date: '2026-11-18',
        bucket: 'disfrute',
        type: 'Ingreso a Sobre',
        amountUsd: 14.336,
        paymentMethod: 'binance_usdt',
      },
      {
        id: 's2',
        date: '2026-11-20',
        bucket: 'disfrute',
        type: 'Transferencia (Salida)',
        amountUsd: 14.34,
        paymentMethod: 'binance_usdt',
      },
    ];
    const [subDisfrute] = calculateEnvelopeSummaries(subCentMovements).filter(
      (e) => e.id === 'disfrute',
    );
    expect(Object.is(subDisfrute.byMethod.binance, 0)).toBe(true);
  });

  it('tracks custom USD/VES accounts as first-class envelope custodies without double counting and populates Ready to Assign', () => {
    const customAccounts: CustomAccount[] = [
      {
        id: 'acct_bancamiga',
        name: 'Bancamiga - Cuenta Cash',
        currency: 'USD',
        createdAt: '2026-11-18',
      },
      {
        id: 'acct_mercantil_bs',
        name: 'Mercantil Bs',
        currency: 'VES',
        createdAt: '2026-11-18',
      },
    ];
    const bcvRate = 500;

    // 1) Disfrute has $30 cash; user moves $10.20 from Disfrute (efectivo_usd) -> Disfrute (acct_bancamiga)
    // 2) Also Imprescindibles holds $20 in Mercantil Bs (10,000 Bs) AND $10.20 sits unassigned in acct_bancamiga
    const movements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-10',
        bucket: 'disfrute',
        type: 'Ingreso a Sobre',
        amountUsd: 30,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm2',
        date: '2026-11-20',
        bucket: 'disfrute',
        type: 'Transferencia (Salida)',
        amountUsd: 10.2,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm3',
        date: '2026-11-20',
        bucket: 'disfrute',
        type: 'Transferencia (Entrada)',
        amountUsd: 10.2,
        paymentMethod: 'acct_bancamiga',
      },
      {
        id: 'm4',
        date: '2026-11-20',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 20,
        amountBs: 10000,
        bcvRateUsed: bcvRate,
        paymentMethod: 'acct_mercantil_bs',
      },
      {
        id: 'm5',
        date: '2026-11-20',
        bucket: 'acct_bancamiga',
        type: 'Ingreso a Sobre',
        amountUsd: 10.2,
        paymentMethod: 'acct_bancamiga',
      },
    ];

    const { funds, totalNetWorth, envelopes } = calculateFundSummaries(
      movements,
      bcvRate,
      customAccounts,
    );

    const disfrute = envelopes.find((e) => e.id === 'disfrute')!;
    const imp = envelopes.find((e) => e.id === 'imprescindibles')!;

    expect(disfrute.available).toBeCloseTo(30, 2);
    expect(disfrute.spent).toBeCloseTo(0, 2);
    expect(disfrute.byMethod.efectivo).toBeCloseTo(19.8, 2);
    expect(disfrute.byMethod.custom.acct_bancamiga).toBeCloseTo(10.2, 2);
    expect(imp.byMethod.custom.acct_mercantil_bs).toBeCloseTo(20, 2);

    // Consolidated fund totals: Cash = 19.80, Bancamiga = 10.20 (in Disfrute) + 10.20 (unassigned) = 20.40, Mercantil = 20.00 (10,000 Bs)
    expect(funds.find((f) => f.id === 'efectivo_sobres')!.balance).toBeCloseTo(19.8, 2);
    expect(funds.find((f) => f.id === 'acct_bancamiga')!.balance).toBeCloseTo(20.4, 2);
    expect(funds.find((f) => f.id === 'acct_mercantil_bs')!.balance).toBeCloseTo(20, 2);
    expect(funds.find((f) => f.id === 'acct_mercantil_bs')!.balanceBs).toBeCloseTo(10000, 2);
    expect(totalNetWorth).toBeCloseTo(60.2, 2);

    // Only the unassigned $10.20 in acct_bancamiga appears in Ready to Assign (Mercantil Bs is inside Imprescindibles)
    const rta = calculateReadyToAssignAndRunway({
      movements,
      expenses: [],
      installments: [],
      bcvRate,
      customAccounts,
    });
    expect(rta.totalReadyToAssignUsd).toBeCloseTo(10.2, 2);
    expect(rta.items).toHaveLength(1);
    expect(rta.items[0].sourceBucket).toBe('acct_bancamiga');
    expect(rta.items[0].paymentMethod).toBe('acct_bancamiga');
  });

  it('supports renaming and hiding native accounts via nativeAccountOverrides while preserving net worth', () => {
    const customAccounts: CustomAccount[] = [
      {
        id: 'acct_chase',
        name: 'Chase Checking',
        currency: 'USD',
        createdAt: '2026-11-20',
      },
    ];
    const overrides: NativeAccountOverrides = {
      cuenta_bolivares: { hidden: true },
      efectivo_sobres: { name: 'Cash Wallet', hidden: true },
      inversiones_binance: { name: 'Brokerage USD' },
    };

    const movements: LedgerMovement[] = [
      {
        id: 'm1',
        date: '2026-11-20',
        bucket: 'imprescindibles',
        type: 'Ingreso a Sobre',
        amountUsd: 100,
        paymentMethod: 'efectivo_usd',
      },
      {
        id: 'm2',
        date: '2026-11-20',
        bucket: 'ahorro_inversion',
        type: 'Ingreso a Sobre',
        amountUsd: 250,
        paymentMethod: 'acct_chase',
      },
    ];

    const { funds, totalNetWorth } = calculateFundSummaries(
      movements,
      null,
      customAccounts,
      undefined,
      { nativeAccountOverrides: overrides },
    );

    const cashFund = funds.find((f) => f.id === 'efectivo_sobres')!;
    const bsFund = funds.find((f) => f.id === 'cuenta_bolivares')!;
    const brokerFund = funds.find((f) => f.id === 'inversiones_binance')!;

    expect(cashFund.name).toBe('Cash Wallet');
    expect(cashFund.hidden).toBe(true);
    expect(bsFund.hidden).toBe(true);
    expect(brokerFund.name).toBe('Brokerage USD');
    expect(brokerFund.hidden).toBe(false);
    // Hidden cash balance is still preserved in Patrimonio Total
    expect(totalNetWorth).toBeCloseTo(350, 2);

    const activeCustodies = getActiveCustodyOptions(customAccounts, overrides);
    expect(activeCustodies.map((c) => c.id)).toEqual(['binance_usdt', 'acct_chase', 'otro']);
    expect(getPaymentMethodLabel('binance_usdt', customAccounts, overrides)).toBe('Brokerage USD');
    expect(getPaymentMethodLabel('acct_chase', customAccounts, overrides)).toBe('Chase Checking (USD)');
  });

  it('computes cascaded expense extras (IVA 16%, Service 10%, IGTF 3%) and dual-rate FX gap summary without double-counting', () => {
    // 1. Restaurant bill $50 base + 16% IVA ($8) + 10% Service ($5) = $63.00
    const bsBill = computeExpenseExtrasBreakdown(50, {
      applyIva: true,
      applyService: true,
      applyIgtf: false,
    });
    expect(bsBill.base).toBeCloseTo(50, 2);
    expect(bsBill.ivaAmount).toBeCloseTo(8, 2);
    expect(bsBill.serviceAmount).toBeCloseTo(5, 2);
    expect(bsBill.igtfAmount).toBe(0);
    expect(bsBill.subtotalBeforeIgtf).toBeCloseTo(63, 2);
    expect(bsBill.total).toBeCloseTo(63, 2);
    expect(bsBill.hasExtras).toBe(true);

    // 2. Adding +3% IGTF compounds on post-IVA/service invoice ($63.00 * 1.03 = $64.89)
    const fxBill = computeExpenseExtrasBreakdown(50, {
      applyIva: true,
      applyService: true,
      applyIgtf: true,
    });
    expect(fxBill.igtfAmount).toBeCloseTo(1.89, 2);
    expect(fxBill.total).toBeCloseTo(64.89, 2);

    // 3. Standalone +3% IGTF on $100
    const igtfOnly = computeExpenseExtrasBreakdown(100, { applyIgtf: true });
    expect(igtfOnly.total).toBeCloseTo(103, 2);

    // 4. Dual-rate gap: $63.00 at BCV 100 vs Parallel 130
    const gap = computeDualRateGap({
      amountUsdAtBcv: 63,
      bcvRate: 100,
      parallelRate: 130,
    })!;
    expect(gap).not.toBeNull();
    expect(gap.amountBs).toBeCloseTo(6300, 2);
    expect(gap.gapPct).toBeCloseTo(30, 2);
    expect(gap.realParallelUsd).toBeCloseTo(48.46, 2);
    expect(gap.savingsUsd).toBeCloseTo(14.54, 2);
    expect(gap.effectiveDiscountPct).toBeCloseTo(23.08, 2);

    expect(
      computeDualRateGap({ amountUsdAtBcv: 63, bcvRate: 100, parallelRate: null }),
    ).toBeNull();

    // 5. FxGapSummary segregates realized conversion gains from implicit Bs expense savings
    const movements: LedgerMovement[] = [
      {
        id: 't-in',
        date: '2026-11-20',
        bucket: 'banco_bolivares',
        type: 'Transferencia (Entrada)',
        amountUsd: 130,
        fxGapSavingsUsd: 30,
        paymentMethod: 'bolivares_pago_movil',
      },
      {
        id: 'g-bs',
        date: '2026-11-20',
        bucket: 'disfrute',
        type: 'Cambio a Bolívares',
        amountUsd: 63,
        fxGapSavingsUsd: 14.54,
        paymentMethod: 'bolivares_pago_movil',
      },
    ];
    const summary = calculateFxGapSummary(movements);
    expect(summary.realizedExchangeGainUsd).toBeCloseTo(30, 2);
    expect(summary.implicitExpenseSavingsUsd).toBeCloseTo(14.54, 2);
    expect(summary.operationsCount).toBe(2);
  });
});
