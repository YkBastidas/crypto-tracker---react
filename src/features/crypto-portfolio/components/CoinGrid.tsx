import { useMemo, useState, type DragEvent } from 'react';
import {
  ArrowUpDown,
  Bot,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Download,
  PieChart,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { calculateEligibleInvestmentCapital } from '../../budget/utils/calculations';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { CoinCard } from './CoinCard';
import type { CoinHolding, SmartTradeRecommendation } from '../types';
import {
  DEFAULT_TACTICAL_DIP_CONFIG,
  buildAiPortfolioReportMarkdown,
  computePortfolioExposure,
  computeSmartTradeRecommendation,
  formatTokens,
  formatUsd,
  recommendTacticalTiersFromIncome,
} from '../utils/calculations';

const EXPOSURE_GROUP_COLORS: Record<string, string> = {
  'GROUP:BTC': 'bg-amber-400',
  'GROUP:ETH': 'bg-sky-400',
  'GROUP:SOL': 'bg-violet-400',
  'GROUP:GOLD': 'bg-yellow-300',
  'GROUP:ALTS': 'bg-rose-400',
  USDT_LIQUID: 'bg-emerald-400',
};

const EXPOSURE_FALLBACK_PALETTE = [
  'bg-amber-400',
  'bg-sky-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-cyan-400',
  'bg-orange-400',
  'bg-fuchsia-400',
  'bg-lime-400',
];

function getExposureSegmentColor(id: string, idx: number): string {
  return (
    EXPOSURE_GROUP_COLORS[id.toUpperCase()] ??
    EXPOSURE_FALLBACK_PALETTE[idx % EXPOSURE_FALLBACK_PALETTE.length]
  );
}

export type PortfolioSortMode =
  | 'manual'
  | 'value_desc'
  | 'pnl_desc'
  | 'pnl_pct_desc'
  | 'signal'
  | 'name_asc';

interface CoinGridProps {
  holdings: CoinHolding[];
  onTargetChange?: () => void;
}

const SIGNAL_RANK: Record<CoinHolding['tradeSignal'], number> = {
  BUY: 0,
  SELL: 1,
  WATCH: 2,
};

function sortHoldingsList(
  list: CoinHolding[],
  mode: PortfolioSortMode,
  customOrder: string[],
): CoinHolding[] {
  const copy = [...list];
  if (mode === 'manual') {
    const orderMap = new Map(customOrder.map((t, idx) => [t.toUpperCase(), idx]));
    return copy.sort((a, b) => {
      const idxA = orderMap.get(a.ticker.toUpperCase());
      const idxB = orderMap.get(b.ticker.toUpperCase());
      if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
      if (idxA !== undefined) return -1;
      if (idxB !== undefined) return 1;
      return 0;
    });
  }
  if (mode === 'value_desc') {
    return copy.sort((a, b) => b.currentValue - a.currentValue);
  }
  if (mode === 'pnl_desc') {
    return copy.sort((a, b) => b.pnl - a.pnl);
  }
  if (mode === 'pnl_pct_desc') {
    return copy.sort((a, b) => b.pnlPercent - a.pnlPercent);
  }
  if (mode === 'signal') {
    return copy.sort((a, b) => {
      const diff = SIGNAL_RANK[a.tradeSignal] - SIGNAL_RANK[b.tradeSignal];
      return diff !== 0 ? diff : b.currentValue - a.currentValue;
    });
  }
  return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function CoinGrid({ holdings, onTargetChange }: CoinGridProps) {
  const [showAllCryptos, setShowAllCryptos] = useState(false);
  const [showTacticalPanel, setShowTacticalPanel] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [exposureMode, setExposureMode] = useState<'group' | 'coin'>('group');
  const [includeUsdtInExposure, setIncludeUsdtInExposure] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [sortMode, setSortMode] = useState<PortfolioSortMode>('manual');
  const [draggedTicker, setDraggedTicker] = useState<string | null>(null);
  const [confirmDeleteTicker, setConfirmDeleteTicker] = useState<string | null>(null);

  const movements = useBudgetStore((s) => s.movements);
  const {
    isPrivate,
    customCoinOrder,
    archivedCoins,
    tacticalDipConfig,
    targetAllocations,
    setCustomCoinOrder,
    archiveCoin,
    unarchiveCoin,
    removeCoinTransactions,
    setTacticalDipConfig,
    setTargetAllocation,
    resetTargetAllocations,
  } = usePortfolioStore();

  const pv = (val: string) => (isPrivate ? '****' : val);

  const {
    totalEligibleUsd,
    ahorroEnvelopeUsd,
    unassignedUsdtUsd,
    excludedPhysicalCashUsd,
  } = useMemo(() => calculateEligibleInvestmentCapital(movements), [movements]);

  const freeTacticalUsdtUsd = Math.max(
    0,
    Number((totalEligibleUsd - tacticalDipConfig.biweeklyDcaReserveUsd).toFixed(2)),
  );

  const totalVolatileCryptoUsd = useMemo(
    () =>
      holdings
        .filter((h) => !h.isStablecoin)
        .reduce((acc, h) => acc + h.currentValue, 0),
    [holdings],
  );

  const archivedSet = useMemo(
    () => new Set(archivedCoins.map((t) => t.toUpperCase())),
    [archivedCoins],
  );

  const cryptoHoldings = useMemo(
    () =>
      sortHoldingsList(
        holdings.filter((h) => !h.isStablecoin && !archivedSet.has(h.ticker.toUpperCase())),
        sortMode,
        customCoinOrder,
      ),
    [holdings, archivedSet, sortMode, customCoinOrder],
  );

  const stableHoldings = useMemo(
    () =>
      sortHoldingsList(
        holdings.filter((h) => h.isStablecoin && !archivedSet.has(h.ticker.toUpperCase())),
        sortMode,
        customCoinOrder,
      ),
    [holdings, archivedSet, sortMode, customCoinOrder],
  );

  const archivedHoldings = useMemo(
    () =>
      holdings
        .filter((h) => archivedSet.has(h.ticker.toUpperCase()))
        .sort((a, b) => b.pnl - a.pnl),
    [holdings, archivedSet],
  );

  const groupExposure = useMemo(
    () =>
      computePortfolioExposure({
        holdings: cryptoHoldings,
        mode: 'group',
        includeDigitalUsdt: includeUsdtInExposure,
        digitalUsdtUsd: totalEligibleUsd,
        targetAllocations,
      }),
    [cryptoHoldings, includeUsdtInExposure, totalEligibleUsd, targetAllocations],
  );

  const coinExposure = useMemo(
    () =>
      computePortfolioExposure({
        holdings: cryptoHoldings,
        mode: 'coin',
        includeDigitalUsdt: includeUsdtInExposure,
        digitalUsdtUsd: totalEligibleUsd,
        targetAllocations,
      }),
    [cryptoHoldings, includeUsdtInExposure, totalEligibleUsd, targetAllocations],
  );

  const activeExposure = exposureMode === 'group' ? groupExposure : coinExposure;

  const targetSumPct = useMemo(
    () =>
      Number(
        activeExposure.items
          .reduce((acc, item) => acc + (item.targetPct ?? 0), 0)
          .toFixed(1),
      ),
    [activeExposure.items],
  );

  const aiReportMarkdown = useMemo(() => {
    if (!showAiPanel) return '';
    const recommendations: Record<string, SmartTradeRecommendation> = {};
    for (const h of cryptoHoldings) {
      recommendations[h.ticker.toUpperCase()] = computeSmartTradeRecommendation({
        holding: h,
        eligibleCapitalUsd: totalEligibleUsd,
        totalVolatileCryptoUsd,
        allVolatileHoldings: cryptoHoldings,
        tacticalConfig: tacticalDipConfig,
        targetAllocations,
      });
    }
    return buildAiPortfolioReportMarkdown({
      holdings: cryptoHoldings,
      archivedHoldings,
      eligibleCapital: {
        ahorroEnvelopeUsd,
        unassignedUsdtUsd,
        totalEligibleUsd,
        excludedPhysicalCashUsd,
      },
      tacticalConfig: tacticalDipConfig,
      recommendations,
      groupExposure,
      coinExposure,
    });
  }, [
    showAiPanel,
    cryptoHoldings,
    archivedHoldings,
    ahorroEnvelopeUsd,
    unassignedUsdtUsd,
    totalEligibleUsd,
    excludedPhysicalCashUsd,
    tacticalDipConfig,
    targetAllocations,
    totalVolatileCryptoUsd,
    groupExposure,
    coinExposure,
  ]);

  const handleCopyAiReport = async () => {
    if (!aiReportMarkdown) return;
    try {
      await navigator.clipboard.writeText(aiReportMarkdown);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2500);
    } catch {
      setAiCopied(false);
    }
  };

  const handleDownloadAiReport = () => {
    if (!aiReportMarkdown) return;
    const blob = new Blob([aiReportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resumen-portafolio-ia-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reorderSection = (
    sectionList: CoinHolding[],
    otherSectionList: CoinHolding[],
    fromTicker: string,
    toTicker: string,
    sectionFirst: boolean,
  ) => {
    const tickers = sectionList.map((h) => h.ticker.toUpperCase());
    const fromIdx = tickers.indexOf(fromTicker.toUpperCase());
    const toIdx = tickers.indexOf(toTicker.toUpperCase());
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const reordered = [...tickers];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const otherTickers = otherSectionList.map((h) => h.ticker.toUpperCase());
    setCustomCoinOrder(
      sectionFirst ? [...reordered, ...otherTickers] : [...otherTickers, ...reordered],
    );
  };

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p className="text-lg">No crypto holdings yet.</p>
        <p className="text-sm mt-1">Upload a CSV or add your first transaction.</p>
      </div>
    );
  }

  const MAX_INITIAL_CRYPTOS = 8;
  const visibleCryptos = showAllCryptos
    ? cryptoHoldings
    : cryptoHoldings.slice(0, MAX_INITIAL_CRYPTOS);
  const hasMoreCryptos = cryptoHoldings.length > MAX_INITIAL_CRYPTOS;

  const totalClosedProfit = archivedHoldings.reduce((acc, h) => acc + h.pnl, 0);

  return (
    <div className="space-y-8">
      {/* Portfolio Exposure & Rebalancing Bar */}
      {cryptoHoldings.length > 0 && (
        <section className="bg-bg-card border border-border rounded-xl p-4 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <PieChart size={16} className="text-accent-blue shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Exposición y Balanceo del Portafolio
              </h3>
              <span className="text-[11px] text-text-muted">
                · Base: <strong className="text-text-primary">{pv(formatUsd(activeExposure.totalBaseUsd))}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-border bg-bg-input p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setExposureMode('group')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                    exposureMode === 'group'
                      ? 'bg-accent-blue/20 text-accent-blue'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Por Grupo
                </button>
                <button
                  type="button"
                  onClick={() => setExposureMode('coin')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                    exposureMode === 'coin'
                      ? 'bg-accent-blue/20 text-accent-blue'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Por Moneda
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIncludeUsdtInExposure((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                  includeUsdtInExposure
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {includeUsdtInExposure ? '+ USDT Libre (Incluido)' : 'Solo Crypto'}
              </button>

              <button
                type="button"
                onClick={() => setShowTargetEditor((prev) => !prev)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                  showTargetEditor
                    ? 'bg-accent-gold/15 border-accent-gold/50 text-accent-gold'
                    : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                }`}
              >
                <Target size={12} />
                <span>Metas (%)</span>
              </button>
            </div>
          </div>

          {/* Target sum bar when editing */}
          {showTargetEditor && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg-input/60 border border-border text-[11px]">
              <span className="text-text-muted">
                Suma de metas asignadas:{' '}
                <strong
                  className={
                    Math.abs(targetSumPct - 100) <= 0.5
                      ? 'text-accent-green'
                      : 'text-accent-gold'
                  }
                >
                  {targetSumPct}%
                </strong>
                {Math.abs(targetSumPct - 100) > 0.5 && (
                  <span className="ml-1 text-text-muted">(ideal: 100%)</span>
                )}
              </span>
              <button
                type="button"
                onClick={resetTargetAllocations}
                className="px-2 py-1 rounded bg-bg-card border border-border text-text-muted hover:text-text-primary cursor-pointer"
              >
                Restaurar metas grupo
              </button>
            </div>
          )}

          {/* Stacked segmented horizontal bar */}
          <div className="h-3.5 w-full rounded-full overflow-hidden bg-bg-input border border-border flex">
            {activeExposure.items
              .filter((item) => item.currentPct > 0)
              .map((item, idx) => (
                <div
                  key={item.id}
                  style={{ width: `${Math.max(item.currentPct, 0.6)}%` }}
                  className={`${getExposureSegmentColor(item.id, idx)} h-full border-r border-bg-primary/60 last:border-r-0 transition-all duration-300`}
                  title={`${item.label}: ${item.currentPct.toFixed(1)}% (${pv(formatUsd(item.valueUsd))})`}
                />
              ))}
          </div>

          {/* Breakdown & Rebalance cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {activeExposure.items.map((item, idx) => {
              const colorClass = getExposureSegmentColor(item.id, idx);
              return (
                <div
                  key={item.id}
                  className="bg-bg-input/50 border border-border rounded-lg p-2.5 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} />
                      <span className="font-semibold text-text-primary truncate">{item.label}</span>
                    </div>
                    <strong className="text-text-primary shrink-0">{item.currentPct.toFixed(1)}%</strong>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[11px] text-text-muted">
                    <span>{pv(formatUsd(item.valueUsd))}</span>
                    {item.targetPct !== null ? (
                      <span>Meta: {item.targetPct}%</span>
                    ) : (
                      <span>Sin meta</span>
                    )}
                  </div>

                  {exposureMode === 'group' && item.tickers.length > 0 && !item.isLiquidity && (
                    <p className="text-[10px] text-text-muted/80 truncate">
                      {item.tickers.join(' · ')}
                    </p>
                  )}

                  {item.targetPct !== null && item.rebalanceDeltaUsd !== null && (
                    <p
                      className={`text-[10px] font-medium ${
                        item.rebalanceStatus === 'UNDERWEIGHT'
                          ? 'text-accent-green'
                          : item.rebalanceStatus === 'OVERWEIGHT'
                            ? 'text-accent-gold'
                            : 'text-text-muted'
                      }`}
                    >
                      {item.rebalanceStatus === 'UNDERWEIGHT'
                        ? `Faltan +${pv(formatUsd(Math.max(0, item.rebalanceDeltaUsd)))} (Comprar)`
                        : item.rebalanceStatus === 'OVERWEIGHT'
                          ? `Exceso -${pv(formatUsd(Math.max(0, -item.rebalanceDeltaUsd)))} (Reducir)`
                          : 'Balanceado (±2%)'}
                    </p>
                  )}

                  {showTargetEditor && (
                    <div className="pt-1 flex items-center gap-1.5">
                      <label className="text-[10px] text-text-muted shrink-0">Meta %:</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={item.targetPct ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setTargetAllocation(item.id, null);
                          } else {
                            setTargetAllocation(item.id, Math.max(0, parseFloat(raw) || 0));
                          }
                        }}
                        className="w-full px-2 py-1 rounded text-[11px] bg-bg-card border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Sort & Filter Controls + Volatile Crypto Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={17} className="text-accent-green" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Activos Crypto ({cryptoHoldings.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiPanel((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                showAiPanel
                  ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue'
                  : 'bg-bg-card border-border text-text-muted hover:text-text-primary hover:border-accent-blue'
              }`}
            >
              <Bot size={13} />
              <span>🤖 Resumen para IA</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTacticalPanel((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                showTacticalPanel
                  ? 'bg-accent-gold/15 border-accent-gold/50 text-accent-gold'
                  : 'bg-bg-card border-border text-text-muted hover:text-text-primary hover:border-accent-blue'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>⚡ Motor Táctico</span>
            </button>

            <div className="flex items-center gap-2">
              <ArrowUpDown size={14} className="text-text-muted shrink-0" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as PortfolioSortMode)}
                className="px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-primary focus:outline-none focus:border-accent-blue cursor-pointer"
              >
                <option value="manual">Orden: Manual (Mover / Arrastrar)</option>
                <option value="value_desc">Mayor Valor ($)</option>
                <option value="pnl_desc">Mayor Profit ($)</option>
                <option value="pnl_pct_desc">Mayor Profit (%)</option>
                <option value="signal">Oportunidad (BUY / SELL)</option>
                <option value="name_asc">Nombre (A–Z)</option>
              </select>
            </div>
          </div>
        </div>

        {showAiPanel && (
          <div className="bg-bg-card border border-accent-blue/40 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                  <Bot size={14} className="text-accent-blue" /> Resumen Estructurado para IA
                </h4>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Incluye exposición actual vs. metas, posiciones, señales/Cooldown y liquidez USDT disponible para pedir recomendaciones.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyAiReport()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 cursor-pointer"
                >
                  {aiCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{aiCopied ? '¡Copiado!' : 'Copiar Prompt para IA'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAiReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-primary hover:border-accent-blue cursor-pointer"
                >
                  <Download size={13} />
                  <span>Descargar .md</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiPanel(false)}
                  aria-label="Cerrar panel de resumen IA"
                  className="p-1.5 rounded-lg bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <textarea
              readOnly
              value={aiReportMarkdown}
              rows={11}
              className="w-full p-3 rounded-lg text-[11px] font-mono bg-bg-input border border-border text-text-primary focus:outline-none resize-y"
            />
          </div>
        )}

        {showTacticalPanel && (
          <div className="bg-bg-card border border-border rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  Parámetros del Motor Táctico de Caídas
                </h4>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Usa solo USDT digital en Binance ({pv(formatUsd(ahorroEnvelopeUsd))} sobre Ahorro +{' '}
                  {pv(formatUsd(unassignedUsdtUsd))} USDT libre).
                  {excludedPhysicalCashUsd > 0 && (
                    <> Excluido efectivo físico: {pv(formatUsd(excludedPhysicalCashUsd))}.</>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTacticalDipConfig(DEFAULT_TACTICAL_DIP_CONFIG)}
                className="px-2.5 py-1 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
              >
                Restaurar ($900/mes)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-text-muted block">USDT Digital Libre</span>
                <strong className="text-accent-blue text-sm">{pv(formatUsd(totalEligibleUsd))}</strong>
              </div>
              <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-text-muted block">Reserva DCA Quincenal</span>
                <strong className="text-text-primary text-sm">
                  -{pv(formatUsd(tacticalDipConfig.biweeklyDcaReserveUsd))}
                </strong>
              </div>
              <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-text-muted block">Liquidez Táctica Neta</span>
                <strong className="text-text-primary text-sm">{pv(formatUsd(freeTacticalUsdtUsd))}</strong>
              </div>
              <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-text-muted block">
                  Cupo Máximo Diario ({tacticalDipConfig.tier3MaxFreeUsdtPct}%)
                </span>
                <strong className="text-accent-gold text-sm">
                  {pv(
                    formatUsd(
                      Number(
                        (
                          freeTacticalUsdtUsd *
                          (tacticalDipConfig.tier3MaxFreeUsdtPct / 100)
                        ).toFixed(2),
                      ),
                    ),
                  )}
                </strong>
              </div>
            </div>

            <p className="text-[10px] text-text-muted leading-snug">
              <strong className="text-text-primary">Crypto:</strong> N1 10–14.9% · N2 15–21.9% · N3 ≥22%
              <span className="mx-1.5 opacity-40">|</span>
              <strong className="text-accent-gold">Oro (PAXG/XAUT):</strong> N1 5–7.9% · N2 8–11.9% · N3 ≥12%
              <span className="mx-1.5 opacity-40">|</span>
              Cooldown 48h · Máx. 60%/activo si cupo ≥ $40
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 flex items-end gap-2">
                <label className="flex-1 block">
                  <span className="text-[10px] text-text-muted block mb-1">Ingreso Mensual ($)</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={tacticalDipConfig.monthlyIncomeUsd}
                    onChange={(e) =>
                      setTacticalDipConfig({
                        monthlyIncomeUsd: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const recommended = recommendTacticalTiersFromIncome(
                      tacticalDipConfig.monthlyIncomeUsd,
                    );
                    setTacticalDipConfig({
                      monthlyIncomeUsd: recommended.monthlyIncomeUsd,
                      tier1Usd: recommended.tier1Usd,
                      tier2Usd: recommended.tier2Usd,
                      tier3Usd: recommended.tier3Usd,
                      biweeklyDcaReserveUsd: recommended.biweeklyDcaReserveUsd,
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 cursor-pointer shrink-0"
                >
                  Recalcular tramos
                </button>
              </div>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Bloque Nivel 1 ($)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={tacticalDipConfig.tier1Usd}
                  onChange={(e) =>
                    setTacticalDipConfig({ tier1Usd: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Bloque Nivel 2 ($)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={tacticalDipConfig.tier2Usd}
                  onChange={(e) =>
                    setTacticalDipConfig({ tier2Usd: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Bloque Nivel 3 ($)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={tacticalDipConfig.tier3Usd}
                  onChange={(e) =>
                    setTacticalDipConfig({ tier3Usd: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Cupo Diario (% Neto)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={5}
                  value={tacticalDipConfig.tier3MaxFreeUsdtPct}
                  onChange={(e) =>
                    setTacticalDipConfig({
                      tier3MaxFreeUsdtPct: Math.min(
                        100,
                        Math.max(1, parseFloat(e.target.value) || 40),
                      ),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Reserva DCA ($)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={tacticalDipConfig.biweeklyDcaReserveUsd}
                  onChange={(e) =>
                    setTacticalDipConfig({
                      biweeklyDcaReserveUsd: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Cooldown Crypto %</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={tacticalDipConfig.cooldownAdditionalDropPct}
                  onChange={(e) =>
                    setTacticalDipConfig({
                      cooldownAdditionalDropPct: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-text-muted block mb-1">Escape N3 Crypto (%)</span>
                <input
                  type="number"
                  min={5}
                  max={50}
                  step={1}
                  value={tacticalDipConfig.tier3EscapeDropPct ?? 15}
                  onChange={(e) =>
                    setTacticalDipConfig({
                      tier3EscapeDropPct: Math.max(5, parseFloat(e.target.value) || 15),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-accent-gold block mb-1">Cooldown Oro (PAXG) %</span>
                <input
                  type="number"
                  min={0.5}
                  max={30}
                  step={0.5}
                  value={tacticalDipConfig.goldCooldownAdditionalDropPct ?? 3.5}
                  onChange={(e) =>
                    setTacticalDipConfig({
                      goldCooldownAdditionalDropPct: Math.max(0.5, parseFloat(e.target.value) || 3.5),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-gold"
                />
              </label>

              <label className="block">
                <span className="text-[10px] text-accent-gold block mb-1">Escape N3 Oro (%)</span>
                <input
                  type="number"
                  min={3}
                  max={50}
                  step={0.5}
                  value={tacticalDipConfig.goldTier3EscapeDropPct ?? 8}
                  onChange={(e) =>
                    setTacticalDipConfig({
                      goldTier3EscapeDropPct: Math.max(3, parseFloat(e.target.value) || 8),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-gold"
                />
              </label>
            </div>
          </div>
        )}

        {cryptoHoldings.length === 0 ? (
          <p className="text-xs text-text-muted bg-bg-card border border-border rounded-xl p-4">
            No hay activos crypto activos en seguimiento.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleCryptos.map((holding, idx) => (
                <CoinCard
                  key={holding.ticker}
                  holding={holding}
                  eligibleCapitalUsd={totalEligibleUsd}
                  totalVolatileCryptoUsd={totalVolatileCryptoUsd}
                  allVolatileHoldings={cryptoHoldings}
                  tacticalConfig={tacticalDipConfig}
                  targetAllocations={targetAllocations}
                  onTargetChange={onTargetChange}
                  onArchive={(t) => archiveCoin(t)}
                  draggable={sortMode === 'manual'}
                  onDragStart={() => setDraggedTicker(holding.ticker)}
                  onDragOver={(e: DragEvent<HTMLDivElement>) => {
                    if (sortMode === 'manual') e.preventDefault();
                  }}
                  onDrop={() => {
                    if (sortMode === 'manual' && draggedTicker) {
                      reorderSection(
                        cryptoHoldings,
                        stableHoldings,
                        draggedTicker,
                        holding.ticker,
                        true,
                      );
                    }
                    setDraggedTicker(null);
                  }}
                  canMoveLeft={sortMode === 'manual' && idx > 0}
                  canMoveRight={sortMode === 'manual' && idx < cryptoHoldings.length - 1}
                  onMoveLeft={
                    sortMode === 'manual' && idx > 0
                      ? () =>
                          reorderSection(
                            cryptoHoldings,
                            stableHoldings,
                            holding.ticker,
                            cryptoHoldings[idx - 1].ticker,
                            true,
                          )
                      : undefined
                  }
                  onMoveRight={
                    sortMode === 'manual' && idx < cryptoHoldings.length - 1
                      ? () =>
                          reorderSection(
                            cryptoHoldings,
                            stableHoldings,
                            holding.ticker,
                            cryptoHoldings[idx + 1].ticker,
                            true,
                          )
                      : undefined
                  }
                />
              ))}
            </div>

            {hasMoreCryptos && !showAllCryptos && (
              <button
                onClick={() => setShowAllCryptos(true)}
                className="
                  mt-4 mx-auto flex items-center gap-2 px-6 py-2
                  bg-bg-card border border-border rounded-lg
                  text-text-muted hover:text-text-primary hover:border-accent-blue
                  transition-all text-sm cursor-pointer
                "
              >
                Mostrar todos ({cryptoHoldings.length} activos) <ChevronDown size={16} />
              </button>
            )}
          </>
        )}
      </section>

      {/* Stablecoins Section (Separated Below) */}
      {stableHoldings.length > 0 && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <Coins size={17} className="text-accent-blue" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Stablecoins y Liquidez ({stableHoldings.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stableHoldings.map((holding, idx) => (
              <CoinCard
                key={holding.ticker}
                holding={holding}
                eligibleCapitalUsd={totalEligibleUsd}
                totalVolatileCryptoUsd={totalVolatileCryptoUsd}
                onTargetChange={onTargetChange}
                onArchive={(t) => archiveCoin(t)}
                draggable={sortMode === 'manual'}
                onDragStart={() => setDraggedTicker(holding.ticker)}
                onDragOver={(e: DragEvent<HTMLDivElement>) => {
                  if (sortMode === 'manual') e.preventDefault();
                }}
                onDrop={() => {
                  if (sortMode === 'manual' && draggedTicker) {
                    reorderSection(
                      stableHoldings,
                      cryptoHoldings,
                      draggedTicker,
                      holding.ticker,
                      false,
                    );
                  }
                  setDraggedTicker(null);
                }}
                canMoveLeft={sortMode === 'manual' && idx > 0}
                canMoveRight={sortMode === 'manual' && idx < stableHoldings.length - 1}
                onMoveLeft={
                  sortMode === 'manual' && idx > 0
                    ? () =>
                        reorderSection(
                          stableHoldings,
                          cryptoHoldings,
                          holding.ticker,
                          stableHoldings[idx - 1].ticker,
                          false,
                        )
                    : undefined
                }
                onMoveRight={
                  sortMode === 'manual' && idx < stableHoldings.length - 1
                    ? () =>
                        reorderSection(
                          stableHoldings,
                          cryptoHoldings,
                          holding.ticker,
                          stableHoldings[idx + 1].ticker,
                          false,
                        )
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Closed / Archived Positions & Realized Profit History */}
      {archivedHoldings.length > 0 && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Trophy size={17} className="text-accent-gold" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                Posiciones Cerradas / Histórico de Profit ({archivedHoldings.length})
              </h3>
            </div>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                totalClosedProfit >= 0
                  ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                  : 'bg-accent-red/10 border-accent-red/30 text-accent-red'
              }`}
            >
              Balance neto cerrado: {totalClosedProfit >= 0 ? '+' : ''}
              {pv(formatUsd(totalClosedProfit))}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {archivedHoldings.map((h) => {
              const profitPositive = h.pnl >= 0;
              const isConfirming = confirmDeleteTicker === h.ticker;

              return (
                <div
                  key={h.ticker}
                  className="bg-bg-card border border-border rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold text-text-primary">{pv(h.ticker)}</h4>
                      <p className="text-[11px] text-text-muted">
                        Saldo actual: {pv(formatTokens(h.currentTokens, h.ticker))}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        profitPositive ? 'text-accent-green' : 'text-accent-red'
                      }`}
                    >
                      {profitPositive ? '+' : ''}
                      {pv(formatUsd(h.pnl))}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-bg-input/50 border border-border rounded-lg p-2.5">
                    <div>
                      <span className="text-[10px] text-text-muted block">Invertido total</span>
                      <strong className="text-text-primary">{pv(formatUsd(h.totalSpent))}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-muted block">Vendido / Retirado</span>
                      <strong className="text-text-primary">{pv(formatUsd(h.soldUsd))}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => unarchiveCoin(h.ticker)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-accent-blue hover:border-accent-blue cursor-pointer"
                    >
                      <RotateCcw size={12} /> Restaurar al portafolio
                    </button>

                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            removeCoinTransactions(h.ticker);
                            setConfirmDeleteTicker(null);
                          }}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-accent-red/20 border border-accent-red/40 text-accent-red cursor-pointer"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTicker(null)}
                          className="px-2 py-1 rounded text-[11px] bg-bg-input border border-border text-text-muted cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTicker(h.ticker)}
                        title={`Borrar todas las transacciones de ${h.ticker}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted hover:text-accent-red hover:border-accent-red/40 cursor-pointer"
                      >
                        <Trash2 size={12} /> Borrar historial
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
