import { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Layers,
  Package,
  Pencil,
  Plus,
  Repeat,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type {
  EnvelopeId,
  ExpenseFrequency,
  InstallmentDirection,
  InstallmentFrequency,
  InstallmentPlan,
  PaymentMethod,
  RecurringExpense,
} from '../types';

import {
  calculateDaysLeft,
  formatBs,
  formatUsd,
  getActiveCustodyOptions,
  getExpenseBiweeklyQuota,
  getInstallmentArrears,
  getInstallmentBiweeklyQuota,
  getInstallmentPaymentHistory,
  getPaymentMethodLabel,
} from '../utils/calculations';
import { PayExpenseModal } from './PayExpenseModal';
import { RecordInstallmentModal } from './RecordInstallmentModal';

export function ExpensesAndPayments() {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const {
    movements,
    expenses,
    installments,
    customAccounts,
    nativeAccountOverrides,
    addExpense,
    updateExpense,
    removeExpense,
    addInstallment,
    updateInstallment,
    removeInstallment,
    recordInstallmentPayment,
    updateInstallmentPayment,
    removeInstallmentPayment,
  } = useBudgetStore();

  const custodyOptions = useMemo(
    () => getActiveCustodyOptions(customAccounts, nativeAccountOverrides),
    [customAccounts, nativeAccountOverrides],
  );

  const [expenseFilter, setExpenseFilter] = useState<'all' | 'mensual' | 'anual'>('all');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [showAddInstallment, setShowAddInstallment] = useState(false);
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [payingExpense, setPayingExpense] = useState<RecurringExpense | null>(null);
  const [recordingPlan, setRecordingPlan] = useState<InstallmentPlan | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});
  const [editingPaymentTarget, setEditingPaymentTarget] = useState<{
    planId: string;
    paymentId: string;
    isOffLedger: boolean;
  } | null>(null);
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayNotes, setEditPayNotes] = useState('');
  const [editPayKind, setEditPayKind] = useState<'historical' | 'in_kind'>('historical');
  const [addingHistoryPlanId, setAddingHistoryPlanId] = useState<string | null>(null);
  const [histDate, setHistDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [histAmount, setHistAmount] = useState('');
  const [histNotes, setHistNotes] = useState('');
  const [histKind, setHistKind] = useState<'historical' | 'in_kind'>('historical');
  const [histAllocateUnlogged, setHistAllocateUnlogged] = useState(true);

  // New Expense form state
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expFreq, setExpFreq] = useState<ExpenseFrequency>('mensual');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expEnv, setExpEnv] = useState<EnvelopeId>('imprescindibles');
  const [expPreferredMethod, setExpPreferredMethod] = useState<PaymentMethod | ''>('');

  // New Installment form state
  const [instName, setInstName] = useState('');
  const [instDirection, setInstDirection] = useState<InstallmentDirection>('receivable');
  const [instAmount, setInstAmount] = useState('');
  const [instFreq, setInstFreq] = useState<InstallmentFrequency>('semanal');
  const [instCap, setInstCap] = useState('');
  const [instPaidTotal, setInstPaidTotal] = useState('0');
  const [instPaymentsCount, setInstPaymentsCount] = useState('0');
  const [instStartDate, setInstStartDate] = useState('');
  const [instNextDueDate, setInstNextDueDate] = useState('');
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

  const startEditExpense = (item: RecurringExpense) => {
    setEditingExpenseId(item.id);
    setExpName(item.name);
    setExpAmount(String(item.amountUsd));
    setExpFreq(item.frequency);
    setExpDate(item.nextDueDate);
    setExpEnv(item.envelopeId);
    setExpPreferredMethod(item.preferredPaymentMethod ?? '');
    setShowAddExpense(true);
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expAmount);
    if (!expName.trim() || !Number.isFinite(amount) || amount <= 0) return;

    const preferredPaymentMethod = expPreferredMethod || undefined;

    if (editingExpenseId) {
      updateExpense(editingExpenseId, {
        name: expName.trim(),
        amountUsd: Number(amount.toFixed(2)),
        frequency: expFreq,
        nextDueDate: expDate,
        envelopeId: expEnv,
        preferredPaymentMethod,
      });
    } else {
      addExpense({
        name: expName.trim(),
        amountUsd: Number(amount.toFixed(2)),
        frequency: expFreq,
        nextDueDate: expDate,
        envelopeId: expEnv,
        preferredPaymentMethod,
        active: true,
      });
    }
    setEditingExpenseId(null);
    setExpName('');
    setExpAmount('');
    setExpPreferredMethod('');
    setShowAddExpense(false);
  };

  const startEditInstallment = (plan: InstallmentPlan) => {
    setEditingInstallmentId(plan.id);
    setInstName(plan.name);
    setInstDirection(plan.direction ?? 'receivable');
    setInstAmount(String(plan.installmentAmount));
    setInstFreq(plan.frequency);
    setInstCap(plan.maxCap ? String(plan.maxCap) : '');
    setInstPaidTotal(String(plan.paidTotal));
    setInstPaymentsCount(String(plan.paymentsCount));
    setInstStartDate(plan.startDate ?? '');
    setInstNextDueDate(plan.nextDueDate ?? '');
    setInstNotes(plan.notes ?? '');
    setShowAddInstallment(true);
  };

  const handleCreateInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(instAmount);
    if (!instName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const cap = instCap.trim() ? parseFloat(instCap) : null;
    const paidTotal = Math.max(0, parseFloat(instPaidTotal) || 0);
    const paymentsCount = Math.max(0, Math.round(parseFloat(instPaymentsCount) || 0));

    if (editingInstallmentId) {
      updateInstallment(editingInstallmentId, {
        name: instName.trim(),
        direction: instDirection,
        installmentAmount: Number(amount.toFixed(2)),
        frequency: instFreq,
        maxCap: cap && Number.isFinite(cap) && cap > 0 ? cap : null,
        paidTotal: Number(paidTotal.toFixed(2)),
        paymentsCount,
        startDate: instStartDate.trim() || undefined,
        nextDueDate: instNextDueDate.trim() || undefined,
        notes: instNotes.trim() || undefined,
      });
    } else {
      addInstallment({
        name: instName.trim(),
        direction: instDirection,
        installmentAmount: Number(amount.toFixed(2)),
        frequency: instFreq,
        maxCap: cap && Number.isFinite(cap) && cap > 0 ? cap : null,
        paidTotal: Number(paidTotal.toFixed(2)),
        paymentsCount,
        startDate: instStartDate.trim() || undefined,
        nextDueDate: instNextDueDate.trim() || undefined,
        notes: instNotes.trim() || undefined,
      });
    }
    setEditingInstallmentId(null);
    setInstName('');
    setInstDirection('receivable');
    setInstAmount('');
    setInstCap('');
    setInstPaidTotal('0');
    setInstPaymentsCount('0');
    setInstStartDate('');
    setInstNextDueDate('');
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
              onClick={() => {
                setEditingExpenseId(null);
                setExpName('');
                setExpAmount('');
                setExpPreferredMethod('');
                setShowAddExpense((v) => !v);
              }}
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
              <select
                value={expEnv}
                onChange={(e) => setExpEnv(e.target.value as EnvelopeId)}
                className="w-full px-2 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                {(Object.keys(ENVELOPE_META) as EnvelopeId[]).map((id) => (
                  <option key={id} value={id}>
                    {ENVELOPE_META[id].shortName}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-[11px] text-text-muted block mb-1">
                Forma de pago más común (para sugerir cambios de custodia)
              </label>
              <div className="flex gap-2">
                <select
                  value={expPreferredMethod}
                  onChange={(e) => setExpPreferredMethod(e.target.value as PaymentMethod | '')}
                  className="flex-1 px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                >
                  <option value="">Cualquiera / Sin preferencia</option>
                  {custodyOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-accent-blue text-white border-none cursor-pointer flex items-center gap-1"
                >
                  <Check size={14} /> {editingExpenseId ? 'Guardar' : 'Agregar'}
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
                    {item.preferredPaymentMethod && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/25 text-accent-blue font-medium">
                        {getPaymentMethodLabel(
                          item.preferredPaymentMethod,
                          customAccounts,
                          nativeAccountOverrides,
                        )}
                      </span>
                    )}
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
                      onClick={() => startEditExpense(item)}
                      title="Editar gasto"
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-blue bg-transparent border-none cursor-pointer"
                    >
                      <Pencil size={14} />
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

      {/* Section 2: Cuentas por Cobrar y Cuotas */}
      <section className="bg-bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Repeat size={18} className="text-accent-green" /> Cuentas por Cobrar y Cuotas
            </h2>
            <p className="text-xs text-text-muted">
              Deudas que te pagan en cuotas (ingresos) o compromisos por pagar con meta y progreso.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingInstallmentId(null);
              setInstName('');
              setInstDirection('receivable');
              setInstAmount('');
              setInstCap('');
              setInstPaidTotal('0');
              setInstPaymentsCount('0');
              setInstStartDate('');
              setInstNextDueDate('');
              setInstNotes('');
              setShowAddInstallment((v) => !v);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-gold/15 border border-accent-gold/40 text-accent-gold hover:bg-accent-gold/25 cursor-pointer shrink-0"
          >
            <Plus size={14} /> Nueva Cuenta
          </button>
        </div>

        {showAddInstallment && (
          <form
            onSubmit={handleCreateInstallment}
            className="bg-bg-input/60 border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Tipo</label>
              <select
                value={instDirection}
                onChange={(e) => setInstDirection(e.target.value as InstallmentDirection)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                <option value="receivable">Por Cobrar (Me deben)</option>
                <option value="payable">Por Pagar (Debo)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Nombre / Persona</label>
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
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Meta / Tope ($)</label>
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
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Acumulado ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={instPaidTotal}
                onChange={(e) => setInstPaidTotal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1"># Cuotas</label>
              <input
                type="number"
                step="1"
                min="0"
                value={instPaymentsCount}
                onChange={(e) => setInstPaymentsCount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap gap-2 items-end">
              <div className="w-36">
                <label className="text-[11px] text-text-muted block mb-1">Próximo pago/cobro</label>
                <input
                  type="date"
                  value={instNextDueDate}
                  onChange={(e) => setInstNextDueDate(e.target.value)}
                  className="w-full px-2 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                />
              </div>
              <div className="w-36">
                <label className="text-[11px] text-text-muted block mb-1">Inicio (opc.)</label>
                <input
                  type="date"
                  value={instStartDate}
                  onChange={(e) => setInstStartDate(e.target.value)}
                  className="w-full px-2 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-text-muted block mb-1">Notas (opc.)</label>
                <input
                  type="text"
                  value={instNotes}
                  onChange={(e) => setInstNotes(e.target.value)}
                  placeholder="Ej. Pagado completo hasta diciembre"
                  className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-bold bg-accent-gold text-black border-none cursor-pointer"
              >
                <Check size={14} />
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {installments.map((plan) => {
            const isReceivable = (plan.direction ?? 'receivable') === 'receivable';
            const hasCap = plan.maxCap !== null && plan.maxCap > 0;
            const progressPct = hasCap
              ? Math.min(100, (plan.paidTotal / (plan.maxCap as number)) * 100)
              : 0;
            const isCompleted = hasCap && plan.paidTotal >= (plan.maxCap as number);
            const biweekly = getInstallmentBiweeklyQuota(plan);
            const arrears = getInstallmentArrears(plan);
            const dueDaysLeft = plan.nextDueDate ? calculateDaysLeft(plan.nextDueDate) : null;
            const history = getInstallmentPaymentHistory(plan, movements);
            const isHistoryExpanded = Boolean(expandedHistoryIds[plan.id]);

            return (
              <div
                key={plan.id}
                className="bg-bg-input/40 border border-border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Layers
                        size={15}
                        className={isReceivable ? 'text-accent-green' : 'text-accent-gold'}
                      />
                      <h3 className="text-sm font-bold text-text-primary">{plan.name}</h3>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isReceivable
                            ? 'bg-accent-green/15 text-accent-green'
                            : 'bg-accent-gold/15 text-accent-gold'
                        }`}
                      >
                        {isReceivable ? 'Por Cobrar' : 'Por Pagar'}
                      </span>
                      {history.inKindTotalUsd > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
                          <Package size={11} />
                          En especie:{' '}
                          <PrivacyValue
                            value={formatUsd(history.inKindTotalUsd)}
                            isPrivate={isPrivate}
                          />
                        </span>
                      )}
                      {dueDaysLeft !== null && !isCompleted && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            dueDaysLeft < 0
                              ? 'bg-accent-red/15 text-accent-red'
                              : dueDaysLeft <= 7
                                ? 'bg-accent-gold/20 text-accent-gold'
                                : 'bg-bg-input text-text-muted'
                          }`}
                        >
                          {dueDaysLeft < 0
                            ? `Vencido hace ${Math.abs(dueDaysLeft)}d`
                            : dueDaysLeft === 0
                              ? 'Vence hoy'
                              : `${dueDaysLeft}d restantes`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      <PrivacyValue value={formatUsd(plan.installmentAmount)} isPrivate={isPrivate} />{' '}
                      / {plan.frequency} · {plan.paymentsCount}{' '}
                      {isReceivable ? 'cobros' : 'cuotas'}
                      {plan.nextDueDate ? ` · Próx: ${plan.nextDueDate}` : ''}
                    </p>
                    {plan.notes && (
                      <p className="text-[11px] text-text-muted/80 mt-0.5">{plan.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditInstallment(plan)}
                      title="Editar cuenta"
                      className="p-1 text-text-muted hover:text-accent-blue bg-transparent border-none cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeInstallment(plan.id)}
                      title="Eliminar cuenta"
                      className="p-1 text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {arrears && arrears.arrearsUsd > 0 && (
                  <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-2.5 py-1.5 text-[11px] text-accent-red flex items-center justify-between">
                    <span>
                      Atraso estimado ({arrears.behindPeriods}{' '}
                      {plan.frequency === 'semanal' ? 'sem.' : 'per.'}):
                    </span>
                    <strong>
                      <PrivacyValue value={formatUsd(arrears.arrearsUsd)} isPrivate={isPrivate} />
                    </strong>
                  </div>
                )}

                {hasCap ? (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-muted">
                        {isReceivable ? 'Cobrado:' : 'Pagado:'}{' '}
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
                          isCompleted
                            ? 'bg-accent-green'
                            : isReceivable
                              ? 'bg-accent-blue'
                              : 'bg-accent-gold'
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
                    {isReceivable ? (
                      hasCap ? (
                        <>
                          Resta por cobrar:{' '}
                          <strong className="text-text-primary">
                            <PrivacyValue
                              value={formatUsd(Math.max(0, (plan.maxCap as number) - plan.paidTotal))}
                              isPrivate={isPrivate}
                            />
                          </strong>
                        </>
                      ) : (
                        'Ingreso al cobrar'
                      )
                    ) : (
                      <>
                        Quincenal recom.:{' '}
                        <strong className="text-accent-gold">
                          <PrivacyValue value={formatUsd(biweekly)} isPrivate={isPrivate} />
                        </strong>
                      </>
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedHistoryIds((prev) => ({
                          ...prev,
                          [plan.id]: !prev[plan.id],
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                        isHistoryExpanded
                          ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                          : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <History size={13} />
                      <span>Historial ({history.records.length})</span>
                      {isHistoryExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={isCompleted}
                      onClick={() => setRecordingPlan(plan)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40 cursor-pointer ${
                        isReceivable
                          ? 'bg-accent-green/15 border-accent-green/40 text-accent-green hover:bg-accent-green/25'
                          : 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30'
                      }`}
                    >
                      {isCompleted
                        ? isReceivable
                          ? 'Cobrado 100%'
                          : 'Completado'
                        : isReceivable
                          ? '+ Registrar Cobro'
                          : '+ Registrar Cuota'}
                    </button>
                  </div>
                </div>

                {isHistoryExpanded && (
                  <div className="border-t border-border/70 pt-3 space-y-2.5">
                    {(() => {
                      const activeKindCount =
                        (history.monetaryTotalUsd > 0 ? 1 : 0) +
                        (history.historicalTotalUsd > 0 ? 1 : 0) +
                        (history.inKindTotalUsd > 0 ? 1 : 0);
                      const hasUnlogged =
                        history.unloggedTotalUsd > 0.01 || history.unloggedCount > 0;
                      const isAddingHistory = addingHistoryPlanId === plan.id;

                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                            {activeKindCount >= 2 ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                {history.monetaryTotalUsd > 0 && (
                                  <span>
                                    Dinero:{' '}
                                    <strong className="text-text-primary">
                                      <PrivacyValue
                                        value={formatUsd(history.monetaryTotalUsd)}
                                        isPrivate={isPrivate}
                                      />
                                    </strong>
                                  </span>
                                )}
                                {history.historicalTotalUsd > 0 && (
                                  <span>
                                    {history.monetaryTotalUsd > 0 ? '· ' : ''}Histórico:{' '}
                                    <strong className="text-amber-300">
                                      <PrivacyValue
                                        value={formatUsd(history.historicalTotalUsd)}
                                        isPrivate={isPrivate}
                                      />
                                    </strong>
                                  </span>
                                )}
                                {history.inKindTotalUsd > 0 && (
                                  <span>
                                    · En especie:{' '}
                                    <strong className="text-purple-300">
                                      <PrivacyValue
                                        value={formatUsd(history.inKindTotalUsd)}
                                        isPrivate={isPrivate}
                                      />
                                    </strong>
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span>Historial de pagos y abonos</span>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (isAddingHistory) {
                                  setAddingHistoryPlanId(null);
                                  return;
                                }
                                const suggestedAmt =
                                  history.unloggedTotalUsd > 0.01
                                    ? Math.min(plan.installmentAmount, history.unloggedTotalUsd)
                                    : plan.installmentAmount;
                                setAddingHistoryPlanId(plan.id);
                                setHistAmount(String(Number(suggestedAmt.toFixed(2))));
                                setHistNotes('');
                                setHistKind('historical');
                                setHistAllocateUnlogged(hasUnlogged);
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                                isAddingHistory
                                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                                  : 'bg-bg-input border-border text-text-primary hover:border-amber-400/50 hover:text-amber-200'
                              }`}
                            >
                              <Plus size={12} /> Pago histórico
                            </button>
                          </div>

                          {isAddingHistory && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const parsed = parseFloat(histAmount);
                                if (!Number.isFinite(parsed) || parsed <= 0 || !histDate) return;
                                const useAllocate = histAllocateUnlogged && hasUnlogged;
                                recordInstallmentPayment(plan.id, {
                                  settlementKind: histKind,
                                  date: histDate,
                                  amountOverride: Number(parsed.toFixed(2)),
                                  notes: histNotes,
                                  allocateFromUnlogged: useAllocate,
                                  advanceDueDate: false,
                                });
                                setHistNotes('');
                                if (useAllocate) {
                                  const nextUnlogged = Math.max(
                                    0,
                                    Number((history.unloggedTotalUsd - parsed).toFixed(2)),
                                  );
                                  if (nextUnlogged <= 0.01 && history.unloggedCount <= 1) {
                                    setHistAllocateUnlogged(false);
                                    setAddingHistoryPlanId(null);
                                  } else if (nextUnlogged > 0.01) {
                                    setHistAmount(
                                      String(
                                        Number(
                                          Math.min(plan.installmentAmount, nextUnlogged).toFixed(2),
                                        ),
                                      ),
                                    );
                                  }
                                }
                              }}
                              className="bg-amber-500/5 border border-amber-400/30 rounded-xl p-3 space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-amber-200">
                                  Registrar pago anterior (sin tocar sobres ni cuentas)
                                </span>
                                <div className="flex rounded-lg overflow-hidden border border-border text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => setHistKind('historical')}
                                    className={`px-2 py-1 font-semibold border-none cursor-pointer ${
                                      histKind === 'historical'
                                        ? 'bg-amber-500/25 text-amber-200'
                                        : 'bg-bg-input text-text-muted hover:text-text-primary'
                                    }`}
                                  >
                                    Histórico (previo)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHistKind('in_kind')}
                                    className={`px-2 py-1 font-semibold border-none cursor-pointer ${
                                      histKind === 'in_kind'
                                        ? 'bg-purple-500/25 text-purple-200'
                                        : 'bg-bg-input text-text-muted hover:text-text-primary'
                                    }`}
                                  >
                                    En especie
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] text-text-muted block mb-1">
                                    Fecha
                                  </label>
                                  <input
                                    type="date"
                                    required
                                    value={histDate}
                                    onChange={(e) => setHistDate(e.target.value)}
                                    className="w-full px-2 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-amber-400/60"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <label className="text-[10px] text-text-muted">Monto ($)</label>
                                    {history.unloggedTotalUsd > 0.01 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setHistAmount(String(history.unloggedTotalUsd))
                                        }
                                        className="text-[10px] text-amber-300 underline bg-transparent border-none cursor-pointer"
                                      >
                                        Previo: {formatUsd(history.unloggedTotalUsd)}
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    inputMode="decimal"
                                    required
                                    value={histAmount}
                                    onChange={(e) => setHistAmount(e.target.value)}
                                    className="w-full px-2 py-1.5 rounded-lg text-xs font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-amber-400/60"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-text-muted block mb-1">
                                    Nota (opc.)
                                  </label>
                                  <input
                                    type="text"
                                    value={histNotes}
                                    onChange={(e) => setHistNotes(e.target.value)}
                                    placeholder="Ej. Efectivo, Trueque reloj..."
                                    className="w-full px-2 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-amber-400/60"
                                  />
                                </div>
                              </div>

                              {hasUnlogged && (
                                <label className="flex items-start gap-2 text-[11px] text-text-muted cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={histAllocateUnlogged}
                                    onChange={(e) => setHistAllocateUnlogged(e.target.checked)}
                                    className="w-3.5 h-3.5 mt-0.5 accent-amber-400 cursor-pointer shrink-0"
                                  />
                                  <span>
                                    Desglosar del saldo previo ya acumulado (sin sumar al total ni
                                    duplicar cuotas).
                                  </span>
                                </label>
                              )}

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAddingHistoryPlanId(null)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
                                >
                                  Cerrar
                                </button>
                                <button
                                  type="submit"
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                                >
                                  <Check size={12} /> Agregar al historial
                                </button>
                              </div>
                            </form>
                          )}

                          {history.records.length === 0 ? (
                            <p className="text-[11px] text-text-muted italic">
                              Aún no hay abonos individuales registrados con fecha.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {history.records.map((rec) => {
                                const isEditingThis =
                                  editingPaymentTarget?.planId === plan.id &&
                                  editingPaymentTarget?.paymentId === rec.id;
                                const isOffLedgerRec =
                                  rec.settlementKind === 'in_kind' ||
                                  rec.settlementKind === 'historical';

                                const custodyLabel = rec.paymentMethod
                                  ? getPaymentMethodLabel(
                                      rec.paymentMethod,
                                      customAccounts,
                                      nativeAccountOverrides,
                                    )
                                  : 'Sin custodia';
                                const envLabel = rec.envelopeId
                                  ? (ENVELOPE_META[rec.envelopeId]?.shortName ?? rec.envelopeId)
                                  : null;

                                const startEditRecord = () => {
                                  setEditingPaymentTarget({
                                    planId: plan.id,
                                    paymentId: rec.id,
                                    isOffLedger: isOffLedgerRec,
                                  });
                                  setEditPayDate(rec.date);
                                  setEditPayAmount(String(rec.amountUsd));
                                  setEditPayNotes(rec.notes ?? '');
                                  if (
                                    rec.settlementKind === 'in_kind' ||
                                    rec.settlementKind === 'historical'
                                  ) {
                                    setEditPayKind(rec.settlementKind);
                                  }
                                };

                                const saveEditRecord = () => {
                                  const parsed = parseFloat(editPayAmount);
                                  if (!Number.isFinite(parsed) || parsed <= 0 || !editPayDate) {
                                    return;
                                  }
                                  updateInstallmentPayment(plan.id, rec.id, {
                                    date: editPayDate,
                                    amountUsd: Number(parsed.toFixed(2)),
                                    notes: editPayNotes,
                                    ...(isOffLedgerRec ? { settlementKind: editPayKind } : {}),
                                  });
                                  setEditingPaymentTarget(null);
                                };

                                return (
                                  <div
                                    key={rec.id}
                                    className="bg-bg-card/70 border border-border/80 rounded-lg px-2.5 py-2 space-y-1.5"
                                  >
                                    {isEditingThis ? (
                                      <div className="space-y-2">
                                        <div
                                          className={`grid gap-2 ${
                                            isOffLedgerRec
                                              ? 'grid-cols-2 sm:grid-cols-4'
                                              : 'grid-cols-2 sm:grid-cols-3'
                                          }`}
                                        >
                                          <div>
                                            <label className="text-[10px] text-text-muted block mb-0.5">
                                              Fecha
                                            </label>
                                            <input
                                              type="date"
                                              value={editPayDate}
                                              onChange={(e) => setEditPayDate(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  saveEditRecord();
                                                } else if (e.key === 'Escape') {
                                                  setEditingPaymentTarget(null);
                                                }
                                              }}
                                              className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-text-muted block mb-0.5">
                                              Monto ($)
                                            </label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              min="0.01"
                                              inputMode="decimal"
                                              value={editPayAmount}
                                              onChange={(e) => setEditPayAmount(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  saveEditRecord();
                                                } else if (e.key === 'Escape') {
                                                  setEditingPaymentTarget(null);
                                                }
                                              }}
                                              className="w-full px-2 py-1 rounded text-[11px] font-bold bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                            />
                                          </div>
                                          {isOffLedgerRec && (
                                            <div>
                                              <label className="text-[10px] text-text-muted block mb-0.5">
                                                Tipo
                                              </label>
                                              <select
                                                value={editPayKind}
                                                onChange={(e) =>
                                                  setEditPayKind(
                                                    e.target.value as 'historical' | 'in_kind',
                                                  )
                                                }
                                                className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                              >
                                                <option value="historical">Histórico</option>
                                                <option value="in_kind">En especie</option>
                                              </select>
                                            </div>
                                          )}
                                          <div
                                            className={
                                              isOffLedgerRec ? 'col-span-2 sm:col-span-1' : 'col-span-2 sm:col-span-1'
                                            }
                                          >
                                            <label className="text-[10px] text-text-muted block mb-0.5">
                                              Nota
                                            </label>
                                            <input
                                              type="text"
                                              value={editPayNotes}
                                              onChange={(e) => setEditPayNotes(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  saveEditRecord();
                                                } else if (e.key === 'Escape') {
                                                  setEditingPaymentTarget(null);
                                                }
                                              }}
                                              placeholder="Ej. Trueque reloj"
                                              className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                            />
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          {!isOffLedgerRec ? (
                                            <span className="text-[10px] text-cyan-300/90">
                                              También actualiza fecha, monto y nota en el ledger.
                                            </span>
                                          ) : (
                                            <span />
                                          )}
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => setEditingPaymentTarget(null)}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-bg-input text-text-muted border border-border cursor-pointer"
                                            >
                                              <X size={11} /> Cancelar
                                            </button>
                                            <button
                                              type="button"
                                              onClick={saveEditRecord}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-accent-green/20 text-accent-green border border-accent-green/40 cursor-pointer"
                                            >
                                              <Check size={11} /> Guardar
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                            <span className="text-[11px] font-mono text-text-muted">
                                              {rec.date}
                                            </span>
                                            <span className="text-xs font-bold text-text-primary">
                                              <PrivacyValue
                                                value={formatUsd(rec.amountUsd)}
                                                isPrivate={isPrivate}
                                              />
                                            </span>
                                            {typeof rec.amountBs === 'number' && rec.amountBs > 0 && (
                                              <span className="text-[10px] text-cyan-300">
                                                (
                                                <PrivacyValue
                                                  value={formatBs(rec.amountBs)}
                                                  isPrivate={isPrivate}
                                                />
                                                )
                                              </span>
                                            )}
                                            {rec.settlementKind === 'in_kind' ? (
                                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300">
                                                <Package size={10} /> En especie · Sin cuentas
                                              </span>
                                            ) : rec.settlementKind === 'historical' ? (
                                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200">
                                                <History size={10} /> Histórico · Sin cuentas
                                              </span>
                                            ) : (
                                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-muted">
                                                {custodyLabel}
                                                {envLabel ? ` · ${envLabel}` : ''}
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              title="Editar pago (fecha, monto, nota)"
                                              onClick={startEditRecord}
                                              className="p-1 rounded text-text-muted hover:text-accent-blue bg-transparent border-none cursor-pointer"
                                            >
                                              <Pencil size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              title="Eliminar este abono"
                                              onClick={() => {
                                                if (
                                                  editingPaymentTarget?.planId === plan.id &&
                                                  editingPaymentTarget?.paymentId === rec.id
                                                ) {
                                                  setEditingPaymentTarget(null);
                                                }
                                                removeInstallmentPayment(plan.id, rec.id);
                                              }}
                                              className="p-1 rounded text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        </div>

                                        {rec.notes && (
                                          <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                                            <StickyNote
                                              size={11}
                                              className="shrink-0 text-accent-gold"
                                            />
                                            <span>{rec.notes}</span>
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {hasUnlogged && (
                            <p className="text-[11px] text-text-muted/90 bg-bg-input/60 rounded-lg px-2.5 py-1.5">
                              Saldo previo sin desglose individual:{' '}
                              <strong className="text-text-primary">
                                <PrivacyValue
                                  value={formatUsd(history.unloggedTotalUsd)}
                                  isPrivate={isPrivate}
                                />
                              </strong>{' '}
                              ({history.unloggedCount} abono(s)).
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
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

      {recordingPlan && (
        <RecordInstallmentModal
          key={recordingPlan.id}
          plan={recordingPlan}
          onClose={() => setRecordingPlan(null)}
        />
      )}
    </div>
  );
}
