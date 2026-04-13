import { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  Wallet,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { CoinGrid } from './CoinGrid';
import { useInvestmentEngine } from '../hooks/useInvestmentEngine';
import { formatUsd } from '../utils/calculations';

const GOAL_TARGET = 20_000;

export function Dashboard() {
  const { transactions, isPrivate } = usePortfolioStore();
  const { holdings, summary, loading, error, lastFetched, refreshPrices } = useInvestmentEngine();
  const [showHistory, setShowHistory] = useState(false);
  const [, forceUpdate] = useState(0);

  const pv = (val: string) => (isPrivate ? '****' : val);

  if (transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <p className="text-4xl mb-4">👋</p>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Welcome!</h2>
          <p className="text-text-muted max-w-md">
            No transactions found. Upload your <code className="text-accent-blue">portfolio.csv</code>{' '}
            or use the sidebar to add your first transaction.
          </p>
        </div>
      </div>
    );
  }

  const metricCards = [
    {
      icon: <DollarSign size={20} />,
      label: 'Fiat Balance',
      sublabel: 'Idle Cash',
      value: formatUsd(summary.fiatBalance),
      color: 'text-accent-blue',
    },
    {
      icon: <TrendingUp size={20} />,
      label: 'Crypto Value',
      sublabel: '',
      value: formatUsd(summary.totalCryptoValue),
      color: 'text-accent-green',
    },
    {
      icon: <Wallet size={20} />,
      label: 'Total Portfolio',
      sublabel: '',
      value: formatUsd(summary.totalPortfolioValue),
      color: 'text-accent-gold',
    },
    {
      icon: <BarChart3 size={20} />,
      label: 'Total P&L',
      sublabel: '',
      value: `${summary.totalPnl >= 0 ? '+' : ''}${formatUsd(summary.totalPnl)}`,
      color: summary.totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section: Investments & DCA */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Investments & DCA</h2>
        <button
          onClick={refreshPrices}
          disabled={loading}
          className="
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
            bg-bg-card border border-border text-text-muted
            hover:text-text-primary hover:border-accent-blue
            disabled:opacity-40 transition-all cursor-pointer
          "
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching...' : 'Refresh Prices'}
        </button>
      </div>

      {error && (
        <div className="bg-accent-red/10 border border-accent-red/30 text-accent-red text-sm rounded-lg px-4 py-2">
          ⚠️ {error}
        </div>
      )}

      {lastFetched && (
        <p className="text-xs text-text-muted -mt-4">
          Last updated: {lastFetched.toLocaleTimeString()}
        </p>
      )}

      {/* Coin Cards Grid */}
      <CoinGrid holdings={holdings} onTargetChange={() => forceUpdate((n) => n + 1)} />

      {/* Global Portfolio Metrics */}
      <div className="border-t border-border pt-6">
        <h2 className="text-xl font-bold mb-4">Global Portfolio</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card) => (
            <div
              key={card.label}
              className="
                flex items-center gap-4 p-4 rounded-xl
                bg-bg-card border border-border
                hover:border-white/10 transition-colors
              "
            >
              <div className={`${card.color} bg-white/5 p-2.5 rounded-lg`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-text-muted">
                  {card.label}
                  {card.sublabel && <span className="ml-1">({card.sublabel})</span>}
                </p>
                <p className={`text-lg font-bold ${card.color}`}>
                  {pv(card.value)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Goal Progress */}
      <div className="border-t border-border pt-6">
        <ProgressBar
          current={summary.totalPortfolioValue}
          target={GOAL_TARGET}
          label="Goal Progress"
          isPrivate={isPrivate}
        />
      </div>

      {/* Transaction History */}
      <div className="border-t border-border pt-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="
            flex items-center gap-2 text-sm text-text-muted
            hover:text-text-primary transition-colors bg-transparent
            border-none cursor-pointer
          "
        >
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          View Raw Transaction History ({transactions.length} transactions)
        </button>

        {showHistory && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4 text-right">Tokens</th>
                  <th className="pb-2 text-right">USD Value</th>
                </tr>
              </thead>
              <tbody>
                {[...transactions]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((tx, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                      <td className="py-2 pr-4 text-text-muted whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{tx.type}</td>
                      <td className="py-2 pr-4 font-medium">{pv(tx.asset)}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {pv(tx.tokens)}
                      </td>
                      <td className="py-2 text-right font-mono text-xs">
                        {pv(formatUsd(tx.usdValue))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
