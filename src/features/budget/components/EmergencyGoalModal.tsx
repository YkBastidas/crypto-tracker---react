import { useMemo, useState } from 'react';
import { ShieldCheck, Target, X } from 'lucide-react';
import { useBudgetStore } from '../store/budgetStore';
import type { EmergencyGoalMode } from '../types';
import { calculateMonthlyEssentials, formatUsd } from '../utils/calculations';

interface EmergencyGoalModalProps {
  currentBalance: number;
  onClose: () => void;
}

export function EmergencyGoalModal({ currentBalance, onClose }: EmergencyGoalModalProps) {
  const { emergencyGoal, expenses, updateEmergencyGoal } = useBudgetStore();
  const [mode, setMode] = useState<EmergencyGoalMode>(emergencyGoal.mode);
  const [months, setMonths] = useState(String(emergencyGoal.months));
  const [customAmount, setCustomAmount] = useState(String(emergencyGoal.customAmount));

  const monthlyEssentials = useMemo(() => calculateMonthlyEssentials(expenses), [expenses]);

  const parsedMonths = Math.max(0.5, parseFloat(months) || 0);
  const parsedCustom = Math.max(0, parseFloat(customAmount) || 0);
  const previewTarget =
    mode === 'months_of_essentials'
      ? Number((monthlyEssentials * parsedMonths).toFixed(2))
      : Number(parsedCustom.toFixed(2));
  const previewPct = previewTarget > 0 ? Math.min(100, (currentBalance / previewTarget) * 100) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateEmergencyGoal({
      mode,
      months: parsedMonths,
      customAmount: parsedCustom,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Target size={18} className="text-accent-gold" /> Meta Fondo de Emergencia
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Define tu meta automática por meses indispensables o monto fijo.
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
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-input border border-border">
            <button
              type="button"
              onClick={() => setMode('months_of_essentials')}
              className={`py-2 px-2 rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                mode === 'months_of_essentials'
                  ? 'bg-accent-gold/20 text-accent-gold'
                  : 'bg-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              X Meses Indispensables
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`py-2 px-2 rounded-lg text-xs font-semibold border-none cursor-pointer transition-all ${
                mode === 'custom'
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Monto Custom ($)
            </button>
          </div>

          {mode === 'months_of_essentials' ? (
            <div className="space-y-3">
              <div className="bg-bg-input/60 border border-border rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-muted">Gastos indispensables / mes:</span>
                  <span className="font-bold text-text-primary">
                    {formatUsd(monthlyEssentials)}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted">
                  Calculado automáticamente con tus gastos activos del sobre{' '}
                  <strong>Imprescindibles</strong> (mensuales, quincenales y anuales prorrateados).
                </p>
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1.5">
                  ¿Cuántos meses de cobertura quieres?
                </label>
                <div className="flex gap-2 mb-2">
                  {[1, 3, 6, 9, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMonths(String(m))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        Number(months) === m
                          ? 'bg-accent-gold/20 border-accent-gold/50 text-accent-gold'
                          : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  inputMode="decimal"
                  required
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-base font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-gold"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-text-muted block">Monto objetivo (USD)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-bold">
                  $
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  inputMode="decimal"
                  required
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl text-lg font-bold bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>
              <div className="flex gap-2 pt-1">
                {[500, 1000, 2000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCustomAmount(String(preset))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live Goal Preview */}
          <div className="bg-bg-input/50 border border-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-accent-gold" /> Objetivo resultante:
              </span>
              <span className="text-sm font-extrabold text-accent-gold">
                {formatUsd(previewTarget)}
              </span>
            </div>
            <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden border border-border">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  previewPct >= 100 ? 'bg-accent-green' : 'bg-accent-gold'
                }`}
                style={{ width: `${previewPct}%` }}
              />
            </div>
            <p className="text-[11px] text-text-muted flex justify-between">
              <span>Actual: {formatUsd(currentBalance)}</span>
              <span>{previewPct.toFixed(1)}% completado</span>
            </p>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-sm font-bold bg-accent-gold/20 border border-accent-gold/40 text-accent-gold hover:bg-accent-gold/30 transition-all cursor-pointer"
          >
            Guardar Meta de Emergencia
          </button>
        </form>
      </div>
    </div>
  );
}
