import { useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Coins, Smartphone, Wallet, X } from 'lucide-react';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type { AssetBucketId, EnvelopeId, PaymentMethod, RecurringExpense } from '../types';
import { calculateEnvelopeSummaries, formatBs, formatUsd } from '../utils/calculations';

interface PayExpenseModalProps {
  expense: RecurringExpense;
  onClose: () => void;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'efectivo_usd', label: 'Efectivo USD', icon: <Banknote size={15} /> },
  { id: 'binance_usdt', label: 'Binance USDT / USDC', icon: <Coins size={15} /> },
  { id: 'bolivares_pago_movil', label: 'Bolívares / Pago Móvil', icon: <Smartphone size={15} /> },
  { id: 'otro', label: 'Otro', icon: <Wallet size={15} /> },
];

export function PayExpenseModal({ expense, onClose }: PayExpenseModalProps) {
  const {
    markExpensePaid,
    customAccounts,
    bcvRate,
    movements,
    freeBsPoolMode,
    setFreeBsPoolMode,
  } = useBudgetStore();
  const initialMethod: PaymentMethod = expense.preferredPaymentMethod ?? 'efectivo_usd';
  const hasValidRateInit = Boolean(bcvRate && bcvRate > 0);
  const initialInBs = initialMethod === 'bolivares_pago_movil' && hasValidRateInit;
  const [amount, setAmount] = useState(() =>
    initialInBs && bcvRate ? (expense.amountUsd * bcvRate).toFixed(2) : String(expense.amountUsd),
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [customBucketId, setCustomBucketId] = useState<AssetBucketId | null>(null);
  const [inputInBs, setInputInBs] = useState(initialInBs);
  const [envelopeId, setEnvelopeId] = useState<EnvelopeId>(() =>
    expense.frequency === 'anual' ? 'provisiones_anuales' : expense.envelopeId,
  );
  const [logToLedger, setLogToLedger] = useState(true);

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const effectiveRate = bcvRate ?? 0;
  const parsedVal = parseFloat(amount) || 0;
  const computedUsd = inputInBs && hasValidRate ? parsedVal / effectiveRate : parsedVal;
  const computedBs = inputInBs ? parsedVal : hasValidRate ? parsedVal * effectiveRate : 0;

  const envBsAvail = useMemo(
    () =>
      calculateEnvelopeSummaries(movements, { freeBsPoolMode }).find((e) => e.id === envelopeId)
        ?.byMethod.bolivares ?? 0,
    [movements, freeBsPoolMode, envelopeId],
  );
  const bsExceedsEnvelope =
    logToLedger &&
    !customBucketId &&
    paymentMethod === 'bolivares_pago_movil' &&
    computedUsd > Math.max(0, envBsAvail) + 0.01;

  const handleSelectMethod = (next: PaymentMethod) => {
    setCustomBucketId(null);
    setPaymentMethod(next);
    if (next === 'bolivares_pago_movil' && hasValidRate && !inputInBs) {
      setInputInBs(true);
      setAmount((parsedVal * effectiveRate).toFixed(2));
    } else if (next !== 'bolivares_pago_movil' && inputInBs && hasValidRate) {
      setInputInBs(false);
      setAmount((parsedVal / effectiveRate).toFixed(2));
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (logToLedger && (!Number.isFinite(parsedVal) || parsedVal <= 0)) return;

    markExpensePaid(expense.id, {
      logToLedger,
      paymentMethod,
      amountUsd: Number.isFinite(computedUsd) && computedUsd > 0 ? computedUsd : expense.amountUsd,
      amountBs:
        paymentMethod === 'bolivares_pago_movil' && hasValidRate
          ? Number(computedBs.toFixed(2))
          : undefined,
      bcvRateUsed: hasValidRate ? effectiveRate : undefined,
      envelopeId,
      bucketOverride: customBucketId ?? undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <CheckCircle2 size={18} className="text-accent-green" /> Registrar Pago
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {expense.name} · Vence {expense.nextDueDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary bg-bg-input border-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          {/* Payment source */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">
              ¿De dónde salió el dinero?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectMethod(opt.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    !customBucketId && paymentMethod === opt.id
                      ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                      : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {opt.icon}
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
            {customAccounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {customAccounts.map((acct) => {
                  const selected = customBucketId === acct.id;
                  return (
                    <button
                      key={acct.id}
                      type="button"
                      onClick={() => {
                        const targetMethod: PaymentMethod =
                          acct.currency === 'VES' ? 'bolivares_pago_movil' : 'otro';
                        handleSelectMethod(targetMethod);
                        setCustomBucketId(acct.id);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                        selected
                          ? 'bg-accent-green/20 border-accent-green text-accent-green'
                          : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {acct.name} ({acct.currency})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-muted">
                  Monto ({inputInBs ? 'Bs' : '$'})
                </label>
                {hasValidRate && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextInBs = !inputInBs;
                      setInputInBs(nextInBs);
                      if (parsedVal > 0) {
                        setAmount(
                          nextInBs
                            ? (parsedVal * effectiveRate).toFixed(2)
                            : (parsedVal / effectiveRate).toFixed(2),
                        );
                      }
                    }}
                    className="text-[10px] text-cyan-300 underline bg-transparent border-none cursor-pointer"
                  >
                    {inputInBs ? 'En $' : 'En Bs'}
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required={logToLedger}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-base font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
              {hasValidRate && (
                <p className="text-[10px] text-cyan-300 mt-1">
                  {inputInBs
                    ? `≈ ${formatUsd(computedUsd)} USD (BCV)`
                    : paymentMethod === 'bolivares_pago_movil'
                      ? `≈ ${formatBs(computedBs)} (BCV)`
                      : ''}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1.5">Sobre (partida)</label>
              <select
                value={envelopeId}
                onChange={(e) => setEnvelopeId(e.target.value as EnvelopeId)}
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {(Object.keys(ENVELOPE_META) as EnvelopeId[]).map((id) => (
                  <option key={id} value={id}>
                    {ENVELOPE_META[id].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {bsExceedsEnvelope && (
            <div
              className={`rounded-xl p-2.5 border text-[11px] flex items-center justify-between gap-2 ${
                freeBsPoolMode
                  ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-200'
                  : 'bg-accent-gold/10 border-accent-gold/35 text-accent-gold'
              }`}
            >
              <span className="leading-snug">
                {freeBsPoolMode
                  ? `ℹ️ Modo Saldo Libre Bs: el excedente sobre los Bs de ${ENVELOPE_META[envelopeId].shortName} (${formatUsd(Math.max(0, envBsAvail))}) saldrá de tu saldo libre en Cuenta en Bolívares.`
                  : `⚠️ ${ENVELOPE_META[envelopeId].shortName} solo tiene ${formatUsd(Math.max(0, envBsAvail))} en Bs y quedará con custodia Bs en negativo.`}
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
          )}

          <label className="flex items-center justify-between gap-3 bg-bg-input/50 border border-border rounded-xl p-3 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-text-primary">
                Descontar en el ledger
              </p>
              <p className="text-[11px] text-text-muted">
                Desactiva si ya registraste el gasto antes y solo quieres mover la fecha.
              </p>
            </div>
            <input
              type="checkbox"
              checked={logToLedger}
              onChange={(e) => setLogToLedger(e.target.checked)}
              className="w-4 h-4 accent-accent-green cursor-pointer"
            />
          </label>

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-sm font-bold bg-accent-green/20 border border-accent-green/40 text-accent-green hover:bg-accent-green/30 transition-all cursor-pointer"
          >
            Confirmar Pago ({formatUsd(computedUsd)})
          </button>
        </form>
      </div>
    </div>
  );
}
