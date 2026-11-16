import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { ENVELOPE_META, PAYMENT_METHOD_LABELS } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type { AssetBucketId, EnvelopeId, MovementType, PaymentMethod } from '../types';

interface QuickMovementModalProps {
  isOpen: boolean;
  initialBucket?: AssetBucketId;
  onClose: () => void;
}

const BUCKET_OPTIONS: { id: AssetBucketId; label: string }[] = [
  { id: 'imprescindibles', label: ENVELOPE_META.imprescindibles.name },
  { id: 'disfrute', label: ENVELOPE_META.disfrute.name },
  { id: 'crecimiento_personal', label: ENVELOPE_META.crecimiento_personal.name },
  { id: 'ahorro_inversion', label: ENVELOPE_META.ahorro_inversion.name },
  { id: 'emergencias', label: 'Fondo Emergencia (Efectivo)' },
  { id: 'binance_usdc', label: 'Fondo Emergencia (Binance USDC)' },
  { id: 'binance_usdt', label: 'Inversiones Binance (USDT)' },
  { id: 'binance_crypto', label: 'Inversiones Binance (Crypto)' },
  { id: 'binance_paxg', label: 'Inversiones Binance (PAXG)' },
  { id: 'wallet_btc', label: 'Billetera BTC' },
];

const MOVEMENT_TYPES: MovementType[] = [
  'Gasto en Efectivo',
  'Cambio a Bolívares',
  'Ingreso a Sobre',
  'Barrido a Inversión',
  'Pago de Cuota',
];

export function QuickMovementModal({
  isOpen,
  initialBucket = 'imprescindibles',
  onClose,
}: QuickMovementModalProps) {
  const { addMovement } = useBudgetStore();
  const [bucket, setBucket] = useState<AssetBucketId>(initialBucket);
  const [type, setType] = useState<MovementType>('Gasto en Efectivo');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo_usd');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    addMovement({
      date,
      bucket,
      type,
      amountUsd: Number(numericAmount.toFixed(2)),
      paymentMethod,
      notes: notes.trim() || undefined,
    });
    setAmount('');
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
            <Zap size={18} className="text-accent-gold" /> Movimiento Rápido
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary bg-bg-input border-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Monto (USD)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-semibold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                autoFocus
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 rounded-xl text-xl font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[5, 10, 20, 50, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>

          {/* Type chips */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Tipo de movimiento</label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                    type === t
                      ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                      : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Envelope / Bucket */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Sobre o Fondo</label>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as EnvelopeId | AssetBucketId)}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
            >
              {BUCKET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Method + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Método</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((k) => (
                  <option key={k} value={k}>
                    {PAYMENT_METHOD_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Nota (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Mercado, almuerzo, Pago Móvil..."
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-sm font-bold bg-accent-green/20 border border-accent-green/40 text-accent-green hover:bg-accent-green/30 transition-all cursor-pointer"
          >
            Guardar Movimiento
          </button>
        </form>
      </div>
    </div>
  );
}
