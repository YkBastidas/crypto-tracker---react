import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { CoinHolding } from '../types';
import { formatUsd, formatTokens } from '../utils/calculations';
import { getCoinTargets, saveCoinTargets } from '../../../shared/lib/storage';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';

interface CoinCardProps {
  holding: CoinHolding;
  onTargetChange?: () => void;
}

export function CoinCard({ holding, onTargetChange }: CoinCardProps) {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const [showTargets, setShowTargets] = useState(false);
  const [buyPct, setBuyPct] = useState(holding.targetBuyPct);
  const [sellPct, setSellPct] = useState(holding.targetSellPct);

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
      className="
        group relative p-5 rounded-xl
        bg-gradient-to-br from-bg-card to-bg-primary
        border border-border border-l-4 border-l-accent-blue
        shadow-[0_8px_16px_rgba(0,0,0,0.3)]
        hover:shadow-[0_12px_24px_rgba(0,0,0,0.5)]
        hover:-translate-y-1 hover:border-l-accent-green
        transition-all duration-300
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold tracking-wide">
          {pv(holding.ticker)}
        </h3>
        {holding.livePrice === 0 && (
          <span className="text-xs text-accent-red bg-accent-red/10 px-2 py-0.5 rounded-full">
            No price
          </span>
        )}
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
      </div>

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

      {/* Target Settings Expander */}
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

      {showTargets && (
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
