import { useState } from 'react';
import { Banknote, CheckCircle2, Coins, Smartphone, Wallet, X } from 'lucide-react';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type { AssetBucketId, EnvelopeId, InstallmentPlan, PaymentMethod } from '../types';
import { formatBs, formatUsd } from '../utils/calculations';

interface RecordInstallmentModalProps {
  plan: InstallmentPlan;
  onClose: () => void;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'efectivo_usd', label: 'Efectivo USD', icon: <Banknote size={15} /> },
  { id: 'binance_usdt', label: 'Binance USDT / USDC', icon: <Coins size={15} /> },
  { id: 'bolivares_pago_movil', label: 'Bolívares / Pago Móvil', icon: <Smartphone size={15} /> },
  { id: 'otro', label: 'Otro', icon: <Wallet size={15} /> },
];

export function RecordInstallmentModal({ plan, onClose }: RecordInstallmentModalProps) {
  const { recordInstallmentPayment, customAccounts, bcvRate } = useBudgetStore();
  const isReceivable = (plan.direction ?? 'receivable') === 'receivable';

  const [amount, setAmount] = useState(String(plan.installmentAmount));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_usd');
  const [customBucketId, setCustomBucketId] = useState<AssetBucketId | null>(null);
  const [inputInBs, setInputInBs] = useState(false);
  const [envelopeId, setEnvelopeId] = useState<EnvelopeId>(
    isReceivable ? 'ahorro_inversion' : 'imprescindibles',
  );

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const effectiveRate = bcvRate ?? 0;
  const parsedVal = parseFloat(amount) || 0;
  const computedUsd = inputInBs && hasValidRate ? parsedVal / effectiveRate : parsedVal;
  const computedBs = inputInBs ? parsedVal : hasValidRate ? parsedVal * effectiveRate : 0;

  const remainingCap =
    plan.maxCap !== null ? Math.max(0, Number((plan.maxCap - plan.paidTotal).toFixed(2))) : null;

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
    if (!Number.isFinite(computedUsd) || computedUsd <= 0) return;

    recordInstallmentPayment(plan.id, {
      amountOverride: Number(computedUsd.toFixed(2)),
      paymentMethod,
      envelopeId,
      bucketOverride: customBucketId ?? undefined,
      amountBs:
        paymentMethod === 'bolivares_pago_movil' && hasValidRate
          ? Number(computedBs.toFixed(2))
          : undefined,
      bcvRateUsed: hasValidRate ? effectiveRate : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <CheckCircle2
                size={18}
                className={isReceivable ? 'text-accent-green' : 'text-accent-gold'}
              />
              {isReceivable ? 'Registrar Cobro / Abono' : 'Registrar Pago de Cuota'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {plan.name} · Cuota #{plan.paymentsCount + 1}
              {remainingCap !== null ? ` · Resta por ${isReceivable ? 'cobrar' : 'pagar'}: ${formatUsd(remainingCap)}` : ''}
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
          <div>
            <label className="text-xs text-text-muted block mb-1.5">
              {isReceivable ? '¿Dónde recibiste el dinero?' : '¿De dónde salió el dinero?'}
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
                {customAccounts.map((acct) => (
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
                      customBucketId === acct.id
                        ? 'bg-accent-green/20 border-accent-green text-accent-green'
                        : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {acct.name} ({acct.currency})
                  </button>
                ))}
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
                required
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

            {!customBucketId && (
              <div>
                <label className="text-xs text-text-muted block mb-1.5">
                  {isReceivable ? 'Asignar a sobre' : 'Descontar de sobre'}
                </label>
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
            )}
          </div>

          <button
            type="submit"
            className={`w-full py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
              isReceivable
                ? 'bg-accent-green/20 border-accent-green/40 text-accent-green hover:bg-accent-green/30'
                : 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30'
            }`}
          >
            {isReceivable ? 'Registrar Cobro' : 'Registrar Pago'} ({formatUsd(computedUsd)})
          </button>
        </form>
      </div>
    </div>
  );
}
