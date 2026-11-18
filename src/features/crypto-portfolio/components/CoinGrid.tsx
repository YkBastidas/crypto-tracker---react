import { useMemo, useState, type DragEvent } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  Coins,
  RotateCcw,
  Trash2,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useBudgetStore } from '../../budget/store/budgetStore';
import { calculateEligibleInvestmentCapital } from '../../budget/utils/calculations';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { CoinCard } from './CoinCard';
import type { CoinHolding } from '../types';
import { formatTokens, formatUsd } from '../utils/calculations';

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
  const [sortMode, setSortMode] = useState<PortfolioSortMode>('manual');
  const [draggedTicker, setDraggedTicker] = useState<string | null>(null);
  const [confirmDeleteTicker, setConfirmDeleteTicker] = useState<string | null>(null);

  const movements = useBudgetStore((s) => s.movements);
  const {
    isPrivate,
    customCoinOrder,
    archivedCoins,
    setCustomCoinOrder,
    archiveCoin,
    unarchiveCoin,
    removeCoinTransactions,
  } = usePortfolioStore();

  const pv = (val: string) => (isPrivate ? '****' : val);

  const { totalEligibleUsd } = useMemo(
    () => calculateEligibleInvestmentCapital(movements),
    [movements],
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
      {/* Sort & Filter Controls + Volatile Crypto Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={17} className="text-accent-green" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Activos Crypto ({cryptoHoldings.length})
            </h3>
          </div>

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
