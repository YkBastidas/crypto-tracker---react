import { useState } from 'react';
import { Plus } from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { formatTokenStr } from '../../../shared/lib/csv';
import {
  TRANSACTION_TYPES,
  FIAT_TX_TYPES,
  ZERO_COST_TX_TYPES,
  type TransactionType,
} from '../types';

const ASSET_OPTIONS = ['BTC', 'ETH', 'SOL', 'WBETH', 'PAXG', 'BNSOL', 'BNB', '0G', 'BEAM'];

export function TransactionForm() {
  const addTransaction = usePortfolioStore((s) => s.addTransaction);
  const [txType, setTxType] = useState<TransactionType>('Deposit Fiat');
  const [asset, setAsset] = useState('BTC');
  const [tokens, setTokens] = useState('');
  const [usdValue, setUsdValue] = useState('');
  const [saving, setSaving] = useState(false);

  const isFiat = FIAT_TX_TYPES.includes(txType);
  const isZeroCost = ZERO_COST_TX_TYPES.includes(txType);

  const handleSave = () => {
    const tokensNum = isFiat ? 0 : parseFloat(tokens) || 0;
    const usdNum = isZeroCost ? 0 : parseFloat(usdValue) || 0;

    if (!isFiat && tokensNum <= 0) return;
    if (!isZeroCost && !isFiat && usdNum <= 0) return;
    if (isFiat && usdNum <= 0) return;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    addTransaction({
      date: dateStr,
      type: txType,
      asset: isFiat ? 'USD' : asset,
      tokens: isFiat ? '0.0' : formatTokenStr(tokensNum),
      usdValue: usdNum,
    });

    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setTokens('');
      setUsdValue('');
    }, 600);
  };

  const inputClass = `
    w-full px-3 py-2.5 rounded-lg text-sm
    bg-bg-input border border-border text-text-primary
    focus:outline-none focus:border-accent-blue
    transition-colors placeholder-text-muted/50
  `;

  const labelClass = 'text-xs text-text-muted font-medium block mb-1.5';

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold flex items-center gap-2">
        <Plus size={18} className="text-accent-blue" />
        New Transaction
      </h3>

      {/* Transaction Type */}
      <div>
        <label className={labelClass}>Transaction Type</label>
        <select
          value={txType}
          onChange={(e) => setTxType(e.target.value as TransactionType)}
          className={`${inputClass} cursor-pointer`}
        >
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Asset Selector (only for crypto) */}
      {!isFiat && (
        <div>
          <label className={labelClass}>Asset Ticker</label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            {ASSET_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {/* Token Quantity (only for crypto) */}
      {!isFiat && (
        <div>
          <label className={labelClass}>Quantity of Tokens</label>
          <input
            type="number"
            min={0}
            step="0.000000001"
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            placeholder="0.00000000"
            className={`${inputClass} font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        </div>
      )}

      {/* USD Value */}
      {isZeroCost ? (
        <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-lg px-3 py-2 text-xs text-accent-blue">
          ℹ️ Cost basis is automatically $0 for {txType}.
        </div>
      ) : (
        <div>
          <label className={labelClass}>
            {isFiat ? 'Amount (USD)' : 'Total USD Value of Trade'}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={usdValue}
            onChange={(e) => setUsdValue(e.target.value)}
            placeholder="0.00"
            className={`${inputClass} font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="
          w-full py-3 rounded-lg font-semibold text-sm
          bg-accent-blue/20 border border-accent-blue/40 text-accent-blue
          hover:bg-accent-blue/30 hover:border-accent-blue
          hover:shadow-[0_0_16px_rgba(59,130,246,0.3)]
          disabled:opacity-40 transition-all cursor-pointer
        "
      >
        {saving ? '✅ Saved!' : 'Save Transaction'}
      </button>
    </div>
  );
}
