import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bitcoin,
  CheckCircle2,
  Clock,
  Coins,
  Landmark,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import { useInvestmentEngine } from '../../crypto-portfolio/hooks/useInvestmentEngine';
import { ENVELOPE_META, PAYMENT_METHOD_LABELS } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type {
  AssetBucketId,
  CustomAccount,
  CustomAccountId,
  FundId,
  InstallmentPlan,
  ReadyToAssignItem,
  RecurringExpense,
} from '../types';
import {
  calculateDaysLeft,
  calculateEmergencyGoalTarget,
  calculateFundSummaries,
  calculateReadyToAssignAndRunway,
  extractLiveCryptoBalances,
  formatBs,
  formatUsd,
  isNegativeAdjustmentMovement,
} from '../utils/calculations';
import { BackupControls } from './BackupControls';
import { CreateAccountModal } from './CreateAccountModal';
import { EmergencyGoalModal } from './EmergencyGoalModal';
import { MonthEndRolloverModal } from './MonthEndRolloverModal';
import { PayExpenseModal } from './PayExpenseModal';
import { RecordInstallmentModal } from './RecordInstallmentModal';
import {
  QuickMovementModal,
  type MovementDirection,
  type QuickModalTab,
} from './QuickMovementModal';

interface BudgetDashboardProps {
  onNavigateQuincena: () => void;
  onNavigateExpenses: () => void;
}

type BuiltinFundId = Exclude<FundId, CustomAccountId>;
type BuiltinBucketId = Exclude<AssetBucketId, CustomAccountId>;

const FUND_DEFAULT_BUCKET: Record<BuiltinFundId, AssetBucketId> = {
  efectivo_sobres: 'imprescindibles',
  cuenta_bolivares: 'banco_bolivares',
  inversiones_binance: 'binance_usdt',
  fondo_emergencia: 'emergencias',
  billetera_btc: 'wallet_btc',
};

const FUND_ICONS: Record<BuiltinFundId, React.ReactNode> = {
  efectivo_sobres: <Wallet size={18} className="text-accent-green" />,
  cuenta_bolivares: <Smartphone size={18} className="text-cyan-400" />,
  inversiones_binance: <Landmark size={18} className="text-accent-blue" />,
  fondo_emergencia: <ShieldCheck size={18} className="text-accent-gold" />,
  billetera_btc: <Bitcoin size={18} className="text-orange-400" />,
};

const BUCKET_LABELS: Record<BuiltinBucketId, string> = {
  ahorro_inversion: ENVELOPE_META.ahorro_inversion.name,
  imprescindibles: ENVELOPE_META.imprescindibles.name,
  disfrute: ENVELOPE_META.disfrute.name,
  crecimiento_personal: ENVELOPE_META.crecimiento_personal.name,
  provisiones_anuales: ENVELOPE_META.provisiones_anuales.name,
  banco_bolivares: 'Cuenta en Bolívares',
  emergencias: 'Fondo Emergencia (Efectivo)',
  binance_usdc: 'Fondo Emergencia (USDC)',
  binance_usdt: 'Binance USDT',
  binance_crypto: 'Binance Crypto',
  binance_paxg: 'Binance PAXG',
  wallet_btc: 'Billetera BTC',
};

