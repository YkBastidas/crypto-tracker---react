import { useState } from 'react';
import { Banknote, CheckCircle2, Coins, Smartphone, Wallet, X } from 'lucide-react';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type { EnvelopeId, PaymentMethod, RecurringExpense } from '../types';
import { formatUsd } from '../utils/calculations';

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
  const { markExpensePaid } = useBudgetStore();
  const [amount, setAmount] = useState(String(expense.amountUsd));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_usd');
  const [envelopeId, setEnvelopeId] = useState<EnvelopeId>(expense.envelopeId);
  const [logToLedger, setLogToLedger] = useState(true);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = parseFloat(amount);
    if (logToLedger && (!Number.isFinite(numeric) || numeric <= 0)) return;

    markExpensePaid(expense.id, {
      logToLedger,
      paymentMethod,
      amountUsd: Number.isFinite(numeric) && numeric > 0 ? numeric : expense.amountUsd,
      envelopeId,
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
                  onClick={() => setPaymentMethod(opt.id)}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Monto pagado ($)</label>
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
            Confirmar Pago ({formatUsd(parseFloat(amount) || 0)})
          </button>
        </form>
      </div>
    </div>
  );
}
