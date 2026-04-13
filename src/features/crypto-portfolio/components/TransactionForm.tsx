import { useState } from 'react';
import { Plus } from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { formatTokenStr } from '../../../shared/lib/csv';
import {
  TRANSACTION_TYPES,
  ZERO_COST_TX_TYPES,
  EXTERNAL_FLOW_TX_TYPES,
  type TransactionType,
} from '../types';

const ASSET_OPTIONS = [
  'BTC', 'ETH', 'SOL', 'WBETH', 'PAXG', 'BNSOL', 'BNB', '0G', 'BEAM',
  'USDT', 'USDC', 'DAI',
];

export function TransactionForm() {
  const addTransaction = usePortfolioStore((s) => s.addTransaction);
  const [txType, setTxType] = useState<TransactionType>('Buy');
  const [asset, setAsset] = useState('BTC');
  const [tokens, setTokens] = useState('');
  const [usdValue, setUsdValue] = useState('');
  const [fundedBy, setFundedBy] = useState('USDT');
  const [saving, setSaving] = useState(false);

  const isExternalFlow = EXTERNAL_FLOW_TX_TYPES.includes(txType);
  const isZeroCost = ZERO_COST_TX_TYPES.includes(txType);
  const isTrade = txType === 'Buy' || txType === 'Sell';

  const handleSave = () => {
    const tokensNum = parseFloat(tokens) || 0;
    const usdNum = isZeroCost ? 0 : parseFloat(usdValue) || 0;

    // Validation: always require tokens (the asset quantity)
    if (tokensNum <= 0) return;
    // Require USD value for non-zero-cost types (Buy, Sell, Deposit, Withdraw)
    if (!isZeroCost && usdNum <= 0) return;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // 1. Primary transaction
    addTransaction({
      date: dateStr,
      type: txType,
      asset: asset,
      tokens: formatTokenStr(tokensNum),
      usdValue: usdNum,
    });

    // 2. Dual Funding Transaction for active Trades (Buy / Sell)
    if (isTrade && fundedBy !== 'EXTERNAL') {
      const isBuying = txType === 'Buy';
      // To fund a Buy, you Sell the funding asset. To fund a Sell, you Buy the funding asset.
      const pairedType: TransactionType = isBuying ? 'Sell' : 'Buy';
      
      // Since it's a stablecoin/fiat equivalent, the token quantity ~ equals the USD value. 
      // (This works perfectly for USDT/USDC/DAI. For other crypto, you'd need the exchange rate, but keeping it simple for stablecoins)
      const fundingTokens = usdNum; 

      addTransaction({
        date: dateStr,
        type: pairedType,
        asset: fundedBy,
        tokens: formatTokenStr(fundingTokens),
        usdValue: usdNum,
      });
    }

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

      {/* Asset Selector — always shown, all assets are equal */}
      <div>
        <label className={labelClass}>Asset</label>
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

      {/* Token Quantity — always required */}
      <div>
        <label className={labelClass}>
          {isExternalFlow ? 'Amount (Tokens)' : 'Quantity of Tokens'}
        </label>
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

      {/* Funded By (Only for Buy/Sell) */}
      {isTrade && (
        <div>
          <label className={labelClass}>Funded By / Settled In</label>
          <select
            value={fundedBy}
            onChange={(e) => setFundedBy(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
            <option value="DAI">DAI</option>
            <option value="EXTERNAL">External Cash (Bank/Fiat)</option>
          </select>
          <p className="text-[10px] text-text-muted mt-1 ml-1">
            {fundedBy !== 'EXTERNAL' 
              ? `A matched transaction will be created to deduct ${fundedBy}.`
              : `No internal balance will be deducted.`
            }
          </p>
        </div>
      )}

      {/* USD Value */}
      {isZeroCost ? (
        <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-lg px-3 py-2 text-xs text-accent-blue">
          ℹ️ Cost basis is automatically $0 for {txType}.
        </div>
      ) : (
        <div>
          <label className={labelClass}>USD Value</label>
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
