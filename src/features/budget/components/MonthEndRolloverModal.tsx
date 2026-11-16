import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import {
  computeDisfruteMaxCap,
  computeImprescindiblesSuggestedReserve,
  getDefaultNextPaydayDate,
  simulateMonthEndRollover,
} from '../services/monthEndEngine';
import { useBudgetStore } from '../store/budgetStore';
import type { EnvelopeSummary } from '../types';
import { formatUsd } from '../utils/calculations';

interface MonthEndRolloverModalProps {
  envelopes: EnvelopeSummary[];
  emergencyBalance: number;
  emergencyTarget: number;
  onClose: () => void;
}

const RULE_LABELS: Record<string, string> = {
  SWEEP_ALL: 'Barrido 100%',
  PHASED_CAP: 'Faseado (50% / Techo)',
  ACCUMULATE: 'Acumulable 100%',
  INVESTMENT_POOL: 'Receptor Inversión',
  TARGET_VAULT: 'Bóveda Meta',
};

export function MonthEndRolloverModal({
  envelopes,
  emergencyBalance,
  emergencyTarget,
  onClose,
}: MonthEndRolloverModalProps) {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const { quincenaConfig, expenses, installments, applyMonthEndRollover } = useBudgetStore();

  const impCurrentBalance = useMemo(
    () => Math.max(0, envelopes.find((e) => e.id === 'imprescindibles')?.available ?? 0),
    [envelopes],
  );

  const [nextPaydayDate, setNextPaydayDate] = useState(() => getDefaultNextPaydayDate());

  const reserveSuggestion = useMemo(
    () =>
      computeImprescindiblesSuggestedReserve({
        expenses,
        installments,
        nextPaydayDate,
      }),
    [expenses, installments, nextPaydayDate],
  );

  const [impReserveInput, setImpReserveInput] = useState(() =>
    String(Math.min(impCurrentBalance, reserveSuggestion.upcomingBeforePayday)),
  );

  const defaultDisCap = useMemo(
    () => computeDisfruteMaxCap(quincenaConfig, 500),
    [quincenaConfig],
  );
  const [disCapInput, setDisCapInput] = useState(String(defaultDisCap));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const parsedCap = Math.max(0, parseFloat(disCapInput) || 500);
  const parsedImpReserve = Math.max(0, parseFloat(impReserveInput) || 0);

  const simulation = useMemo(
    () =>
      simulateMonthEndRollover({
        envelopes,
        emergencyBalance,
        emergencyTarget,
        disfruteMaxCap: parsedCap,
        imprescindiblesReserve: parsedImpReserve,
        date,
      }),
    [envelopes, emergencyBalance, emergencyTarget, parsedCap, parsedImpReserve, date],
  );

  const handleConfirm = () => {
    if (simulation.totalSwept <= 0) return;
    applyMonthEndRollover(simulation, envelopes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
              <Sparkles size={19} className="text-accent-gold" /> Simulación de Cierre Mensual
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Vista previa de barridos (SWEEP) y arrastres (ROLLOVER) antes de confirmar.
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

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Emergency Phase + Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-bg-input/60 border border-border rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-accent-gold" /> Fondo de Emergencia
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    simulation.initialPhase === 1
                      ? 'bg-accent-gold/20 text-accent-gold'
                      : 'bg-accent-green/20 text-accent-green'
                  }`}
                >
                  {simulation.initialPhase === 1 ? 'Fase 1: Incompleto' : 'Fase 2: Meta 100%'}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                <PrivacyValue value={formatUsd(simulation.emergencyBefore)} isPrivate={isPrivate} />{' '}
                →{' '}
                <strong className="text-text-primary">
                  <PrivacyValue value={formatUsd(simulation.emergencyAfter)} isPrivate={isPrivate} />
                </strong>{' '}
                {simulation.emergencyTarget > 0 && (
                  <>
                    / <PrivacyValue value={formatUsd(simulation.emergencyTarget)} isPrivate={isPrivate} />
                  </>
                )}
              </p>
            </div>

            <div className="bg-bg-input/60 border border-border rounded-xl p-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-text-muted block mb-1">
                  Techo Disfrute (Fase 2)
                </label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={disCapInput}
                  onChange={(e) => setDisCapInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-bg-input border border-border text-text-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-muted block mb-1">Fecha cierre</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                />
              </div>
            </div>
          </div>

          {/* Reserva sugerida en Imprescindibles */}
          <div className="bg-accent-blue/5 border border-accent-blue/30 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                  <CalendarClock size={14} className="text-accent-blue" />
                  Proteger gastos próximos en Imprescindibles
                </h4>
                <p className="text-[11px] text-text-muted">
                  Evita barrer dinero que necesitas antes de tu próxima quincena.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-text-muted">Próx. quincena:</span>
                <input
                  type="date"
                  value={nextPaydayDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setNextPaydayDate(nextDate);
                    const nextSug = computeImprescindiblesSuggestedReserve({
                      expenses,
                      installments,
                      nextPaydayDate: nextDate,
                    });
                    setImpReserveInput(
                      String(Math.min(impCurrentBalance, nextSug.upcomingBeforePayday)),
                    );
                  }}
                  className="px-2 py-1 rounded-lg text-[11px] bg-bg-input border border-border text-text-primary"
                />
              </div>
            </div>

            {reserveSuggestion.items.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {reserveSuggestion.items.map((item) => (
                  <span
                    key={item.id}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-bg-input border border-border text-text-muted"
                  >
                    {item.name}:{' '}
                    <strong className="text-text-primary">
                      <PrivacyValue value={formatUsd(item.amountUsd)} isPrivate={isPrivate} />
                    </strong>{' '}
                    ({item.daysLeft <= 0 ? 'hoy/venc.' : `en ${item.daysLeft}d`})
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted shrink-0">Dejar en sobre ($):</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max={impCurrentBalance}
                  value={impReserveInput}
                  onChange={(e) => setImpReserveInput(e.target.value)}
                  className="w-24 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-bg-input border border-border text-text-primary"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setImpReserveInput(
                      String(Math.min(impCurrentBalance, reserveSuggestion.upcomingBeforePayday)),
                    )
                  }
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-accent-blue/15 border border-accent-blue/30 text-accent-blue cursor-pointer"
                >
                  Previo quincena ({formatUsd(reserveSuggestion.upcomingBeforePayday)})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setImpReserveInput(
                      String(Math.min(impCurrentBalance, reserveSuggestion.monthlyEssentialsTotal)),
                    )
                  }
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Mes ({formatUsd(reserveSuggestion.monthlyEssentialsTotal)})
                </button>
                <button
                  type="button"
                  onClick={() => setImpReserveInput('0')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-accent-gold cursor-pointer"
                >
                  Barrer todo ($0)
                </button>
              </div>
            </div>
          </div>

          {/* Outcomes per Envelope/Vault */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Nuevo Estado por Sobre / Bóveda
            </h4>
            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {simulation.outcomes.map((o) => (
                <div
                  key={o.id}
                  className="p-3 bg-bg-input/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-primary">{o.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-bg-input text-text-muted">
                        {RULE_LABELS[o.rolloverRule]}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {o.sweptOutAmount > 0 && (
                        <span className="text-accent-gold mr-2">
                          Barrido: -<PrivacyValue value={formatUsd(o.sweptOutAmount)} isPrivate={isPrivate} />
                        </span>
                      )}
                      {o.receivedSweepAmount > 0 && (
                        <span className="text-accent-green mr-2">
                          Recibe: +<PrivacyValue value={formatUsd(o.receivedSweepAmount)} isPrivate={isPrivate} />
                        </span>
                      )}
                      {o.sweptOutAmount === 0 && o.receivedSweepAmount === 0 && (
                        <span>Se mantiene acumulado</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-text-muted">
                      <PrivacyValue value={formatUsd(o.previousBalance)} isPrivate={isPrivate} />
                    </span>
                    <ArrowRight size={13} className="text-text-muted" />
                    <span className="text-sm text-text-primary">
                      <PrivacyValue value={formatUsd(o.newBalance)} isPrivate={isPrivate} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Movements */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Movimientos de Auditoría ({simulation.movements.length})
            </h4>
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {simulation.movements.map((mov) => (
                <div
                  key={mov.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg-input/50 border border-border text-xs"
                >
                  <div className="min-w-0">
                    <span
                      className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 ${
                        mov.type === 'SWEEP'
                          ? 'bg-accent-gold/20 text-accent-gold'
                          : 'bg-accent-blue/20 text-accent-blue'
                      }`}
                    >
                      {mov.type}
                    </span>
                    <span className="text-text-primary">{mov.reason}</span>
                  </div>
                  <span className="font-bold text-text-primary shrink-0">
                    <PrivacyValue value={formatUsd(mov.amountUsd)} isPrivate={isPrivate} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-text-muted flex items-center gap-2">
            <RefreshCw size={14} className="text-accent-blue" />
            <span>
              Total a reestructurar:{' '}
              <strong className="text-accent-green">
                <PrivacyValue value={formatUsd(simulation.totalSwept)} isPrivate={isPrivate} />
              </strong>
            </span>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-semibold bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={simulation.totalSwept <= 0}
              onClick={handleConfirm}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-accent-green/20 border border-accent-green/40 text-accent-green hover:bg-accent-green/30 disabled:opacity-40 cursor-pointer"
            >
              <CheckCircle2 size={15} />
              {simulation.totalSwept > 0
                ? 'Confirmar Cierre de Mes'
                : 'Sin saldos para barrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
