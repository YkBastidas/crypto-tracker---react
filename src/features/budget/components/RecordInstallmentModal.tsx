import { useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Coins, Landmark, Package, Smartphone, Wallet, X } from 'lucide-react';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type {
  EnvelopeId,
  InstallmentPlan,
  InstallmentSettlementKind,
  PaymentMethod,
} from '../types';
import {
  advanceDueDate,
  formatBs,
  formatUsd,
  getActiveCustodyOptions,
  isBsPaymentMethod,
} from '../utils/calculations';

interface RecordInstallmentModalProps {
  plan: InstallmentPlan;
  onClose: () => void;
}

function getCustodyIcon(id: PaymentMethod, currency: 'USD' | 'VES', isCustom: boolean) {
  if (isCustom) {
    return currency === 'VES' ? <Smartphone size={15} /> : <Landmark size={15} />;
  }
  if (id === 'efectivo_usd') return <Banknote size={15} />;
  if (id === 'binance_usdt') return <Coins size={15} />;
  if (id === 'bolivares_pago_movil') return <Smartphone size={15} />;
  return <Wallet size={15} />;
}

export function RecordInstallmentModal({ plan, onClose }: RecordInstallmentModalProps) {
  const { recordInstallmentPayment, customAccounts, nativeAccountOverrides, bcvRate } =
    useBudgetStore();
  const isReceivable = (plan.direction ?? 'receivable') === 'receivable';

  const custodyOptions = useMemo(
    () =>
      getActiveCustodyOptions(customAccounts, nativeAccountOverrides, {
        includeOtro: true,
      }),
    [customAccounts, nativeAccountOverrides],
  );

  const [settlementKind, setSettlementKind] = useState<InstallmentSettlementKind>('monetary');
  const [amount, setAmount] = useState(String(plan.installmentAmount));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => custodyOptions[0]?.id ?? 'efectivo_usd',
  );
  const [inputInBs, setInputInBs] = useState(false);
  const [envelopeId, setEnvelopeId] = useState<EnvelopeId>(
    isReceivable ? 'ahorro_inversion' : 'imprescindibles',
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [advanceDue, setAdvanceDue] = useState(true);

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const effectiveRate = bcvRate ?? 0;
  const parsedVal = parseFloat(amount) || 0;
  const isMonetary = settlementKind === 'monetary';
  const effectiveInputInBs = isMonetary && inputInBs;
  const computedUsd = effectiveInputInBs && hasValidRate ? parsedVal / effectiveRate : parsedVal;
  const computedBs = effectiveInputInBs ? parsedVal : hasValidRate ? parsedVal * effectiveRate : 0;
  const isSelectedBs = isMonetary && isBsPaymentMethod(paymentMethod, customAccounts);

  const remainingCap =
    plan.maxCap !== null ? Math.max(0, Number((plan.maxCap - plan.paidTotal).toFixed(2))) : null;

  const handleSelectSettlementKind = (next: InstallmentSettlementKind) => {
    setSettlementKind(next);
    setAdvanceDue(next === 'monetary');
    if (next === 'in_kind' && inputInBs) {
      setInputInBs(false);
      if (hasValidRate && parsedVal > 0) {
        setAmount((parsedVal / effectiveRate).toFixed(2));
      }
    }
  };

  const handleSelectMethod = (next: PaymentMethod) => {
    setPaymentMethod(next);
    const nextIsBs = isBsPaymentMethod(next, customAccounts);
    if (nextIsBs && hasValidRate && !inputInBs) {
      setInputInBs(true);
      setAmount((parsedVal * effectiveRate).toFixed(2));
    } else if (!nextIsBs && inputInBs && hasValidRate) {
      setInputInBs(false);
      setAmount((parsedVal / effectiveRate).toFixed(2));
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(computedUsd) || computedUsd <= 0) return;

    recordInstallmentPayment(plan.id, {
      amountOverride: Number(computedUsd.toFixed(2)),
      settlementKind,
      date,
      notes,
      advanceDueDate: advanceDue,
      ...(isMonetary
        ? {
            paymentMethod,
            envelopeId,
            amountBs:
              isSelectedBs && hasValidRate ? Number(computedBs.toFixed(2)) : undefined,
            bcvRateUsed: hasValidRate ? effectiveRate : undefined,
          }
        : {}),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
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
          {/* Settlement Kind Selector */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Tipo de registro</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectSettlementKind('monetary')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isMonetary
                    ? 'bg-accent-green/15 border-accent-green/45 text-accent-green'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                <Wallet size={14} />
                <span className="truncate">
                  {isReceivable ? 'Dinero (a sobre / cuenta)' : 'Dinero (desde sobre / cuenta)'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSettlementKind('in_kind')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  !isMonetary
                    ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                <Package size={14} />
                <span className="truncate">En especie / Sin cuentas</span>
              </button>
            </div>
          </div>

          {isMonetary ? (
            <div>
              <label className="text-xs text-text-muted block mb-1.5">
                {isReceivable ? '¿En qué cuenta / custodia recibiste el dinero?' : '¿De qué cuenta / custodia salió?'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {custodyOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectMethod(opt.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      paymentMethod === opt.id
                        ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                        : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {getCustodyIcon(opt.id, opt.currency, opt.isCustom)}
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-purple-500/10 border border-purple-400/35 rounded-xl p-3 text-[11px] text-purple-200 leading-relaxed flex items-start gap-2">
              <Package size={15} className="shrink-0 mt-0.5 text-purple-300" />
              <span>
                {isReceivable
                  ? 'Abono en especie o compensación: amortiza la deuda y queda registrado con fecha y nota en el historial, sin sumar saldo a ningún sobre ni cuenta.'
                  : 'Pago en especie o compensación: descuenta tu deuda y queda registrado con fecha y nota en el historial, sin restar saldo de ningún sobre ni cuenta.'}
              </span>
            </div>
          )}

          <div className={`grid gap-3 ${isMonetary ? 'grid-cols-2' : 'grid-cols-2'}`}>
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <label className="text-xs text-text-muted">
                  Monto ({effectiveInputInBs ? 'Bs' : '$'})
                </label>
                <div className="flex items-center gap-2">
                  {remainingCap !== null && remainingCap > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAmount(
                          effectiveInputInBs && hasValidRate
                            ? (remainingCap * effectiveRate).toFixed(2)
                            : String(remainingCap),
                        )
                      }
                      className="text-[10px] text-accent-gold underline bg-transparent border-none cursor-pointer"
                    >
                      Resta: {formatUsd(remainingCap)}
                    </button>
                  )}
                  {isMonetary && hasValidRate && (
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
              {isMonetary && hasValidRate && (
                <p className="text-[10px] text-cyan-300 mt-1">
                  {inputInBs
                    ? `≈ ${formatUsd(computedUsd)} USD (BCV)`
                    : isSelectedBs
                      ? `≈ ${formatBs(computedBs)} (BCV)`
                      : ''}
                </p>
              )}
            </div>

            {isMonetary ? (
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
            ) : (
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Fecha</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
            )}
          </div>

          <div className={`grid gap-3 ${isMonetary ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {isMonetary && (
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Fecha</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Nota del pago (opc.)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  isMonetary
                    ? 'Ej. Pago parcial, transferencia, efectivo...'
                    : 'Ej. Trueque reloj, artículo recibido, descuento...'
                }
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          {plan.nextDueDate && (
            <label className="flex items-center gap-2.5 bg-bg-input/50 border border-border rounded-xl px-3 py-2.5 cursor-pointer text-xs text-text-muted">
              <input
                type="checkbox"
                checked={advanceDue}
                onChange={(e) => setAdvanceDue(e.target.checked)}
                className="w-4 h-4 accent-accent-blue cursor-pointer shrink-0"
              />
              <span>
                Avanzar próxima fecha ({plan.nextDueDate} →{' '}
                <strong className="text-text-primary">
                  {advanceDueDate(plan.nextDueDate, plan.frequency)}
                </strong>
                )
              </span>
            </label>
          )}

          <button
            type="submit"
            className={`w-full py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
              !isMonetary
                ? 'bg-purple-500/20 border-purple-400/50 text-purple-200 hover:bg-purple-500/30'
                : isReceivable
                  ? 'bg-accent-green/20 border-accent-green/40 text-accent-green hover:bg-accent-green/30'
                  : 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30'
            }`}
          >
            {!isMonetary
              ? isReceivable
                ? 'Registrar Abono en Especie'
                : 'Registrar Compensación'
              : isReceivable
                ? 'Registrar Cobro'
                : 'Registrar Pago'}{' '}
            ({formatUsd(computedUsd)})
          </button>
        </form>
      </div>
    </div>
  );
}
