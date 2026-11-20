import { useState } from 'react';
import { Banknote, Eye, EyeOff, Landmark, RotateCcw, Smartphone, X } from 'lucide-react';
import { useBudgetStore } from '../store/budgetStore';
import type { AccountCurrency, BuiltinFundId, CustomAccount } from '../types';
import { formatUsd } from '../utils/calculations';

export interface EditingNativeFundInfo {
  id: BuiltinFundId;
  name: string;
  assetType: string;
  notes: string;
  defaultName: string;
  defaultAssetType: string;
  hidden: boolean;
  balance: number;
}

interface CreateAccountModalProps {
  editingAccount?: CustomAccount | null;
  editingNativeFund?: EditingNativeFundInfo | null;
  onClose: () => void;
}

export function CreateAccountModal({
  editingAccount = null,
  editingNativeFund = null,
  onClose,
}: CreateAccountModalProps) {
  const {
    addCustomAccount,
    updateCustomAccount,
    updateNativeAccount,
    resetNativeAccount,
    bcvRate,
  } = useBudgetStore();
  const isEditingCustom = Boolean(editingAccount);
  const isEditingNative = Boolean(editingNativeFund);
  const isEditing = isEditingCustom || isEditingNative;

  const [name, setName] = useState(
    editingAccount?.name ?? editingNativeFund?.name ?? '',
  );
  const [currency, setCurrency] = useState<AccountCurrency>(editingAccount?.currency ?? 'USD');
  const [subtitle, setSubtitle] = useState(
    editingAccount?.subtitle ?? editingNativeFund?.assetType ?? '',
  );
  const [hidden, setHidden] = useState<boolean>(editingNativeFund?.hidden ?? false);
  const [initialBalance, setInitialBalance] = useState('');

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const parsedInit = parseFloat(initialBalance) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingNativeFund) {
      const cleanName = name.trim();
      const cleanAssetType = subtitle.trim();
      updateNativeAccount(editingNativeFund.id, {
        name: cleanName === editingNativeFund.defaultName ? '' : cleanName,
        assetType:
          cleanAssetType === editingNativeFund.defaultAssetType ? '' : cleanAssetType,
        hidden,
      });
    } else if (editingAccount) {
      updateCustomAccount(editingAccount.id, {
        name: name.trim(),
        currency,
        subtitle: subtitle.trim() || undefined,
      });
    } else {
      addCustomAccount({
        name: name.trim(),
        currency,
        subtitle: subtitle.trim() || undefined,
        initialBalance: parsedInit > 0 ? parsedInit : 0,
      });
    }
    onClose();
  };

  const handleResetNative = () => {
    if (!editingNativeFund) return;
    resetNativeAccount(editingNativeFund.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Landmark size={18} className="text-accent-blue" />{' '}
              {isEditingNative
                ? 'Configurar Cuenta Base'
                : isEditingCustom
                  ? 'Editar Cuenta'
                  : 'Nueva Cuenta / Fondo'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {isEditingNative
                ? 'Personaliza el nombre o oculta esta cuenta si no la usas en tu país.'
                : isEditingCustom
                  ? 'Actualiza el nombre, tipo o moneda de tu cuenta.'
                  : 'Crea cuentas bancarias en USD, Bs u otras billeteras.'}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Nombre de la cuenta</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Banco USD, Cuenta Verde, Zelle, Mercantil..."
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
            />
          </div>

          {!isEditingNative && (
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Moneda principal</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                    currency === 'USD'
                      ? 'bg-accent-green/15 border-accent-green/50 text-accent-green'
                      : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Banknote size={15} /> Dólares (USD)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('VES')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                    currency === 'VES'
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                      : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Smartphone size={15} /> Bolívares (VES)
                </button>
              </div>
            </div>
          )}

          <div className={isEditing ? '' : 'grid grid-cols-2 gap-3'}>
            {!isEditing && (
              <div>
                <label className="text-xs text-text-muted block mb-1.5">
                  Saldo inicial ({currency === 'VES' ? 'Bs' : '$'})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
                {currency === 'VES' && parsedInit > 0 && hasValidRate && (
                  <p className="text-[10px] text-cyan-300 mt-1">
                    ≈ {formatUsd(parsedInit / (bcvRate as number))} USD (BCV)
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-text-muted block mb-1.5">
                {isEditingNative ? 'Subtítulo / Red / Tipo' : 'Tipo / Nota (opc.)'}
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder={currency === 'VES' ? 'Pago Móvil' : 'Cuenta nacional USD'}
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          {isEditingNative && editingNativeFund && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg-input/60 border border-border">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    {hidden ? <EyeOff size={14} className="text-text-muted" /> : <Eye size={14} className="text-accent-green" />}
                    Ocultar de la vista principal
                  </p>
                  <p className="text-[11px] text-text-muted leading-snug mt-0.5">
                    Útil si no usas efectivo físico o bolívares. No borra tu historial.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hidden}
                  onClick={() => setHidden((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-none cursor-pointer transition-colors ${
                    hidden ? 'bg-accent-gold' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-bg-primary shadow transition-transform ${
                      hidden ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {hidden && Math.abs(editingNativeFund.balance) >= 0.01 && (
                <p className="text-[11px] text-accent-gold bg-accent-gold/10 border border-accent-gold/30 rounded-lg px-3 py-2">
                  Esta cuenta tiene saldo actual de <strong>{formatUsd(editingNativeFund.balance)}</strong>. Seguirá sumando en tu Patrimonio Total y podrás mostrarla cuando quieras.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {isEditingNative && (
              <button
                type="button"
                onClick={handleResetNative}
                title="Restaurar nombre y visibilidad predeterminados"
                className="px-3 py-3 rounded-xl text-xs font-semibold bg-bg-input border border-border text-text-muted hover:text-text-primary flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} /> Restaurar
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 transition-all cursor-pointer"
            >
              {isEditing ? 'Guardar Cambios' : 'Crear Cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
