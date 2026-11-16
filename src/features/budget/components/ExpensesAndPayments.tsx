import { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Layers,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type {
  EnvelopeId,
  ExpenseFrequency,
  InstallmentFrequency,
  PaymentMethod,
  RecurringExpense,
} from '../types';
import {
  calculateDaysLeft,
  formatUsd,
  getExpenseBiweeklyQuota,
  getInstallmentBiweeklyQuota,
} from '../utils/calculations';
import { PayExpenseModal } from './PayExpenseModal';

export function ExpensesAndPayments() {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const {
    expenses,
    installments,
    addExpense,
    removeExpense,
    addInstallment,
    removeInstallment,
    recordInstallmentPayment,
  } = useBudgetStore();

  const [expenseFilter, setExpenseFilter] = useState<'all' | 'mensual' | 'anual'>('all');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddInstallment, setShowAddInstallment] = useState(false);
  const [payingExpense, setPayingExpense] = useState<RecurringExpense | null>(null);
  const [installmentMethod, setInstallmentMethod] = useState<PaymentMethod>('efectivo_usd');

  // New Expense form state
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expFreq, setExpFreq] = useState<ExpenseFrequency>('mensual');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expEnv, setExpEnv] = useState<EnvelopeId>('imprescindibles');

  // New Installment form state
  const [instName, setInstName] = useState('');
  const [instAmount, setInstAmount] = useState('');
  const [instFreq, setInstFreq] = useState<InstallmentFrequency>('semanal');
  const [instCap, setInstCap] = useState('');
  const [instNotes, setInstNotes] = useState('');

  const stats = useMemo(() => {
    const active = expenses.filter((e) => e.active);
    const totalAnual = active
      .filter((e) => e.frequency === 'anual')
      .reduce((acc, e) => acc + e.amountUsd, 0);
    const totalMensual = active
      .filter((e) => e.frequency === 'mensual')
      .reduce((acc, e) => acc + e.amountUsd, 0);
    const totalQuincenalExp = active.reduce((acc, e) => acc + getExpenseBiweeklyQuota(e), 0);
    const totalQuincenalInst = installments.reduce(
      (acc, p) => acc + getInstallmentBiweeklyQuota(p),
      0,
    );

    return {
      totalAnual,
      totalMensual,
      totalQuincenalExp,
      totalQuincenalInst,
      totalQuincenalRecommended: totalQuincenalExp + totalQuincenalInst,
    };
  }, [expenses, installments]);

  const sortedExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        if (expenseFilter === 'all') return true;
        if (expenseFilter === 'anual') return e.frequency === 'anual';
        return e.frequency === 'mensual' || e.frequency === 'quincenal';
      })
      .map((e) => ({
        ...e,
        daysLeft: calculateDaysLeft(e.nextDueDate),
        biweeklyQuota: getExpenseBiweeklyQuota(e),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [expenses, expenseFilter]);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expAmount);
    if (!expName.trim() || !Number.isFinite(amount) || amount <= 0) return;

    addExpense({
      name: expName.trim(),
      amountUsd: Number(amount.toFixed(2)),
      frequency: expFreq,
      nextDueDate: expDate,
      envelopeId: expEnv,
      active: true,
    });
    setExpName('');
    setExpAmount('');
    setShowAddExpense(false);
  };

  const handleCreateInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(instAmount);
    if (!instName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const cap = instCap.trim() ? parseFloat(instCap) : null;

    addInstallment({
      name: instName.trim(),
      installmentAmount: Number(amount.toFixed(2)),
      frequency: instFreq,
      maxCap: cap && Number.isFinite(cap) && cap > 0 ? cap : null,
      paidTotal: 0,
      paymentsCount: 0,
      notes: instNotes.trim() || undefined,
    });
    setInstName('');
    setInstAmount('');
    setInstCap('');
    setInstNotes('');
    setShowAddInstallment(false);
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted">Gastos Mensuales Fijos</p>
          <p className="text-xl font-bold text-text-primary mt-1">
            <PrivacyValue value={formatUsd(stats.totalMensual)} isPrivate={isPrivate} />
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">Suscripciones y servicios</p>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted">Compromisos Anuales</p>
          <p className="text-xl font-bold text-text-primary mt-1">
            <PrivacyValue value={formatUsd(stats.totalAnual)} isPrivate={isPrivate} />
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Prorrateo: <PrivacyValue value={formatUsd(stats.totalAnual / 24)} isPrivate={isPrivate} /> / quincena
          </p>
        </div>

        <div className="bg-bg-card border border-accent-gold/30 rounded-xl p-4">
          <p className="text-xs text-accent-gold font-semibold">Cuota Quincenal Recomendada</p>
          <p className="text-xl font-bold text-accent-gold mt-1">
            <PrivacyValue value={formatUsd(stats.totalQuincenalRecommended)} isPrivate={isPrivate} />
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Gastos (<PrivacyValue value={formatUsd(stats.totalQuincenalExp)} isPrivate={isPrivate} />) + Cuotas (<PrivacyValue value={formatUsd(stats.totalQuincenalInst)} isPrivate={isPrivate} />)
          </p>
        </div>
      </div>

      {/* Section 1: Gastos Mensuales y Anuales */}
      <section className="bg-bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <CalendarClock size={18} className="text-accent-blue" /> Gastos Mensuales y Anuales
            </h2>
            <p className="text-xs text-text-muted">
              Cálculo automático de días restantes y prorrateo quincenal.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-border text-xs">
              {(['all', 'mensual', 'anual'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setExpenseFilter(tab)}
                  className={`px-3 py-1.5 font-medium capitalize border-none cursor-pointer ${
                    expenseFilter === tab
                      ? 'bg-accent-blue text-white'
                      : 'bg-bg-input text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab === 'all' ? 'Todos' : tab === 'mensual' ? 'Mensuales' : 'Anuales'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowAddExpense((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 cursor-pointer"
            >
              <Plus size={14} /> Nuevo
            </button>
          </div>
        </div>

        {/* Add Expense Form */}
        {showAddExpense && (
          <form
            onSubmit={handleCreateExpense}
            className="bg-bg-input/60 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <div className="lg:col-span-2">
              <label className="text-[11px] text-text-muted block mb-1">Concepto</label>
              <input
                type="text"
                required
                value={expName}
                onChange={(e) => setExpName(e.target.value)}
                placeholder="Ej. Seguro Auto, Internet..."
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Monto (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="35.00"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Frecuencia</label>
              <select
                value={expFreq}
                onChange={(e) => setExpFreq(e.target.value as ExpenseFrequency)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Próximo cobro</label>
              <input
                type="date"
                required
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Sobre</label>
              <div className="flex gap-2">
                <select
                  value={expEnv}
                  onChange={(e) => setExpEnv(e.target.value as EnvelopeId)}
                  className="flex-1 px-2 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                >
                  {(Object.keys(ENVELOPE_META) as EnvelopeId[]).map((id) => (
                    <option key={id} value={id}>
                      {ENVELOPE_META[id].shortName}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-accent-blue text-white border-none cursor-pointer"
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Expenses List */}
        <div className="divide-y divide-border">
          {sortedExpenses.map((item) => {
            const meta = ENVELOPE_META[item.envelopeId];
            const isOverdue = item.daysLeft < 0;
            const isSoon = item.daysLeft >= 0 && item.daysLeft <= 7;

            return (
              <div
                key={item.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-text-primary">{item.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${meta.badgeBg}`}
                    >
                      {meta.shortName}
                    </span>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-bg-input text-text-muted">
                      {item.frequency}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isOverdue
                          ? 'bg-accent-red/15 text-accent-red'
                          : isSoon
                            ? 'bg-accent-gold/20 text-accent-gold'
                            : 'bg-bg-input text-text-muted'
                      }`}
                    >
                      {isOverdue
                        ? `Vencido hace ${Math.abs(item.daysLeft)}d`
                        : item.daysLeft === 0
                          ? 'Vence hoy'
                          : `${item.daysLeft}d restantes`}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Próximo cobro: {item.nextDueDate} · Cuota quincenal recom.:{' '}
                    <span className="text-accent-gold font-semibold">
                      <PrivacyValue value={formatUsd(item.biweeklyQuota)} isPrivate={isPrivate} />
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="text-base font-bold text-text-primary">
                    <PrivacyValue value={formatUsd(item.amountUsd)} isPrivate={isPrivate} />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPayingExpense(item)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 cursor-pointer"
                    >
                      Pagar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeExpense(item.id)}
                      title="Eliminar gasto"
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: Matriz de Pagos Recurrentes / Cuotas */}
      <section className="bg-bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Repeat size={18} className="text-accent-gold" /> Matriz de Pagos Recurrentes y Cuotas
            </h2>
            <p className="text-xs text-text-muted">
              Control de cuotas semanales/mensuales con meta acumulada y progreso.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddInstallment((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-gold/15 border border-accent-gold/40 text-accent-gold hover:bg-accent-gold/25 cursor-pointer shrink-0"
          >
            <Plus size={14} /> Nueva Cuota
          </button>
        </div>

        {showAddInstallment && (
          <form
            onSubmit={handleCreateInstallment}
            className="bg-bg-input/60 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Nombre / Cuenta</label>
              <input
                type="text"
                required
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
                placeholder="Ej. MOTO - GREGORY"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Cuota (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={instAmount}
                onChange={(e) => setInstAmount(e.target.value)}
                placeholder="35.26"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Frecuencia</label>
              <select
                value={instFreq}
                onChange={(e) => setInstFreq(e.target.value as InstallmentFrequency)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Tope Máximo (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={instCap}
                onChange={(e) => setInstCap(e.target.value)}
                placeholder="2500"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={instNotes}
                onChange={(e) => setInstNotes(e.target.value)}
                placeholder="Notas..."
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg text-xs font-bold bg-accent-gold text-black border-none cursor-pointer"
              >
                <Check size={14} />
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {installments.map((plan) => {
            const hasCap = plan.maxCap !== null && plan.maxCap > 0;
            const progressPct = hasCap
              ? Math.min(100, (plan.paidTotal / (plan.maxCap as number)) * 100)
              : 0;
            const isCompleted = hasCap && plan.paidTotal >= (plan.maxCap as number);
            const biweekly = getInstallmentBiweeklyQuota(plan);

            return (
              <div
                key={plan.id}
                className="bg-bg-input/40 border border-border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers size={15} className="text-accent-gold" />
                      <h3 className="text-sm font-bold text-text-primary">{plan.name}</h3>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      <PrivacyValue value={formatUsd(plan.installmentAmount)} isPrivate={isPrivate} />{' '}
                      / {plan.frequency} · {plan.paymentsCount} cuotas pagadas
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeInstallment(plan.id)}
                    title="Eliminar cuota"
                    className="p-1 text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {hasCap ? (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-muted">
                        Acumulado:{' '}
                        <strong className="text-text-primary">
                          <PrivacyValue value={formatUsd(plan.paidTotal)} isPrivate={isPrivate} />
                        </strong>
                      </span>
                      <span className="text-text-muted">
                        Meta:{' '}
                        <strong className="text-text-primary">
                          <PrivacyValue value={formatUsd(plan.maxCap as number)} isPrivate={isPrivate} />
                        </strong>{' '}
                        ({progressPct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden border border-border">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted ? 'bg-accent-green' : 'bg-accent-gold'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    Total acumulado:{' '}
                    <strong className="text-text-primary">
                      <PrivacyValue value={formatUsd(plan.paidTotal)} isPrivate={isPrivate} />
                    </strong>
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-text-muted">
                    Quincenal recom.:{' '}
                    <strong className="text-accent-gold">
                      <PrivacyValue value={formatUsd(biweekly)} isPrivate={isPrivate} />
                    </strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Medio de pago cuota"
                      value={installmentMethod}
                      onChange={(e) => setInstallmentMethod(e.target.value as PaymentMethod)}
                      className="px-2 py-1.5 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted"
                    >
                      <option value="efectivo_usd">Efectivo</option>
                      <option value="binance_usdt">Binance</option>
                      <option value="bolivares_pago_movil">Bolívares</option>
                    </select>
                    <button
                      type="button"
                      disabled={isCompleted}
                      onClick={() =>
                        recordInstallmentPayment(plan.id, { paymentMethod: installmentMethod })
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-40 cursor-pointer"
                    >
                      {isCompleted ? 'Completado' : '+ Registrar Cuota'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {payingExpense && (
        <PayExpenseModal
          key={payingExpense.id}
          expense={payingExpense}
          onClose={() => setPayingExpense(null)}
        />
      )}
    </div>
  );
}