export function BudgetDashboard({
  onNavigateQuincena,
  onNavigateExpenses,
}: BudgetDashboardProps) {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const {
    movements,
    expenses,
    installments,
    customAccounts,
    emergencyGoal,
    syncCryptoDca,
    setSyncCryptoDca,
    freeBsPoolMode,
    setFreeBsPoolMode,
    bcvRate,
    transferBetweenBuckets,
    removeMovement,
    removeCustomAccount,
  } = useBudgetStore();
  const { holdings, loading: dcaLoading, refreshPrices } = useInvestmentEngine();
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [emergencyGoalOpen, setEmergencyGoalOpen] = useState(false);
  const [monthEndOpen, setMonthEndOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CustomAccount | null>(null);
  const [quickBucket, setQuickBucket] = useState<AssetBucketId>('imprescindibles');
  const [quickTab, setQuickTab] = useState<QuickModalTab>('movement');
  const [quickDirection, setQuickDirection] = useState<MovementDirection>('out');
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [payingExpense, setPayingExpense] = useState<RecurringExpense | null>(null);
  const [payingInstallment, setPayingInstallment] = useState<InstallmentPlan | null>(null);

  const liveCrypto = useMemo(
    () =>
      syncCryptoDca && holdings.length > 0
        ? extractLiveCryptoBalances(holdings)
        : undefined,
    [syncCryptoDca, holdings],
  );

  const hasLiveCryptoMatch = Boolean(
    liveCrypto &&
      (liveCrypto.binanceCryptoUsd !== undefined ||
        liveCrypto.binancePaxgUsd !== undefined ||
        liveCrypto.walletBtcUsd !== undefined),
  );

  const { funds, totalNetWorth, envelopes } = useMemo(
    () =>
      calculateFundSummaries(movements, bcvRate, customAccounts, liveCrypto, {
        freeBsPoolMode,
      }),
    [movements, bcvRate, customAccounts, liveCrypto, freeBsPoolMode],
  );

  const emergencyGoalStats = useMemo(
    () => calculateEmergencyGoalTarget(emergencyGoal, expenses),
    [emergencyGoal, expenses],
  );
  const emergencyFundBalance =
    funds.find((f) => f.id === 'fondo_emergencia')?.balance ?? 0;

  const readyAndRunway = useMemo(
    () =>
      calculateReadyToAssignAndRunway({
        movements,
        expenses,
        installments,
        bcvRate,
        customAccounts,
        freeBsPoolMode,
      }),
    [movements, expenses, installments, bcvRate, customAccounts, freeBsPoolMode],
  );

  const handleQuickAssign = (
    item: ReadyToAssignItem,
    target: 'ahorro_inversion' | 'imprescindibles' | 'emergencia',
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    let amountToMove = item.amountUsd;
    let toBucket: AssetBucketId = target === 'emergencia' ? 'emergencias' : target;
    let toMethod = item.paymentMethod;

    if (target === 'emergencia') {
      const gap = Math.max(0, Number((emergencyGoalStats.targetUsd - emergencyFundBalance).toFixed(2)));
      amountToMove = gap > 0 ? Math.min(item.amountUsd, gap) : item.amountUsd;
      if (item.sourceBucket === 'binance_usdt') {
        toBucket = 'binance_usdc';
        toMethod = 'binance_usdt';
      } else {
        toBucket = 'emergencias';
        toMethod = 'efectivo_usd';
      }
    }

    if (amountToMove <= 0.01) return;

    const scaledBs =
      typeof item.amountBs === 'number' && item.amountUsd > 0
        ? Number(((amountToMove / item.amountUsd) * item.amountBs).toFixed(2))
        : undefined;

    transferBetweenBuckets({
      date: today,
      fromBucket: item.sourceBucket,
      toBucket,
      fromPaymentMethod: item.paymentMethod,
      toPaymentMethod: toMethod,
      amountFrom: Number(amountToMove.toFixed(2)),
      amountTo: Number(amountToMove.toFixed(2)),
      amountBsFrom: scaledBs,
      amountBsTo: scaledBs,
      bcvRateUsed: item.sourceBucket === 'banco_bolivares' && bcvRate ? bcvRate : undefined,
      notes: 'Asignación rápida (Por Asignar)',
    });
  };

  const bucketLabelMap = useMemo(() => {
    const map: Record<string, string> = { ...BUCKET_LABELS };
    for (const acct of customAccounts) {
      map[acct.id] = acct.name;
    }
    return map;
  }, [customAccounts]);

  const upcomingAlerts = useMemo(() => {
    const expenseItems = expenses
      .filter((e) => e.active)
      .map((e) => ({
        kind: 'expense' as const,
        id: e.id,
        name: e.name,
        amountUsd: e.amountUsd,
        nextDueDate: e.nextDueDate,
        subtitle: `Sobre: ${ENVELOPE_META[e.envelopeId].name} · Vence ${e.nextDueDate}`,
        daysLeft: calculateDaysLeft(e.nextDueDate),
        rawExpense: e,
      }));

    const payableInstallmentItems = installments
      .filter(
        (p) =>
          p.direction === 'payable' &&
          Boolean(p.nextDueDate) &&
          (p.maxCap === null || p.paidTotal < p.maxCap),
      )
      .map((p) => ({
        kind: 'installment' as const,
        id: p.id,
        name: p.name,
        amountUsd: p.installmentAmount,
        nextDueDate: p.nextDueDate!,
        subtitle: `Por pagar (${p.frequency}) · Vence ${p.nextDueDate}`,
        daysLeft: calculateDaysLeft(p.nextDueDate!),
        rawPlan: p,
      }));

    return [...expenseItems, ...payableInstallmentItems]
      .filter((item) => item.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [expenses, installments]);

  const openQuickModal = (
    bucket: AssetBucketId = 'imprescindibles',
    tab: QuickModalTab = 'movement',
    direction: MovementDirection = 'out',
  ) => {
    setQuickBucket(bucket);
    setQuickTab(tab);
    setQuickDirection(direction);
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
              Distribuido en {funds.length} fondos y cuentas activas
            </p>
            {holdings.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSyncCryptoDca(!syncCryptoDca)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors ${
                    syncCryptoDca && hasLiveCryptoMatch
                      ? 'bg-accent-green/15 border-accent-green/40 text-accent-green'
                      : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      syncCryptoDca && hasLiveCryptoMatch ? 'bg-accent-green' : 'bg-text-muted'
                    }`}
                  />
                  {syncCryptoDca ? 'DCA en vivo activo' : 'Solo Ledger manual'}
                </button>
                {syncCryptoDca && (
                  <button
                    type="button"
                    onClick={refreshPrices}
                    disabled={dcaLoading}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-bg-input border border-border text-text-muted hover:text-accent-blue hover:border-accent-blue disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw size={11} className={dcaLoading ? 'animate-spin' : ''} />
                    {dcaLoading ? 'Actualizando...' : 'CoinGecko'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openQuickModal('imprescindibles', 'movement', 'out')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-accent-gold/15 border border-accent-gold/40 text-accent-gold hover:bg-accent-gold/25 transition-all cursor-pointer"
            >
              <Zap size={15} /> Gasto Rápido
            </button>
            <button
              type="button"
              onClick={() => openQuickModal('banco_bolivares', 'movement', 'in')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 transition-all cursor-pointer"
            >
              <PlusCircle size={15} /> Ingreso / Saldo
            </button>
            <button
              type="button"
              onClick={() => openQuickModal('binance_usdt', 'transfer', 'out')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-accent-blue/15 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/25 transition-all cursor-pointer"
            >
              <ArrowLeftRight size={15} /> Cambiar
            </button>
            <button
              type="button"
              onClick={onNavigateQuincena}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 transition-all cursor-pointer"
            >
              <Plus size={15} /> Registrar Quincena
            </button>
          </div>
        </div>
      </div>

      {/* Ready to Assign (YNAB) + Liquidity Runway */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por Asignar */}
        <section className="bg-bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg border ${
                  readyAndRunway.totalReadyToAssignUsd > 0
                    ? 'bg-accent-gold/15 border-accent-gold/30 text-accent-gold'
                    : 'bg-accent-green/15 border-accent-green/30 text-accent-green'
                }`}
              >
                <Coins size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">Por Asignar a Sobres</h2>
                <p className="text-[11px] text-text-muted">
                  Liquidez libre en cuentas sin trabajo asignado
                </p>
              </div>
            </div>
            <div
              className={`text-lg sm:text-xl font-extrabold ${
                readyAndRunway.totalReadyToAssignUsd > 0
                  ? 'text-accent-gold'
                  : 'text-accent-green'
              }`}
            >
              <PrivacyValue
                value={formatUsd(readyAndRunway.totalReadyToAssignUsd)}
                isPrivate={isPrivate}
              />
            </div>
          </div>

          {readyAndRunway.totalReadyToAssignUsd > 0 ? (
            <div className="space-y-2.5">
              {readyAndRunway.items.map((item) => (
                <div
                  key={item.sourceBucket}
                  className="bg-bg-input/50 border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-text-primary">{item.label}</span>
                    <span className="font-bold text-accent-gold">
                      <PrivacyValue value={formatUsd(item.amountUsd)} isPrivate={isPrivate} />
                      {typeof item.amountBs === 'number' && item.amountBs > 0 && (
                        <span className="text-[10px] text-cyan-300 font-normal ml-1.5">
                          ({formatBs(item.amountBs)})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickAssign(item, 'ahorro_inversion')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent-blue/15 border border-accent-blue/35 text-accent-blue hover:bg-accent-blue/25 cursor-pointer"
                    >
                      → Ahorro / Inversión
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAssign(item, 'imprescindibles')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent-green/15 border border-accent-green/35 text-accent-green hover:bg-accent-green/25 cursor-pointer"
                    >
                      → Imprescindibles
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAssign(item, 'emergencia')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent-gold/15 border border-accent-gold/35 text-accent-gold hover:bg-accent-gold/25 cursor-pointer"
                    >
                      → Fondo Emergencia
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-accent-green bg-accent-green/10 border border-accent-green/30 rounded-lg px-3 py-2.5">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>
                Presupuesto Base Cero: cada dólar líquido en cuentas tiene un sobre o reserva asignada.
              </span>
            </div>
          )}
        </section>

        {/* Runway */}
        <section className="bg-bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                <Clock size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">
                  Runway (Días de Cobertura)
                </h2>
                <p className="text-[11px] text-text-muted">
                  Resistencia ante 0 ingresos usando solo liquidez disponible
                </p>
              </div>
            </div>
            {readyAndRunway.runwayDays !== null && (
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  readyAndRunway.runwayDays >= 90
                    ? 'bg-accent-green/15 border-accent-green/35 text-accent-green'
                    : readyAndRunway.runwayDays >= 30
                      ? 'bg-accent-gold/15 border-accent-gold/35 text-accent-gold'
                      : 'bg-accent-red/15 border-accent-red/35 text-accent-red'
                }`}
              >
                {readyAndRunway.runwayDays >= 90
                  ? 'Sólido'
                  : readyAndRunway.runwayDays >= 30
                    ? 'En construcción'
                    : 'Alerta'}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-text-primary">
              {readyAndRunway.runwayDays !== null ? `${readyAndRunway.runwayDays} días` : '∞ días'}
            </span>
            {readyAndRunway.runwayMonths !== null && (
              <span className="text-xs text-text-muted font-medium">
                (≈ {readyAndRunway.runwayMonths} meses)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs bg-bg-input/50 border border-border rounded-lg p-3">
            <div>
              <p className="text-[11px] text-text-muted">Liquidez operativa + reserva</p>
              <p className="font-bold text-text-primary mt-0.5">
                <PrivacyValue
                  value={formatUsd(readyAndRunway.liquidReserveUsd)}
                  isPrivate={isPrivate}
                />
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-muted">Ritmo esencial (Burn Rate)</p>
              <p className="font-bold text-text-primary mt-0.5">
                <PrivacyValue
                  value={`${formatUsd(readyAndRunway.monthlyBurnRateUsd)}/mes`}
                  isPrivate={isPrivate}
                />{' '}
                <span className="text-[10px] font-normal text-text-muted">
                  (<PrivacyValue value={`${formatUsd(readyAndRunway.dailyBurnRateUsd)}/d`} isPrivate={isPrivate} />)
                </span>
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Fondos y Cuentas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Resumen por Fondos y Cuentas
          </h2>
          <button
            type="button"
            onClick={() => {
              setEditingAccount(null);
              setCreateAccountOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/15 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/25 cursor-pointer"
          >
            <Plus size={14} /> Crear Cuenta
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {funds.map((fund) => {
            const targetBucket: AssetBucketId = fund.isCustom
              ? (fund.id as CustomAccountId)
              : FUND_DEFAULT_BUCKET[fund.id as BuiltinFundId];
            const iconNode = fund.isCustom ? (
              fund.currency === 'VES' ? (
                <Smartphone size={18} className="text-cyan-400" />
              ) : (
                <Landmark size={18} className="text-accent-green" />
              )
            ) : (
              FUND_ICONS[fund.id as BuiltinFundId]
            );
            const isBsDisplay = fund.id === 'cuenta_bolivares' || fund.currency === 'VES';

            return (
              <div
                key={fund.id}
                className="bg-bg-card border border-border rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-bg-input border border-border shrink-0">
                      {iconNode}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-text-primary leading-tight truncate">
                        {fund.name}
                      </h3>
                      <p className="text-[11px] text-text-muted truncate">{fund.assetType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-semibold text-text-muted">
                      {fund.percentage.toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => openQuickModal(targetBucket, 'movement', 'set_balance')}
                      title={`Ajustar saldo en ${fund.name}`}
                      className="p-1 rounded-md bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
                    >
                      <SlidersHorizontal size={12} />
                    </button>
                    {fund.id === 'fondo_emergencia' && (
                      <button
                        type="button"
                        onClick={() => setEmergencyGoalOpen(true)}
                        title="Configurar meta del Fondo de Emergencia"
                        className="p-1 rounded-md bg-bg-input border border-border text-accent-gold hover:border-accent-gold/50 cursor-pointer"
                      >
                        <Target size={12} />
                      </button>
                    )}
                    {fund.isCustom && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const found = customAccounts.find((a) => a.id === fund.id);
                            if (found) {
                              setEditingAccount(found);
                              setCreateAccountOpen(true);
                            }
                          }}
                          title={`Editar cuenta ${fund.name}`}
                          className="p-1 rounded-md bg-bg-input border border-border text-text-muted hover:text-accent-gold hover:border-accent-gold/40 cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustomAccount(fund.id as CustomAccountId)}
                          title={`Eliminar cuenta ${fund.name}`}
                          className="p-1 rounded-md bg-bg-input border border-border text-text-muted hover:text-accent-red hover:border-accent-red/40 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  {isBsDisplay ? (
                    <div>
                      <div className="text-xl font-bold text-cyan-300">
                        <PrivacyValue value={formatBs(fund.balanceBs ?? 0)} isPrivate={isPrivate} />
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        ≈ <PrivacyValue value={formatUsd(fund.balance)} isPrivate={isPrivate} /> USD
                        {bcvRate ? ' (BCV)' : ''}
                      </p>
                      {fund.id === 'cuenta_bolivares' && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={freeBsPoolMode}
                          onClick={() => setFreeBsPoolMode(!freeBsPoolMode)}
                          title={
                            freeBsPoolMode
                              ? 'Activo: gastos en Bs usan tu Saldo Libre para no dejar sobres en negativo'
                              : 'Estricto: cada sobre solo usa sus propios Bs (puede quedar en negativo)'
                          }
                          className={`mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-semibold border cursor-pointer transition-colors ${
                            freeBsPoolMode
                              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25'
                              : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                              freeBsPoolMode ? 'bg-cyan-400' : 'bg-white/20'
                            }`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-bg-primary shadow transition-transform ${
                                freeBsPoolMode ? 'translate-x-3.5' : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                          <span>
                            Bs:{' '}
                            <span className={freeBsPoolMode ? 'text-cyan-300 font-bold' : 'text-text-muted/60'}>
                              Saldo Libre
                            </span>
                            <span className="text-text-muted/40 mx-1">/</span>
                            <span className={!freeBsPoolMode ? 'text-text-primary font-bold' : 'text-text-muted/60'}>
                              Estricto
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-xl font-bold text-text-primary">
                      <PrivacyValue value={formatUsd(fund.balance)} isPrivate={isPrivate} />
                    </div>
                  )}

                  {fund.id === 'fondo_emergencia' && emergencyGoalStats.targetUsd > 0 ? (
                    (() => {
                      const goalTarget = emergencyGoalStats.targetUsd;
                      const goalPct = Math.min(100, Math.max(0, (fund.balance / goalTarget) * 100));
                      const remaining = Math.max(0, goalTarget - fund.balance);
                      return (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <button
                              type="button"
                              onClick={() => setEmergencyGoalOpen(true)}
                              className="text-accent-gold hover:underline bg-transparent border-none p-0 cursor-pointer font-medium"
                            >
                              Meta (
                              {emergencyGoal.mode === 'months_of_essentials'
                                ? `${emergencyGoal.months}m indisp.`
                                : 'Custom'}
                              ): <PrivacyValue value={formatUsd(goalTarget)} isPrivate={isPrivate} />
                            </button>
                            <span className="font-semibold text-text-muted">
                              {goalPct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                goalPct >= 100 ? 'bg-accent-green' : 'bg-accent-gold'
                              }`}
                              style={{ width: `${goalPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-text-muted">
                            {remaining > 0 ? (
                              <>
                                Faltan{' '}
                                <PrivacyValue value={formatUsd(remaining)} isPrivate={isPrivate} />
                              </>
                            ) : (
                              <span className="text-accent-green font-semibold">
                                ¡Meta alcanzada!
                              </span>
                            )}
                          </p>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full bg-accent-blue transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, fund.percentage))}%` }}
                      />
                    </div>
                  )}

                  {fund.breakdown && fund.breakdown.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border text-[10px] text-text-muted">
                      {fund.breakdown.map((b) => (
                        <span key={b.label} className="px-1.5 py-0.5 rounded bg-bg-input">
                          {b.label}:{' '}
                          <strong className="text-text-primary">
                            <PrivacyValue value={formatUsd(b.amount)} isPrivate={isPrivate} />
                          </strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 Sobres Operativos */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Saldo Disponible por Sobre (Partidas)
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={freeBsPoolMode}
              onClick={() => setFreeBsPoolMode(!freeBsPoolMode)}
              title="Al gastar en Bs más de lo que tiene el sobre, descuenta el excedente del saldo libre en Bolívares para no dejar el sobre en negativo"
              className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors ${
                freeBsPoolMode
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25'
                  : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
              }`}
            >
              <span
                aria-hidden="true"
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  freeBsPoolMode ? 'bg-cyan-400' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-bg-primary shadow transition-transform ${
                    freeBsPoolMode ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span>
                Bs:{' '}
                <span className={freeBsPoolMode ? 'text-cyan-300 font-bold' : 'text-text-muted/60'}>
                  Saldo Libre
                </span>
                <span className="text-text-muted/40 mx-1">/</span>
                <span className={!freeBsPoolMode ? 'text-text-primary font-bold' : 'text-text-muted/60'}>
                  Estricto
                </span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMonthEndOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-gold/15 border border-accent-gold/40 text-accent-gold hover:bg-accent-gold/25 cursor-pointer"
          >
            <Sparkles size={13} /> Cierre de Mes / Reestructurar
          </button>
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
                    onClick={() => openQuickModal(env.id, 'movement')}
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

                  {/* Custody breakdown per envelope */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border text-[10px] text-text-muted">
                    <span className="px-1.5 py-0.5 rounded bg-bg-input">
                      Efec:{' '}
                      <strong className="text-text-primary">
                        <PrivacyValue
                          value={formatUsd(env.byMethod.efectivo)}
                          isPrivate={isPrivate}
                        />
                      </strong>
                    </span>
                    {Math.abs(env.byMethod.binance) >= 0.01 && (
                      <span className="px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue">
                        USDT:{' '}
                        <strong>
                          <PrivacyValue
                            value={formatUsd(env.byMethod.binance)}
                            isPrivate={isPrivate}
                          />
                        </strong>
                      </span>
                    )}
                    {Math.abs(env.byMethod.bolivares) >= 0.01 && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                        Bs:{' '}
                        <strong>
                          <PrivacyValue
                            value={formatUsd(env.byMethod.bolivares)}
                            isPrivate={isPrivate}
                          />
                        </strong>
                      </span>
                    )}
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
                    <p className="text-xs text-text-muted mt-0.5">{item.subtitle}</p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-sm font-bold text-text-primary">
                      <PrivacyValue value={formatUsd(item.amountUsd)} isPrivate={isPrivate} />
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.kind === 'expense') {
                          setPayingExpense(item.rawExpense);
                        } else {
                          setPayingInstallment(item.rawPlan);
                        }
                      }}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{movements.length} registros</span>
            {movements.length > 15 && (
              <button
                type="button"
                onClick={() => setShowAllMovements((v) => !v)}
                className="text-xs text-accent-blue hover:underline bg-transparent border-none cursor-pointer"
              >
                {showAllMovements ? 'Ver recientes' : 'Ver todos'}
              </button>
            )}
          </div>
        </div>

        {movements.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center">
            Aún no hay movimientos. Registra tu primera quincena o un gasto rápido.
          </p>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto pr-1">
            {(showAllMovements ? movements : movements.slice(0, 15)).map((m) => {
              const isOutflow =
                m.type === 'Gasto en Efectivo' ||
                m.type === 'Cambio a Bolívares' ||
                m.type === 'Pago de Cuota' ||
                m.type === 'Transferencia (Salida)' ||
                isNegativeAdjustmentMovement(m);

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
                        {m.date} · {bucketLabelMap[m.bucket] ?? m.bucket}
                        {m.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[m.paymentMethod]}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span
                        className={`font-bold block ${
                          isOutflow ? 'text-accent-red' : 'text-accent-green'
                        }`}
                      >
                        {isOutflow ? '-' : '+'}
                        <PrivacyValue
                          value={formatUsd(Math.abs(m.amountUsd))}
                          isPrivate={isPrivate}
                        />
                      </span>
                      {typeof m.amountBs === 'number' && Math.abs(m.amountBs) > 0 && (
                        <span className="text-[10px] text-cyan-300 block">
                          {isOutflow ? '-' : '+'}
                          <PrivacyValue
                            value={formatBs(Math.abs(m.amountBs))}
                            isPrivate={isPrivate}
                          />
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMovement(m.id)}
                      title="Eliminar movimiento (revierte alerta si aplica)"
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
          key={`${quickBucket}-${quickTab}-${quickDirection}`}
          isOpen={quickModalOpen}
          initialBucket={quickBucket}
          initialTab={quickTab}
          initialDirection={quickDirection}
          onClose={() => setQuickModalOpen(false)}
        />
      )}

      {payingExpense && (
        <PayExpenseModal
          key={payingExpense.id}
          expense={payingExpense}
          onClose={() => setPayingExpense(null)}
        />
      )}

      {payingInstallment && (
        <RecordInstallmentModal
          key={payingInstallment.id}
          plan={payingInstallment}
          onClose={() => setPayingInstallment(null)}
        />
      )}

      {createAccountOpen && (
        <CreateAccountModal
          key={editingAccount?.id ?? 'new'}
          editingAccount={editingAccount}
          onClose={() => {
            setCreateAccountOpen(false);
            setEditingAccount(null);
          }}
        />
      )}

      {emergencyGoalOpen && (
        <EmergencyGoalModal
          currentBalance={emergencyFundBalance}
          onClose={() => setEmergencyGoalOpen(false)}
        />
      )}

      {monthEndOpen && (
        <MonthEndRolloverModal
          envelopes={envelopes}
          emergencyBalance={emergencyFundBalance}
          emergencyTarget={emergencyGoalStats.targetUsd}
          onClose={() => setMonthEndOpen(false)}
        />
      )}
    </div>
  );
}
