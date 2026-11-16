import { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Coins,
  Save,
  Smartphone,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import { ENVELOPE_META, PAYMENT_METHOD_LABELS } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type { AllocationMode, EnvelopeId, EnvelopeRule, PaymentMethod } from '../types';
import { computeQuincenaPreview, formatBs, formatUsd } from '../utils/calculations';

interface QuincenaWizardProps {
  onCompleteNavigate: () => void;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'efectivo_usd', label: 'Efectivo USD', icon: <Banknote size={16} /> },
  { id: 'binance_usdt', label: 'Binance USDT/USDC', icon: <Coins size={16} /> },
  { id: 'bolivares_pago_movil', label: 'Bs / Pago Móvil', icon: <Smartphone size={16} /> },
  { id: 'otro', label: 'Otro', icon: <Wallet size={16} /> },
];

export function QuincenaWizard({ onCompleteNavigate }: QuincenaWizardProps) {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const {
    quincenaConfig,
    expenses,
    installments,
    bcvRate,
    updateQuincenaConfig,
    confirmQuincena,
  } = useBudgetStore();

  const [amountInput, setAmountInput] = useState('500');
  const [inputInBs, setInputInBs] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_usd');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [rules, setRules] = useState<EnvelopeRule[]>(quincenaConfig.rules);
  const [autoProvisionExpenses, setAutoProvisionExpenses] = useState(
    quincenaConfig.autoProvisionExpenses,
  );
  const [autoProvisionInstallments, setAutoProvisionInstallments] = useState(
    quincenaConfig.autoProvisionInstallments,
  );
  const [rulesSavedMsg, setRulesSavedMsg] = useState(false);
  const [confirmedSuccess, setConfirmedSuccess] = useState(false);

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const effectiveRate = bcvRate ?? 0;
  const rawInputVal = Math.max(0, parseFloat(amountInput) || 0);
  const grossAmount =
    inputInBs && hasValidRate ? Number((rawInputVal / effectiveRate).toFixed(2)) : rawInputVal;

  const preview = useMemo(
    () =>
      computeQuincenaPreview({
        grossAmount,
        rules,
        autoProvisionExpenses,
        autoProvisionInstallments,
        expenses,
        installments,
      }),
    [
      grossAmount,
      rules,
      autoProvisionExpenses,
      autoProvisionInstallments,
      expenses,
      installments,
    ],
  );

  const totalPercentage = rules
    .filter((r) => r.mode === 'percentage')
    .reduce((acc, r) => acc + r.value, 0);

  const handleRuleChange = (
    envelopeId: EnvelopeId,
    patch: Partial<{ mode: AllocationMode; value: number }>,
  ) => {
    setRules((prev) =>
      prev.map((r) => (r.envelopeId === envelopeId ? { ...r, ...patch } : r)),
    );
  };

  const handleSaveRulesDefault = () => {
    updateQuincenaConfig({
      rules,
      autoProvisionExpenses,
      autoProvisionInstallments,
    });
    setRulesSavedMsg(true);
    setTimeout(() => setRulesSavedMsg(false), 2500);
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (grossAmount <= 0 || preview.isOverAllocated) return;
    confirmQuincena({
      date,
      paymentMethod,
      notes,
      preview,
    });
    setConfirmedSuccess(true);
  };

  if (confirmedSuccess) {
    return (
      <div className="max-w-xl mx-auto bg-bg-card border border-accent-green/40 rounded-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-accent-green/15 text-accent-green flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} />
        </div>
        <h2 className="text-xl font-bold text-text-primary">¡Quincena Registrada!</h2>
        <p className="text-sm text-text-muted">
          Se generaron automáticamente los movimientos en tu ledger por{' '}
          <span className="text-text-primary font-semibold">
            <PrivacyValue value={formatUsd(grossAmount)} isPrivate={isPrivate} />
          </span>{' '}
          ({PAYMENT_METHOD_LABELS[paymentMethod]}).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={onCompleteNavigate}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent-green/20 border border-accent-green/40 text-accent-green hover:bg-accent-green/30 cursor-pointer"
          >
            Ir al Resumen
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmedSuccess(false);
              setNotes('');
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
          >
            Registrar otra quincena
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleConfirm} className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Sparkles size={20} className="text-accent-green" /> Registrar Quincena
          </h2>
          <p className="text-xs text-text-muted">
            Ingresa tu pago, ajusta el reparto y separa cada dólar en segundos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column: Input + Rules */}
        <div className="lg:col-span-7 space-y-5">
          {/* A) Monto y Método de Pago */}
          <div className="bg-bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              1. Ingreso y Método de Pago
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-muted">
                  Monto recibido ({inputInBs ? 'en Bolívares' : 'equivalente USD'})
                </label>
                {hasValidRate && (
                  <div className="flex rounded-lg overflow-hidden border border-border text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        if (inputInBs) {
                          setInputInBs(false);
                          setAmountInput(grossAmount.toFixed(2));
                        }
                      }}
                      className={`px-2 py-0.5 font-semibold border-none cursor-pointer ${
                        !inputInBs ? 'bg-accent-blue text-white' : 'bg-bg-input text-text-muted'
                      }`}
                    >
                      USD ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!inputInBs) {
                          setInputInBs(true);
                          setAmountInput((rawInputVal * effectiveRate).toFixed(2));
                        }
                      }}
                      className={`px-2 py-0.5 font-semibold border-none cursor-pointer ${
                        inputInBs ? 'bg-cyan-500 text-black' : 'bg-bg-input text-text-muted'
                      }`}
                    >
                      Bs (BCV)
                    </button>
                  </div>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-base font-bold">
                  {inputInBs ? 'Bs.' : '$'}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl text-2xl font-extrabold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-green"
                />
              </div>
              {inputInBs && hasValidRate && (
                <p className="text-[11px] text-cyan-300 mt-1">
                  ≈ {formatUsd(grossAmount)} USD según tasa BCV (Bs. {effectiveRate.toFixed(2)}/$)
                </p>
              )}
              {!inputInBs && hasValidRate && paymentMethod === 'bolivares_pago_movil' && (
                <p className="text-[11px] text-cyan-300 mt-1">
                  ≈ {formatBs(grossAmount * effectiveRate)} según tasa BCV
                </p>
              )}
              <div className="flex gap-2 mt-2">
                {(inputInBs ? [5000, 10000, 20000, 30000] : [300, 500, 750, 1000]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountInput(String(preset))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
                  >
                    {inputInBs ? `${preset}` : `$${preset}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1.5">
                ¿Cómo te lo pagaron?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(opt.id);
                      if (opt.id === 'bolivares_pago_movil' && hasValidRate && !inputInBs) {
                        setInputInBs(true);
                        setAmountInput((rawInputVal * effectiveRate).toFixed(2));
                      } else if (opt.id !== 'bolivares_pago_movil' && inputInBs && hasValidRate) {
                        setInputInBs(false);
                        setAmountInput(grossAmount.toFixed(2));
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      paymentMethod === opt.id
                        ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                        : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Nota (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. 1ra quincena noviembre"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>
          </div>

          {/* B) Reglas de Reparto y Provisión */}
          <div className="bg-bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                2. Reglas de Reparto y Provisión
              </h3>
              <button
                type="button"
                onClick={handleSaveRulesDefault}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-bg-input border border-border text-text-muted hover:text-accent-blue hover:border-accent-blue cursor-pointer"
              >
                <Save size={12} /> {rulesSavedMsg ? '¡Guardadas!' : 'Guardar por defecto'}
              </button>
            </div>

            {/* Provision toggles */}
            <div className="space-y-2 bg-bg-input/60 border border-border rounded-xl p-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-text-primary">
                    Provisionar gastos mensuales y anuales
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Prorrateo automático para no quedarte sin liquidez
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoProvisionExpenses}
                  onChange={(e) => setAutoProvisionExpenses(e.target.checked)}
                  className="w-4 h-4 accent-accent-green cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-border">
                <div>
                  <p className="text-xs font-semibold text-text-primary">
                    Provisionar cuotas recurrentes activas
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Reserva la parte quincenal de pagos semanales/mensuales
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoProvisionInstallments}
                  onChange={(e) => setAutoProvisionInstallments(e.target.checked)}
                  className="w-4 h-4 accent-accent-green cursor-pointer"
                />
              </label>
            </div>

            {/* Rules per envelope */}
            <div className="space-y-2.5">
              {rules.map((rule) => {
                const meta = ENVELOPE_META[rule.envelopeId];
                return (
                  <div
                    key={rule.envelopeId}
                    className="flex items-center justify-between gap-2 bg-bg-input/40 border border-border rounded-xl px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">
                        {meta.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex rounded-lg overflow-hidden border border-border">
                        <button
                          type="button"
                          onClick={() => handleRuleChange(rule.envelopeId, { mode: 'percentage' })}
                          className={`px-2.5 py-1 text-xs font-semibold cursor-pointer border-none ${
                            rule.mode === 'percentage'
                              ? 'bg-accent-blue text-white'
                              : 'bg-bg-input text-text-muted'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRuleChange(rule.envelopeId, { mode: 'fixed' })}
                          className={`px-2.5 py-1 text-xs font-semibold cursor-pointer border-none ${
                            rule.mode === 'fixed'
                              ? 'bg-accent-blue text-white'
                              : 'bg-bg-input text-text-muted'
                          }`}
                        >
                          $
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={rule.value}
                        onChange={(e) =>
                          handleRuleChange(rule.envelopeId, {
                            value: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="w-20 px-2.5 py-1 rounded-lg text-xs font-bold text-right bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                      />
                    </div>
                  </div>
                );
              })}

              {totalPercentage !== 100 && rules.some((r) => r.mode === 'percentage') && (
                <p className="text-[11px] text-accent-gold">
                  Nota: tus reglas en porcentaje suman {totalPercentage}% (el excedente irá a Ahorro e Inversión).
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Vista Previa "Dónde separar cada dólar" */}
        <div className="lg:col-span-5">
          <div className="bg-bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                3. Dónde separar cada dólar
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Vista previa antes de generar los movimientos
              </p>
            </div>

            {/* Provision summary */}
            {(autoProvisionExpenses || autoProvisionInstallments) && (
              <div className="bg-bg-input/60 border border-border rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Provisión gastos fijos (M/A):</span>
                  <span className="font-semibold text-text-primary">
                    <PrivacyValue value={formatUsd(preview.expensesProvision)} isPrivate={isPrivate} />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Provisión cuotas activas:</span>
                  <span className="font-semibold text-text-primary">
                    <PrivacyValue
                      value={formatUsd(preview.installmentsProvision)}
                      isPrivate={isPrivate}
                    />
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-border font-bold">
                  <span className="text-accent-gold">Total Provisión (Imprescindibles):</span>
                  <span className="text-accent-gold">
                    <PrivacyValue value={formatUsd(preview.totalProvision)} isPrivate={isPrivate} />
                  </span>
                </div>
              </div>
            )}

            {/* Envelope breakdown */}
            <div className="space-y-2.5">
              {preview.envelopeAllocations.map((alloc) => {
                const meta = ENVELOPE_META[alloc.envelopeId];
                return (
                  <div
                    key={alloc.envelopeId}
                    className="flex items-center justify-between py-2 border-b border-border last:border-none"
                  >
                    <div>
                      <span
                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${meta.badgeBg}`}
                      >
                        {alloc.name}
                      </span>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {alloc.shareOfGross.toFixed(1)}% del ingreso
                      </p>
                    </div>
                    <span className="text-base font-bold text-text-primary">
                      <PrivacyValue value={formatUsd(alloc.amountUsd)} isPrivate={isPrivate} />
                    </span>
                  </div>
                );
              })}

              {preview.unallocated > 0.01 && (
                <div className="flex items-center justify-between py-2 text-xs text-accent-green">
                  <span>Excedente → Ahorro e Inversión</span>
                  <span className="font-bold">
                    <PrivacyValue value={formatUsd(preview.unallocated)} isPrivate={isPrivate} />
                  </span>
                </div>
              )}
            </div>

            {preview.isOverAllocated && (
              <div className="bg-accent-red/15 border border-accent-red/40 text-accent-red rounded-xl p-3 text-xs">
                Los montos fijos y provisiones superan el monto recibido por{' '}
                {formatUsd(Math.abs(preview.unallocated))}. Ajusta las reglas o el monto.
              </div>
            )}

            <button
              type="submit"
              disabled={grossAmount <= 0 || preview.isOverAllocated}
              className="w-full py-3.5 rounded-xl text-sm font-bold bg-accent-green/20 border border-accent-green/50 text-accent-green hover:bg-accent-green/30 disabled:opacity-40 transition-all cursor-pointer"
            >
              Confirmar y Separar {formatUsd(grossAmount)}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
