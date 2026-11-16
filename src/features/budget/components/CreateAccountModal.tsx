import { useState } from 'react';
import { Banknote, Landmark, Smartphone, X } from 'lucide-react';
import { useBudgetStore } from '../store/budgetStore';
import type { AccountCurrency, CustomAccount } from '../types';
import { formatUsd } from '../utils/calculations';

interface CreateAccountModalProps {
  editingAccount?: CustomAccount | null;
  onClose: () => void;
}

export function CreateAccountModal({ editingAccount = null, onClose }: CreateAccountModalProps) {
  const { addCustomAccount, updateCustomAccount, bcvRate } = useBudgetStore();
  const isEditing = Boolean(editingAccount);

  const [name, setName] = useState(editingAccount?.name ?? '');
  const [currency, setCurrency] = useState<AccountCurrency>(editingAccount?.currency ?? 'USD');
  const [subtitle, setSubtitle] = useState(editingAccount?.subtitle ?? '');
  const [initialBalance, setInitialBalance] = useState('');

  const hasValidRate = Boolean(bcvRate && bcvRate > 0);
  const parsedInit = parseFloat(initialBalance) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingAccount) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Landmark size={18} className="text-accent-blue" />{' '}
              {isEditing ? 'Editar Cuenta' : 'Nueva Cuenta / Fondo'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {isEditing
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
              <label className="text-xs text-text-muted block mb-1.5">Tipo / Nota (opc.)</label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder={currency === 'VES' ? 'Pago Móvil' : 'Cuenta nacional USD'}
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-sm font-bold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 transition-all cursor-pointer"
          >
            {isEditing ? 'Guardar Cambios' : 'Crear Cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}
