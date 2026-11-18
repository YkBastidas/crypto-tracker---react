import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinHolding } from '../../../shared/types';
import type {
  CustomAccount,
  EnvelopeRule,
  InstallmentPlan,
  LedgerMovement,
  RecurringExpense,
} from '../types';
import {
  advanceDueDate,
  calculateEnvelopeSummaries,
  calculateFundSummaries,
  computeQuincenaPreview,
  extractLiveCryptoBalances,
  getInstallmentArrears,
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
});
