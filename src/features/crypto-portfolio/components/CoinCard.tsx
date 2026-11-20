import { useMemo, useState, type DragEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  ExternalLink,
  GripVertical,
  Lock,
  Sparkles,
} from 'lucide-react';
import type { CoinHolding, TacticalDipConfig, TargetAllocations } from '../types';
import {
  computeSmartTradeRecommendation,
  formatUsd,
  formatTokens,
} from '../utils/calculations';
import { getCoinTargets, saveCoinTargets } from '../../../shared/lib/storage';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';

interface CoinCardProps {
  holding: CoinHolding;
  eligibleCapitalUsd?: number;
  totalVolatileCryptoUsd?: number;
  allVolatileHoldings?: CoinHolding[];
  tacticalConfig?: TacticalDipConfig;
  targetAllocations?: TargetAllocations;
  onTargetChange?: () => void;
  onArchive?: (ticker: string) => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: () => void;
}

export function CoinCard({
  holding,
  eligibleCapitalUsd = 0,
  totalVolatileCryptoUsd = 0,
  allVolatileHoldings,
  tacticalConfig,
  targetAllocations,
  onTargetChange,
  onArchive,
  canMoveLeft = false,
  canMoveRight = false,
  onMoveLeft,
  onMoveRight,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}: CoinCardProps) {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const [showTargets, setShowTargets] = useState(false);
  const [buyPct, setBuyPct] = useState(holding.targetBuyPct);
  const [sellPct, setSellPct] = useState(holding.targetSellPct);

  const recommendation = useMemo(
    () =>
      !holding.isStablecoin && holding.livePrice > 0
        ? computeSmartTradeRecommendation({
            holding,
            eligibleCapitalUsd,
            totalVolatileCryptoUsd,
            allVolatileHoldings,
            tacticalConfig,
            targetAllocations,
          })
        : null,
    [
      holding,
      eligibleCapitalUsd,
      totalVolatileCryptoUsd,
      allVolatileHoldings,
      tacticalConfig,
      targetAllocations,
    ],
  );

  const pv = (val: string) => (isPrivate ? '****' : val);

  const pnlColor = holding.pnl >= 0 ? 'text-accent-green' : 'text-accent-red';
  const pnlPrefix = holding.pnl >= 0 ? '+' : '';

  // Determine trade symbol for Binance URL
  const tradeSymbol = holding.ticker.toUpperCase() === 'BEAM' ? 'BEAMX' : holding.ticker;
  const tradeUrl = `https://www.binance.com/es/trade/${tradeSymbol}_USDT?type=spot`;

  // Signal button styles
  const signalStyles: Record<string, string> = {
    BUY: 'bg-accent-red/10 border-accent-red/40 text-accent-red hover:bg-accent-red/20 hover:border-accent-red hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]',
    SELL: 'bg-accent-green/10 border-accent-green/40 text-accent-green hover:bg-accent-green/20 hover:border-accent-green hover:shadow-[0_0_12px_rgba(0,255,157,0.3)]',
    WATCH: 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold hover:bg-accent-gold/20 hover:border-accent-gold hover:shadow-[0_0_12px_rgba(243,186,47,0.4)]',
  };

  const signalLabel: Record<string, string> = {
    BUY: 'BUY',
    SELL: 'SELL',
    WATCH: 'See in Binance',
  };

  function handleTargetSave(field: 'buy' | 'sell', value: number) {
    const targets = getCoinTargets();
    const current = targets[holding.ticker] ?? { buy: 20, sell: 20 };
    targets[holding.ticker] = { ...current, [field]: value };
    saveCoinTargets(targets);
    onTargetChange?.();
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        group relative p-5 rounded-xl
        bg-gradient-to-br from-bg-card to-bg-primary
        border border-border border-l-4 border-l-accent-blue
        shadow-[0_8px_16px_rgba(0,0,0,0.3)]
        hover:shadow-[0_12px_24px_rgba(0,0,0,0.5)]
        hover:-translate-y-1 hover:border-l-accent-green
        transition-all duration-300
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {draggable && (
            <GripVertical size={15} className="text-text-muted/60 shrink-0" />
          )}
          <h3 className="text-xl font-bold tracking-wide truncate">
            {pv(holding.ticker)}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {holding.livePrice === 0 && (
            <span className="text-[10px] text-accent-red bg-accent-red/10 px-2 py-0.5 rounded-full">
              No price
            </span>
          )}
          {(onMoveLeft || onMoveRight) && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onMoveLeft}
                disabled={!canMoveLeft}
                title="Mover a la izquierda"
                className="p-1 rounded bg-bg-input border border-border text-text-muted hover:text-text-primary disabled:opacity-25 cursor-pointer"
              >
                <ArrowLeft size={12} />
              </button>
              <button
                type="button"
                onClick={onMoveRight}
                disabled={!canMoveRight}
                title="Mover a la derecha"
                className="p-1 rounded bg-bg-input border border-border text-text-muted hover:text-text-primary disabled:opacity-25 cursor-pointer"
              >
                <ArrowRight size={12} />
              </button>
            </div>
          )}
          {onArchive && (
            <button
              type="button"
              onClick={() => onArchive(holding.ticker)}
              title="Cerrar seguimiento y mover a Histórico de Profit"
              className="p-1 rounded bg-bg-input border border-border text-text-muted hover:text-accent-gold hover:border-accent-gold/40 cursor-pointer"
            >
              <Archive size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Holdings */}
      <p className="text-text-muted text-sm mb-1">
        {pv(formatTokens(holding.currentTokens, holding.ticker))}
      </p>

      {/* Invested */}
      <p className="text-sm">
        <span className="text-text-muted">Invested:</span>{' '}
        <span className="font-medium">{pv(formatUsd(holding.investedUsd))}</span>
      </p>

      {/* Stats */}
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-text-muted">DCA</span>
          <span className="font-medium">{pv(formatUsd(holding.dca))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Live Price</span>
          <span className="font-medium">{pv(formatUsd(holding.livePrice))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Current Value</span>
          <span className="font-medium">{pv(formatUsd(holding.currentValue))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">P&L</span>
          <span className={`font-semibold ${pnlColor}`}>
            {pv(`${pnlPrefix}${formatUsd(holding.pnl)}`)}
            {!isPrivate && (
              <span className="ml-1 text-xs">
                ({pnlPrefix}{(holding.pnlPercent * 100).toFixed(2)}%)
              </span>
            )}
          </span>
        </div>
        {!holding.isStablecoin &&
          holding.gasTokens !== undefined &&
          holding.gasTokens > 0 &&
          holding.dca > 0 &&
          holding.livePrice > 0 && (
            <div className="flex justify-between text-[10px] text-text-muted/80 pt-0.5">
              <span>Gas/Fees: -{pv(formatTokens(holding.gasTokens, holding.ticker))}</span>
              {!isPrivate && (
                <span>
                  Δ precio:{' '}
                  {(() => {
                    const priceDeltaPct = ((holding.livePrice - holding.dca) / holding.dca) * 100;
                    return `${priceDeltaPct >= 0 ? '+' : ''}${priceDeltaPct.toFixed(1)}%`;
                  })()}
                </span>
              )}
            </div>
          )}
      </div>

      {!holding.isStablecoin && (
        <>
          {/* Targets separator */}
          <div className="mt-4 pt-3 border-t border-white/5 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">
                Target Buy <span className="text-accent-red">(-{buyPct}%)</span>
              </span>
              <span className="text-accent-red font-medium">
                {pv(formatUsd(holding.targetBuyPrice))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">
                Target Sell <span className="text-accent-green">(+{sellPct}%)</span>
              </span>
              <span className="text-accent-green font-medium">
                {pv(formatUsd(holding.targetSellPrice))}
              </span>
            </div>
          </div>

          {/* Smart Dip-Buying / Profit-Taking Insight */}
          {recommendation && holding.tradeSignal === 'BUY' && (
            <div
              className={`mt-3 p-2.5 rounded-lg border text-[11px] space-y-1.5 ${
                recommendation.isCooldownLocked
                  ? 'bg-bg-input/60 border-border'
                  : 'bg-accent-red/10 border-accent-red/30'
              }`}
            >
              <div
                className={`flex items-center justify-between gap-1 font-semibold ${
                  recommendation.isCooldownLocked ? 'text-accent-gold' : 'text-accent-red'
                }`}
              >
                <span className="flex items-center gap-1">
                  {recommendation.isCooldownLocked ? <Lock size={12} /> : <Sparkles size={12} />}
                  {recommendation.dipTierLabel}
                </span>
                <span>
                  -{recommendation.dropFromDcaPct.toFixed(1)}%
                  {recommendation.priorityRank && recommendation.tacticalBuyUsd > 0
                    ? ` · #${recommendation.priorityRank}`
                    : ''}
                </span>
              </div>
              {recommendation.tacticalBuyUsd > 0 ? (
                <p className="text-text-muted leading-snug">
                  Cupo táctico según tus reglas:{' '}
                  <strong className="text-accent-gold">
                    {pv(formatUsd(recommendation.tacticalBuyUsd))}
                  </strong>{' '}
                  <span className="text-[10px]">
                    ({pv(formatTokens(recommendation.tacticalBuyTokens, holding.ticker))} · bloque fijo
                    {recommendation.sharedAmongBuyCount && recommendation.sharedAmongBuyCount > 1
                      ? ` · Reparto diario`
                      : ''}
                    {recommendation.isGroupOverweightTrimmed &&
                    recommendation.groupDriftPct !== undefined
                      ? ` · 50% por sobrepeso (+${recommendation.groupDriftPct.toFixed(1)}%)`
                      : ''}
                    {recommendation.isFlashCrashOverrideUnlocked
                      ? ' · Escape Flash Crash'
                      : recommendation.isTier3EscapeUnlocked
                        ? ' · Capitulación Nivel 3'
                        : ''})
                  </span>
                </p>
              ) : (
                recommendation.blockedReason && (
                  <p className="text-[10px] text-accent-gold leading-snug">
                    {recommendation.blockedReason}
                  </p>
                )
              )}
              {recommendation.lastDipBuyPrice && recommendation.lastDipBuyPrice > 0 && (
                <p className="text-[10px] text-text-muted/85 leading-snug">
                  Última compra en caída: {pv(formatUsd(recommendation.lastDipBuyPrice))}
                  {recommendation.lastDipBuyDate ? ` (${recommendation.lastDipBuyDate.slice(0, 10)})` : ''}
                  {recommendation.isTimeCooldownLocked && recommendation.flashCrashUnlockPrice ? (
                    <> · Escape flash crash ≤ {pv(formatUsd(recommendation.flashCrashUnlockPrice))}</>
                  ) : (
                    recommendation.nextUnlockPrice && (
                      <> · Desbloqueo ≤ {pv(formatUsd(recommendation.nextUnlockPrice))}</>
                    )
                  )}
                </p>
              )}
              {recommendation.breakEvenBuyUsd > 0 && (
                <p className="text-[10px] text-text-muted/80 leading-snug">
                  Info referencial (salir de BUY):{' '}
                  <strong className="text-text-muted">
                    {pv(formatUsd(recommendation.breakEvenBuyUsd))}
                  </strong>{' '}
                  <span>
                    ({pv(formatTokens(recommendation.breakEvenBuyTokens, holding.ticker))} → DCA{' '}
                    {pv(formatUsd(recommendation.newDcaAfterBreakEven))})
                  </span>
                </p>
              )}
              {recommendation.concentrationWarning && (
                <p className="text-[10px] text-accent-gold font-medium">
                  ⚠️ {recommendation.concentrationWarning}
                </p>
              )}
            </div>
          )}

          {recommendation?.limitOrder && (
            <div className="mt-3 p-2.5 rounded-lg border bg-cyan-500/10 border-cyan-500/35 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between gap-1 font-semibold text-cyan-300">
                <span className="flex items-center gap-1">
                  <Crosshair size={12} /> Orden LIMIT · {recommendation.limitOrder.unlockTriggerLabel}
                </span>
                <span>
                  A -{recommendation.limitOrder.distancePct.toFixed(1)}%
                  {recommendation.limitOrder.priorityRank &&
                  recommendation.limitOrder.sharedAmongLimitCount &&
                  recommendation.limitOrder.sharedAmongLimitCount > 1
                    ? ` · #${recommendation.limitOrder.priorityRank}`
                    : ''}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Precio LIMIT exacto:</span>
                <strong className="text-cyan-200">
                  {pv(formatUsd(recommendation.limitOrder.limitPrice))}
                </strong>
              </div>
              <p className="text-text-muted leading-snug">
                Monto según tus reglas:{' '}
                <strong className="text-accent-gold">
                  {pv(formatUsd(recommendation.limitOrder.suggestedUsd))}
                </strong>{' '}
                <span className="text-[10px]">
                  ({pv(formatTokens(recommendation.limitOrder.suggestedTokens, holding.ticker))} ·{' '}
                  {recommendation.limitOrder.dipTierLabel.split(' · ')[0]}
                  {recommendation.limitOrder.sharedAmongLimitCount &&
                  recommendation.limitOrder.sharedAmongLimitCount > 1
                    ? ' · Reparto remanente'
                    : ''}
                  {recommendation.limitOrder.isGroupOverweightTrimmed
                    ? ' · 50% por sobrepeso'
                    : ''}
                  )
                </span>
              </p>
              <p className="text-[10px] text-cyan-200/85 flex items-start gap-1 leading-snug">
                <Clock size={11} className="shrink-0 mt-0.5" />
                <span>{recommendation.limitOrder.expiryRuleLabel}.</span>
              </p>
            </div>
          )}

          {recommendation && holding.tradeSignal === 'SELL' && (
            <div className="mt-3 p-2.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-[11px] space-y-1">
              <div className="flex items-center justify-between font-semibold text-accent-green">
                <span className="flex items-center gap-1">
                  <Sparkles size={12} /> Toma parcial sugerida (25%)
                </span>
                <span>+{recommendation.pumpFromDcaPct.toFixed(1)}%</span>
              </div>
              <p className="text-text-muted">
                Vender{' '}
                <strong className="text-text-primary">
                  {pv(formatTokens(recommendation.suggestedSellTokens, holding.ticker))}
                </strong>{' '}
                (≈ {pv(formatUsd(recommendation.suggestedSellUsd))}) hacia USDT.
              </p>
            </div>
          )}

          {/* Trade Action Button */}
          <div className="mt-4 flex items-center gap-2">
            <a
              href={tradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`
                flex-1 flex items-center justify-center gap-2
                px-4 py-2.5 rounded-lg border font-semibold text-sm
                transition-all duration-200 cursor-pointer no-underline
                ${signalStyles[holding.tradeSignal]}
              `}
            >
              {signalLabel[holding.tradeSignal]}
              <ExternalLink size={14} />
            </a>
          </div>
        </>
      )}

      {/* Target Settings Expander */}
      {!holding.isStablecoin && (
        <button
          onClick={() => setShowTargets(!showTargets)}
          className="
            mt-3 w-full flex items-center justify-center gap-1
            text-xs text-text-muted hover:text-text-primary
            transition-colors cursor-pointer bg-transparent border-none
          "
        >
          🎯 Set Targets
          {showTargets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      {!holding.isStablecoin && showTargets && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Buy Drop %</label>
            <input
              type="number"
              min={0}
              step={1}
              value={buyPct}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setBuyPct(val);
                handleTargetSave('buy', val);
              }}
              className="
                w-full px-3 py-1.5 rounded-lg text-sm
                bg-bg-input border border-border text-text-primary
                focus:outline-none focus:border-accent-blue
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
              "
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Sell Pump %</label>
            <input
              type="number"
              min={0}
              step={1}
              value={sellPct}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setSellPct(val);
                handleTargetSave('sell', val);
              }}
              className="
                w-full px-3 py-1.5 rounded-lg text-sm
                bg-bg-input border border-border text-text-primary
                focus:outline-none focus:border-accent-blue
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
              "
            />
          </div>
        </div>
      )}
    </div>
  );
}
