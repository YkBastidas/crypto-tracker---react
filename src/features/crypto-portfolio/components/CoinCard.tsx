import { useMemo, useState, type DragEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  ExternalLink,
  GripVertical,
  Lock,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CoinHolding,
  OpenLimitOrder,
  TacticalDipConfig,
  TargetAllocations,
  Transaction,
} from '../types';
import {
  computeSmartTradeRecommendation,
  formatUsd,
  formatTokens,
  sumReservedLimitUsdt,
} from '../utils/calculations';
import { formatTokenStr } from '../../../shared/lib/csv';
import { getCoinTargets, saveCoinTargets } from '../../../shared/lib/storage';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { useBudgetStore } from '../../budget/store/budgetStore';

interface CoinCardProps {
  holding: CoinHolding;
  eligibleCapitalUsd?: number;
  totalVolatileCryptoUsd?: number;
  allVolatileHoldings?: CoinHolding[];
  tacticalConfig?: TacticalDipConfig;
  targetAllocations?: TargetAllocations;
  openLimitOrders?: OpenLimitOrder[];
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
  openLimitOrders: openLimitOrdersProp,
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
  const {
    isPrivate,
    openLimitOrders: storeOpenLimitOrders,
    addOpenLimitOrder,
    removeOpenLimitOrder,
    addTransactionsBatch,
  } = usePortfolioStore();
  const openLimitOrders = openLimitOrdersProp ?? storeOpenLimitOrders;
  const [showTargets, setShowTargets] = useState(false);
  const [buyPct, setBuyPct] = useState(holding.targetBuyPct);
  const [sellPct, setSellPct] = useState(holding.targetSellPct);
  const [nowMs] = useState(() => Date.now());
  const [showPlaceLimitForm, setShowPlaceLimitForm] = useState(false);
  const [draftLimitPrice, setDraftLimitPrice] = useState('');
  const [draftLimitUsd, setDraftLimitUsd] = useState('');
  const [fillingOrderId, setFillingOrderId] = useState<string | null>(null);
  const [fillTokens, setFillTokens] = useState('');
  const [fillUsd, setFillUsd] = useState('');
  const [fillSyncBudget, setFillSyncBudget] = useState(true);

