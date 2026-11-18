import { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  Wallet,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { CoinGrid } from './CoinGrid';
import { useInvestmentEngine } from '../hooks/useInvestmentEngine';
import { TRANSACTION_TYPES, type Transaction, type TransactionType } from '../types';
import { formatUsd } from '../utils/calculations';

export function Dashboard() {
  const {
    transactions,
    isPrivate,
    goalTarget,
    setGoalTarget,
    updateTransaction,
    removeTransaction,
  } = usePortfolioStore();
  const { holdings, summary, loading, error, lastFetched, refreshPrices } = useInvestmentEngine();
  const [showHistory, setShowHistory] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goalTarget));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<TransactionType>('Buy');
  const [editAsset, setEditAsset] = useState('');
  const [editTokens, setEditTokens] = useState('');
  const [editUsd, setEditUsd] = useState('');
  const [, forceUpdate] = useState(0);

  const pv = (val: string) => (isPrivate ? '****' : val);

  const startEditRow = (originalIndex: number, tx: Transaction) => {
    setEditingIndex(originalIndex);
    setEditDate(tx.date);
    setEditType(tx.type);
    setEditAsset(tx.asset);
    setEditTokens(tx.tokens);
    setEditUsd(String(tx.usdValue));
  };

  const handleSaveRow = (originalIndex: number) => {
    const parsedUsd = parseFloat(editUsd);
    if (!editAsset.trim() || !editTokens.trim() || !Number.isFinite(parsedUsd) || parsedUsd < 0) {
      return;
    }
    updateTransaction(originalIndex, {
      date: editDate.trim() || new Date().toISOString().slice(0, 19).replace('T', ' '),
      type: editType,
      asset: editAsset.trim().toUpperCase(),
      tokens: editTokens.trim(),
      usdValue: Number(parsedUsd.toFixed(2)),
    });
    setEditingIndex(null);
  };

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
      label: 'Stablecoins',
      sublabel: 'Low Risk',
      value: formatUsd(summary.totalStableValue),
      color: 'text-accent-blue',
    },
    {
      icon: <TrendingUp size={20} />,
      label: 'Crypto Value',
      sublabel: 'Volatile',
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
      <div className="border-t border-border pt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-text-muted">Meta global del portafolio</span>
          {editingGoal ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseFloat(goalInput);
                if (Number.isFinite(parsed) && parsed > 0) {
                  setGoalTarget(parsed);
                  setEditingGoal(false);
                }
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="w-32 px-2.5 py-1 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
              <button
                type="submit"
                title="Guardar meta"
                className="p-1.5 rounded-lg bg-accent-green/20 border border-accent-green/40 text-accent-green cursor-pointer"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                title="Cancelar"
                onClick={() => {
                  setGoalInput(String(goalTarget));
                  setEditingGoal(false);
                }}
                className="p-1.5 rounded-lg bg-bg-card border border-border text-text-muted cursor-pointer"
              >
                <X size={13} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setGoalInput(String(goalTarget));
                setEditingGoal(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-bg-card border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
            >
              <Pencil size={12} /> Editar meta ({pv(formatUsd(goalTarget))})
            </button>
          )}
        </div>
        <ProgressBar
          current={summary.totalPortfolioValue}
          target={goalTarget}
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
                  <th className="pb-2 pr-4 text-right">USD Value</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions
                  .map((tx, originalIndex) => ({ tx, originalIndex }))
                  .sort((a, b) => new Date(b.tx.date).getTime() - new Date(a.tx.date).getTime())
                  .map(({ tx, originalIndex }) => {
                    const isEditing = editingIndex === originalIndex;
                    return (
                      <tr key={originalIndex} className="border-b border-border/50 hover:bg-white/[0.02]">
                        <td className="py-2 pr-4 text-text-muted whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-40 px-2 py-1 rounded text-xs bg-bg-input border border-border text-text-primary"
                            />
                          ) : (
                            tx.date
                          )}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {isEditing ? (
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as TransactionType)}
                              className="px-2 py-1 rounded text-xs bg-bg-input border border-border text-text-primary"
                            >
                              {TRANSACTION_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          ) : (
                            tx.type
                          )}
                        </td>
                        <td className="py-2 pr-4 font-medium">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editAsset}
                              onChange={(e) => setEditAsset(e.target.value)}
                              className="w-20 px-2 py-1 rounded text-xs uppercase bg-bg-input border border-border text-text-primary"
                            />
                          ) : (
                            pv(tx.asset)
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editTokens}
                              onChange={(e) => setEditTokens(e.target.value)}
                              className="w-28 px-2 py-1 rounded text-xs text-right bg-bg-input border border-accent-blue text-text-primary"
                            />
                          ) : (
                            pv(tx.tokens)
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editUsd}
                              onChange={(e) => setEditUsd(e.target.value)}
                              className="w-24 px-2 py-1 rounded text-xs text-right bg-bg-input border border-border text-text-primary"
                            />
                          ) : (
                            pv(formatUsd(tx.usdValue))
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveRow(originalIndex)}
                                title="Guardar cambios"
                                className="p-1.5 rounded bg-accent-green/20 border border-accent-green/40 text-accent-green cursor-pointer"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingIndex(null)}
                                title="Cancelar"
                                className="p-1.5 rounded bg-bg-input border border-border text-text-muted cursor-pointer"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditRow(originalIndex, tx)}
                                title="Editar transacción"
                                className="p-1.5 rounded bg-bg-card border border-border text-text-muted hover:text-accent-blue hover:border-accent-blue cursor-pointer"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingIndex === originalIndex) setEditingIndex(null);
                                  removeTransaction(originalIndex);
                                }}
                                title="Eliminar transacción"
                                className="p-1.5 rounded bg-bg-card border border-border text-text-muted hover:text-accent-red hover:border-accent-red cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
