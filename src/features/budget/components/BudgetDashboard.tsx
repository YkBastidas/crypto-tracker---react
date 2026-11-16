import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bitcoin,
  CheckCircle2,
  Landmark,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type { AssetBucketId, FundId } from '../types';
import {
  calculateDaysLeft,
  calculateFundSummaries,
  formatUsd,
} from '../utils/calculations';
import { BackupControls } from './BackupControls';
import { QuickMovementModal, type QuickModalTab } from './QuickMovementModal';

interface BudgetDashboardProps {
  onNavigateQuincena: () => void;
  onNavigateExpenses: () => void;
}

const FUND_ICONS: Record<FundId, React.ReactNode> = {
  efectivo_sobres: <Wallet size={18} className="text-accent-green" />,
  inversiones_binance: <Landmark size={18} className="text-accent-blue" />,
  fondo_emergencia: <ShieldCheck size={18} className="text-accent-gold" />,
  billetera_btc: <Bitcoin size={18} className="text-orange-400" />,
};

export function BudgetDashboard({
  onNavigateQuincena,
  onNavigateExpenses,
}: BudgetDashboardProps) {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const { movements, expenses, removeMovement, markExpensePaid } = useBudgetStore();
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickBucket, setQuickBucket] = useState<AssetBucketId>('imprescindibles');
  const [quickTab, setQuickTab] = useState<QuickModalTab>('movement');

  const { funds, totalNetWorth, envelopes } = useMemo(
    () => calculateFundSummaries(movements),
    [movements],
  );

  const upcomingAlerts = useMemo(() => {
    return expenses
      .filter((e) => e.active)
      .map((e) => ({ ...e, daysLeft: calculateDaysLeft(e.nextDueDate) }))
      .filter((e) => e.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [expenses]);

  const openQuickModal = (
    bucket: AssetBucketId = 'imprescindibles',
    tab: QuickModalTab = 'movement',
  ) => {
    setQuickBucket(bucket);
    setQuickTab(tab);
    setQuickModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Hero: Patrimonio Total + Quick Actions */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-medium">
              Patrimonio Total Consolidado
            </p>
            <div className="text-3xl sm:text-4xl font-extrabold text-text-primary mt-1">
              <PrivacyValue value={formatUsd(totalNetWorth)} isPrivate={isPrivate} />
            </div>
            <p className="text-xs text-text-muted mt-1">
              Distribuido en 4 fondos operativos y de reserva
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => openQuickModal('imprescindibles', 'movement')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-accent-gold/15 border border-accent-gold/40 text-accent-gold hover:bg-accent-gold/25 transition-all cursor-pointer"
            >
              <Zap size={15} /> Gasto Rápido
            </button>
            <button
              type="button"
              onClick={() => openQuickModal('binance_usdt', 'transfer')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-accent-blue/15 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/25 transition-all cursor-pointer"
            >
              <ArrowLeftRight size={15} /> Cambiar / Transferir
            </button>
            <button
              type="button"
              onClick={onNavigateQuincena}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 transition-all cursor-pointer"
            >
              <Plus size={15} /> Registrar Quincena
            </button>
          </div>
        </div>
      </div>

      {/* 4 Fondos */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-3">
          Resumen por Fondos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {funds.map((fund) => (
            <div
              key={fund.id}
              className="bg-bg-card border border-border rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-bg-input border border-border">
                    {FUND_ICONS[fund.id]}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary leading-tight">
                      {fund.name}
                    </h3>
                    <p className="text-[11px] text-text-muted">{fund.assetType}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-text-muted">
                  {fund.percentage.toFixed(1)}%
                </span>
              </div>

              <div>
                <div className="text-xl font-bold text-text-primary">
                  <PrivacyValue value={formatUsd(fund.balance)} isPrivate={isPrivate} />
                </div>
                <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full bg-accent-blue transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, fund.percentage))}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 Sobres Operativos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Saldo Disponible por Sobre
          </h2>
          <span className="text-xs text-text-muted">Presupuesto quincenal</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {envelopes.map((env) => {
            const meta = ENVELOPE_META[env.id];
            const ratio =
              env.assigned > 0 ? Math.max(0, Math.min(100, (env.available / env.assigned) * 100)) : 0;

            return (
              <div
                key={env.id}
                className="bg-bg-card border border-border rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${meta.badgeBg}`}
                    >
                      {meta.name}
                    </span>
                    <p className="text-[11px] text-text-muted mt-1.5">{meta.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openQuickModal(env.id)}
                    title={`Registrar movimiento en ${meta.name}`}
                    className="p-1.5 rounded-lg bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`text-xl font-bold ${
                        env.available < 0 ? 'text-accent-red' : 'text-text-primary'
                      }`}
                    >
                      <PrivacyValue value={formatUsd(env.available)} isPrivate={isPrivate} />
                    </span>
                    <span className="text-[11px] text-text-muted">
                      de <PrivacyValue value={formatUsd(env.assigned)} isPrivate={isPrivate} />
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        env.available < 0 ? 'bg-accent-red' : 'bg-accent-green'
                      }`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-text-muted mt-1.5">
                    <span>
                      Egresos: <PrivacyValue value={formatUsd(env.spent)} isPrivate={isPrivate} />
                    </span>
                    <span>{ratio.toFixed(0)}% disp.</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Alertas de Gastos Próximos a Vencer */}
      <section className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold flex items-center gap-2 text-text-primary">
            <AlertTriangle size={16} className="text-accent-gold" />
            Alertas de Gastos Próximos (≤ 7 días)
          </h2>
          <button
            type="button"
            onClick={onNavigateExpenses}
            className="text-xs text-accent-blue hover:underline bg-transparent border-none cursor-pointer"
          >
            Ver todos
          </button>
        </div>

        {upcomingAlerts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-accent-green py-2">
            <CheckCircle2 size={16} /> No tienes gastos por vencer en los próximos 7 días.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {upcomingAlerts.map((item) => {
              const isOverdue = item.daysLeft < 0;
              const isToday = item.daysLeft === 0;
              return (
                <div
                  key={item.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{item.name}</span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isOverdue
                            ? 'bg-accent-red/15 text-accent-red'
                            : isToday
                              ? 'bg-accent-gold/20 text-accent-gold'
                              : 'bg-accent-blue/15 text-accent-blue'
                        }`}
                      >
                        {isOverdue
                          ? `Vencido (${Math.abs(item.daysLeft)}d)`
                          : isToday
                            ? 'Vence hoy'
                            : `En ${item.daysLeft}d`}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      Sobre: {ENVELOPE_META[item.envelopeId].name} · Vence {item.nextDueDate}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-sm font-bold text-text-primary">
                      <PrivacyValue value={formatUsd(item.amountUsd)} isPrivate={isPrivate} />
                    </span>
                    <button
                      type="button"
                      onClick={() => markExpensePaid(item.id, true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 cursor-pointer"
                    >
                      Pagar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Movimientos Recientes */}
      <section className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-text-primary">Últimos Movimientos del Ledger</h2>
          <span className="text-xs text-text-muted">{movements.length} registros</span>
        </div>

        {movements.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center">
            Aún no hay movimientos. Registra tu primera quincena o un gasto rápido.
          </p>
        ) : (
          <div className="divide-y divide-border max-h-80 overflow-y-auto pr-1">
            {movements.slice(0, 15).map((m) => {
              const isOutflow =
                m.type === 'Gasto en Efectivo' ||
                m.type === 'Cambio a Bolívares' ||
                m.type === 'Pago de Cuota' ||
                m.type === 'Transferencia (Salida)';

              return (
                <div
                  key={m.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isOutflow
                          ? 'bg-accent-red/15 text-accent-red'
                          : 'bg-accent-green/15 text-accent-green'
                      }`}
                    >
                      {isOutflow ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary truncate">
                        {m.notes || m.type}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {m.date} · {m.type} ·{' '}
                        {ENVELOPE_META[m.bucket as keyof typeof ENVELOPE_META]?.name ?? m.bucket}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`font-bold ${
                        isOutflow ? 'text-accent-red' : 'text-accent-green'
                      }`}
                    >
                      {isOutflow ? '-' : '+'}
                      <PrivacyValue value={formatUsd(m.amountUsd)} isPrivate={isPrivate} />
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMovement(m.id)}
                      title="Eliminar movimiento"
                      className="p-1 text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <BackupControls />

      {quickModalOpen && (
        <QuickMovementModal
          key={`${quickBucket}-${quickTab}`}
          isOpen={quickModalOpen}
          initialBucket={quickBucket}
          initialTab={quickTab}
          onClose={() => setQuickModalOpen(false)}
        />
      )}
    </div>
  );
}