  const reservedLimitTotalUsd = useMemo(
    () => sumReservedLimitUsdt(openLimitOrders),
    [openLimitOrders],
  );
  const myOpenLimitOrders = useMemo(
    () =>
      openLimitOrders.filter(
        (o) => o.ticker.toUpperCase() === holding.ticker.toUpperCase(),
      ),
    [openLimitOrders, holding.ticker],
  );

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
            openLimitOrders,
            nowMs,
          })
        : null,
    [
      holding,
      eligibleCapitalUsd,
      totalVolatileCryptoUsd,
      allVolatileHoldings,
      tacticalConfig,
      targetAllocations,
      openLimitOrders,
      nowMs,
    ],
  );

  const openPlaceLimitForm = (defaultPrice: number, defaultUsd: number) => {
    setDraftLimitPrice(defaultPrice > 0 ? String(defaultPrice) : '');
    setDraftLimitUsd(defaultUsd > 0 ? defaultUsd.toFixed(2) : '');
    setShowPlaceLimitForm(true);
  };

  const handleSaveOpenLimit = (
    e: React.FormEvent,
    triggerLabel?: string,
  ) => {
    e.preventDefault();
    const cleanPrice = parseFloat(draftLimitPrice);
    const cleanUsd = parseFloat(draftLimitUsd);
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) return;
    if (!Number.isFinite(cleanUsd) || cleanUsd <= 0) return;
    addOpenLimitOrder({
      ticker: holding.ticker,
      limitPrice: cleanPrice,
      reservedUsd: cleanUsd,
      targetBuyPriceAtPlacement:
        holding.targetBuyPrice > 0 ? holding.targetBuyPrice : undefined,
      unlockTriggerLabel: triggerLabel ?? 'Orden LIMIT manual',
    });
    setShowPlaceLimitForm(false);
    setDraftLimitPrice('');
    setDraftLimitUsd('');
  };

  const startFillOrder = (order: OpenLimitOrder) => {
    const estTokens = order.limitPrice > 0 ? order.reservedUsd / order.limitPrice : 0;
    setFillingOrderId(order.id);
    setFillTokens(estTokens > 0 ? formatTokenStr(estTokens) : '');
    setFillUsd(order.reservedUsd.toFixed(2));
    setFillSyncBudget(true);
  };

  const handleConfirmFillOrder = (e: React.FormEvent, order: OpenLimitOrder) => {
    e.preventDefault();
    const tokensNum = parseFloat(fillTokens);
    const usdNum = parseFloat(fillUsd);
    if (!Number.isFinite(tokensNum) || tokensNum <= 0) return;
    if (!Number.isFinite(usdNum) || usdNum <= 0) return;

    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateStr = `${datePart} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const batch: Transaction[] = [
      {
        date: dateStr,
        type: 'Buy',
        asset: holding.ticker,
        tokens: formatTokenStr(tokensNum),
        usdValue: Number(usdNum.toFixed(2)),
      },
      {
        date: dateStr,
        type: 'Sell',
        asset: 'USDT',
        tokens: formatTokenStr(usdNum),
        usdValue: Number(usdNum.toFixed(2)),
      },
    ];
    addTransactionsBatch(
      batch,
      `LIMIT ejecutada: Buy ${holding.ticker} (${formatTokenStr(tokensNum)})`,
    );

    if (fillSyncBudget) {
      useBudgetStore.getState().recordCryptoPortfolioUsdtFlow({
        date: datePart,
        direction: 'out',
        amountUsd: Number(usdNum.toFixed(2)),
        notes: `LIMIT ejecutada (${holding.ticker}): ${formatTokenStr(tokensNum)} ${holding.ticker}`,
      });
    }

    removeOpenLimitOrder(order.id);
    setFillingOrderId(null);
  };

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
        {holding.isStablecoin &&
          holding.ticker.toUpperCase() === 'USDT' &&
          reservedLimitTotalUsd > 0 && (
            <>
              <div className="flex justify-between text-xs pt-1 border-t border-white/5">
                <span className="text-cyan-300">
                  Reservado LIMIT ({openLimitOrders.length})
                </span>
                <span className="font-semibold text-cyan-300">
                  -{pv(formatUsd(reservedLimitTotalUsd))}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">USDT libre táctico</span>
                <span className="font-semibold text-accent-green">
                  {pv(formatUsd(Math.max(0, eligibleCapitalUsd - reservedLimitTotalUsd)))}
                </span>
              </div>
            </>
          )}
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
              <button
                type="button"
                onClick={() =>
                  openPlaceLimitForm(
                    recommendation.limitOrder!.limitPrice,
                    recommendation.limitOrder!.suggestedUsd,
                  )
                }
                className="w-full mt-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <BookmarkCheck size={12} /> Marcar LIMIT colocada (reservar USDT)
              </button>
            </div>
          )}

          {/* Active Placed Open LIMIT Orders for this coin */}
          {myOpenLimitOrders.length > 0 && (
            <div className="mt-3 space-y-2">
              {myOpenLimitOrders.map((order) => {
                const createdMs = Date.parse(order.createdAt);
                const ageHours = Number.isFinite(createdMs)
                  ? Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60)))
                  : 0;
                const estTokens = order.limitPrice > 0 ? order.reservedUsd / order.limitPrice : 0;
                const isHit = holding.livePrice > 0 && holding.livePrice <= order.limitPrice;
                const reboundedAboveTarget =
                  !isHit &&
                  order.targetBuyPriceAtPlacement !== undefined &&
                  holding.livePrice > order.targetBuyPriceAtPlacement * 1.005;
                const isFilling = fillingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="p-2.5 rounded-lg border bg-accent-blue/10 border-accent-blue/40 text-[11px] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1 font-semibold text-accent-blue">
                      <span className="flex items-center gap-1">
                        <BookmarkCheck size={12} /> LIMIT abierta en exchange
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          ageHours >= 72
                            ? 'bg-accent-red/20 text-accent-red'
                            : ageHours >= 48
                              ? 'bg-accent-gold/20 text-accent-gold'
                              : 'bg-bg-card/80 text-text-muted'
                        }`}
                      >
                        {ageHours >= 72 ? `>72h (${ageHours}h)` : `Hace ${ageHours}h`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">Precio LIMIT:</span>
                      <strong className="text-text-primary">
                        {pv(formatUsd(order.limitPrice))}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">USDT reservado:</span>
                      <strong className="text-accent-gold">
                        {pv(formatUsd(order.reservedUsd))}{' '}
                        <span className="text-[10px] text-text-muted font-normal">
                          (≈ {pv(formatTokens(estTokens, holding.ticker))})
                        </span>
                      </strong>
                    </div>

                    {isHit && (
                      <p className="text-[10px] text-accent-green font-medium leading-snug">
                        ⚡ El precio tocó tu LIMIT ({pv(formatUsd(holding.livePrice))}). Verifica en Binance y márcala como ejecutada.
                      </p>
                    )}
                    {reboundedAboveTarget && !isHit && (
                      <p className="text-[10px] text-accent-gold leading-snug">
                        ↩️ Rebotó sobre Target Buy ({pv(formatUsd(order.targetBuyPriceAtPlacement!))}). Evalúa cancelarla para liberar USDT.
                      </p>
                    )}
                    {ageHours >= 72 && !isHit && (
                      <p className="text-[10px] text-accent-red leading-snug">
                        ⏰ Superó 72h abierta sin ejecutarse — cancela si quieres liberar tu USDT.
                      </p>
                    )}

                    {isFilling ? (
                      <form
                        onSubmit={(e) => handleConfirmFillOrder(e, order)}
                        className="pt-1.5 border-t border-border/60 space-y-2"
                      >
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="block">
                            <span className="text-[10px] text-text-muted block mb-0.5">
                              Tokens ({holding.ticker})
                            </span>
                            <input
                              type="number"
                              step="0.00000001"
                              min="0"
                              required
                              value={fillTokens}
                              onChange={(e) => setFillTokens(e.target.value)}
                              className="w-full px-2 py-1 rounded text-[11px] font-mono bg-bg-input border border-border text-text-primary"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-text-muted block mb-0.5">
                              USD gastados
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={fillUsd}
                              onChange={(e) => setFillUsd(e.target.value)}
                              className="w-full px-2 py-1 rounded text-[11px] font-mono bg-bg-input border border-border text-text-primary"
                            />
                          </label>
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={fillSyncBudget}
                            onChange={(e) => setFillSyncBudget(e.target.checked)}
                            className="accent-accent-blue"
                          />
                          <span>Descontar USDT del módulo Presupuesto</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="submit"
                            className="flex-1 py-1 px-2 rounded text-[11px] font-semibold bg-accent-green/20 border border-accent-green/40 text-accent-green cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Check size={12} /> Confirmar compra
                          </button>
                          <button
                            type="button"
                            onClick={() => setFillingOrderId(null)}
                            className="py-1 px-2 rounded text-[11px] bg-bg-input border border-border text-text-muted cursor-pointer"
                          >
                            Volver
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => startFillOrder(order)}
                          className="flex-1 py-1 px-2 rounded text-[11px] font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Check size={12} /> Se ejecutó
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOpenLimitOrder(order.id)}
                          className="py-1 px-2.5 rounded text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-accent-red hover:border-accent-red/40 cursor-pointer flex items-center gap-1"
                        >
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Form to Log/Adjust Placed LIMIT Order */}
          {showPlaceLimitForm && (
            <form
              onSubmit={(e) =>
                handleSaveOpenLimit(e, recommendation?.limitOrder?.unlockTriggerLabel)
              }
              className="mt-3 p-2.5 rounded-lg border border-cyan-500/40 bg-bg-input/80 space-y-2 text-[11px]"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300">Registrar LIMIT colocada</span>
                <button
                  type="button"
                  onClick={() => setShowPlaceLimitForm(false)}
                  className="text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <span className="text-[10px] text-text-muted block mb-0.5">Precio LIMIT ($)</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={draftLimitPrice}
                    onChange={(e) => setDraftLimitPrice(e.target.value)}
                    className="w-full px-2 py-1 rounded text-xs font-mono bg-bg-card border border-border text-text-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-text-muted block mb-0.5">USDT reservado ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={draftLimitUsd}
                    onChange={(e) => setDraftLimitUsd(e.target.value)}
                    className="w-full px-2 py-1 rounded text-xs font-mono bg-bg-card border border-border text-text-primary"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="w-full py-1.5 rounded text-[11px] font-semibold bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
              >
                Guardar LIMIT abierta
              </button>
            </form>
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

      {/* Target Settings & Manual LIMIT Expander */}
      {!holding.isStablecoin && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowTargets(!showTargets)}
            className="
              flex items-center gap-1
              text-xs text-text-muted hover:text-text-primary
              transition-colors cursor-pointer bg-transparent border-none
            "
          >
            🎯 Set Targets
            {showTargets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            onClick={() =>
              openPlaceLimitForm(
                recommendation?.limitOrder?.limitPrice ??
                  (holding.targetBuyPrice > 0
                    ? Number(holding.targetBuyPrice.toFixed(holding.targetBuyPrice < 1 ? 4 : 2))
                    : Number(holding.livePrice.toFixed(holding.livePrice < 1 ? 4 : 2))),
                recommendation?.limitOrder?.suggestedUsd ?? tacticalConfig?.tier1Usd ?? 45,
              )
            }
            className="
              flex items-center gap-1 px-2 py-0.5 rounded
              text-[11px] text-cyan-300/90 hover:text-cyan-200
              bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400/60
              transition-colors cursor-pointer
            "
          >
            <Plus size={11} /> LIMIT manual
          </button>
        </div>
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
