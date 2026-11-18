import { useMemo, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useBudgetStore } from '../../budget/store/budgetStore';
import {
  calculateEligibleInvestmentCapital,
  calculateEnvelopeSummaries,
  calculateFundSummaries,
  formatUsd,
} from '../../budget/utils/calculations';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { formatTokenStr } from '../../../shared/lib/csv';
import {
  TRANSACTION_TYPES,
  ZERO_COST_TX_TYPES,
  EXTERNAL_FLOW_TX_TYPES,
  type Transaction,
  type TransactionType,
} from '../types';

const ASSET_OPTIONS = [
  'BTC', 'ETH', 'SOL', 'WBETH', 'PAXG', 'BNSOL', 'BNB', '0G', 'BEAM',
  'USDT', 'USDC', 'DAI',
];

export function TransactionForm() {
  const addTransactionsBatch = usePortfolioStore((s) => s.addTransactionsBatch);
  const {
    movements,
    recordCryptoPortfolioUsdtFlow,
    recordCryptoPortfolioUsdcFlow,
  } = useBudgetStore();
  const [txType, setTxType] = useState<TransactionType>('Buy');
  const [asset, setAsset] = useState('BTC');
  const [tokens, setTokens] = useState('');
  const [usdValue, setUsdValue] = useState('');
  const [fundedBy, setFundedBy] = useState('USDT');
  const [syncWithBudget, setSyncWithBudget] = useState(true);
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [saving, setSaving] = useState(false);

  const isExternalFlow = EXTERNAL_FLOW_TX_TYPES.includes(txType);
  const isZeroCost = ZERO_COST_TX_TYPES.includes(txType);
  const isTrade = txType === 'Buy' || txType === 'Sell';

  const usdtDirection: 'out' | 'in' | null =
    (txType === 'Buy' && fundedBy === 'USDT' && asset !== 'USDT') ||
    (txType === 'Withdraw' && asset === 'USDT') ||
    (txType === 'Sell' && asset === 'USDT' && fundedBy !== 'USDT')
      ? 'out'
      : (txType === 'Sell' && fundedBy === 'USDT' && asset !== 'USDT') ||
          (txType === 'Deposit' && asset === 'USDT') ||
          (txType === 'Earn (Staking)' && asset === 'USDT') ||
          (txType === 'Buy' && asset === 'USDT' && fundedBy !== 'USDT')
        ? 'in'
        : null;

  const usdcDirection: 'out' | 'in' | null =
    (txType === 'Buy' && fundedBy === 'USDC' && asset !== 'USDC') ||
    (txType === 'Withdraw' && asset === 'USDC') ||
    (txType === 'Sell' && asset === 'USDC' && fundedBy !== 'USDC')
      ? 'out'
      : (txType === 'Sell' && fundedBy === 'USDC' && asset !== 'USDC') ||
          (txType === 'Deposit' && asset === 'USDC') ||
          (txType === 'Earn (Staking)' && asset === 'USDC') ||
          (txType === 'Buy' && asset === 'USDC' && fundedBy !== 'USDC')
        ? 'in'
        : null;

  const affectsUsdt = usdtDirection !== null;
  const affectsUsdc = usdcDirection !== null;

  const liquidityStats = useMemo(() => {
    const envelopes = calculateEnvelopeSummaries(movements);
    const { unassignedUsdtUsd } = calculateEligibleInvestmentCapital(movements);
    const ahorroUsdtUsd = Math.max(
      0,
      Number((envelopes.find((e) => e.id === 'ahorro_inversion')?.byMethod.binance ?? 0).toFixed(2)),
    );
    const otherEnvelopesUsdtUsd = Number(
      envelopes
        .filter((e) => e.id !== 'ahorro_inversion')
        .reduce((acc, e) => acc + Math.max(0, e.byMethod.binance), 0)
        .toFixed(2),
    );
    const eligibleUsdtUsd = Number((ahorroUsdtUsd + unassignedUsdtUsd).toFixed(2));
    const fundSummaries = calculateFundSummaries(movements);
    const emergencyUsdcUsd = Math.max(
      0,
      Number(
        (
          fundSummaries.funds
            .find((f) => f.id === 'fondo_emergencia')
            ?.breakdown?.find((b) => b.label === 'USDC')?.amount ?? 0
        ).toFixed(2),
      ),
    );
    return {
      eligibleUsdtUsd,
      otherEnvelopesUsdtUsd,
      totalUsdtUsd: Number((eligibleUsdtUsd + otherEnvelopesUsdtUsd).toFixed(2)),
      emergencyUsdcUsd,
    };
  }, [movements]);

  const parsedTokens = parseFloat(tokens) || 0;
  const parsedUsd = isZeroCost ? 0 : parseFloat(usdValue) || 0;
  const spendCheckAmountUsd =
    usdtDirection === 'out' ? parsedUsd : 0;
  const exceedsEligibleUsdt =
    syncWithBudget &&
    usdtDirection === 'out' &&
    spendCheckAmountUsd > liquidityStats.eligibleUsdtUsd + 0.01;
  const blockedByOverdraft = exceedsEligibleUsdt && !allowOverdraft;

  const handleSave = () => {
    const tokensNum = parsedTokens;
    const usdNum = parsedUsd;

    // Validation: always require tokens (the asset quantity)
    if (tokensNum <= 0) return;
    // Require USD value for non-zero-cost types (Buy, Sell, Deposit, Withdraw)
    if (!isZeroCost && usdNum <= 0) return;
    if (blockedByOverdraft) return;

    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateStr = `${datePart} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const batch: Transaction[] = [
      {
        date: dateStr,
        type: txType,
        asset: asset,
        tokens: formatTokenStr(tokensNum),
        usdValue: usdNum,
      },
    ];

    // 2. Dual Funding Transaction for active Trades (Buy / Sell)
    if (isTrade && fundedBy !== 'EXTERNAL') {
      const isBuying = txType === 'Buy';
      // To fund a Buy, you Sell the funding asset. To fund a Sell, you Buy the funding asset.
      const pairedType: TransactionType = isBuying ? 'Sell' : 'Buy';
      const fundingTokens = usdNum;

      batch.push({
        date: dateStr,
        type: pairedType,
        asset: fundedBy,
        tokens: formatTokenStr(fundingTokens),
        usdValue: usdNum,
      });
    }

    addTransactionsBatch(batch, `${txType} ${asset} (${tokensNum})`);

    // 3. Sync USDT / USDC impact with Budget Store
    if (syncWithBudget) {
      const effectiveUsd = txType === 'Earn (Staking)' ? tokensNum : usdNum;
      if (effectiveUsd > 0) {
        if (usdtDirection !== null) {
          recordCryptoPortfolioUsdtFlow({
            date: datePart,
            direction: usdtDirection,
            amountUsd: effectiveUsd,
            notes: `${txType === 'Buy' ? 'Compra Crypto' : txType === 'Sell' ? 'Venta Crypto' : txType}: ${formatTokenStr(tokensNum)} ${asset}`,
            allowOverdraftFromOtherEnvelopes: allowOverdraft,
          });
        }
        if (usdcDirection !== null) {
          recordCryptoPortfolioUsdcFlow({
            date: datePart,
            direction: usdcDirection,
            amountUsd: effectiveUsd,
            notes: `Emergencia USDC (${txType}): ${formatTokenStr(tokensNum)} ${asset}`,
          });
        }
      }
    }

    setSaving(true);
    setAllowOverdraft(false);
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

      {(affectsUsdt || affectsUsdc) && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-[11px] text-text-muted cursor-pointer bg-bg-card/60 border border-border rounded-lg p-2.5">
            <input
              type="checkbox"
              checked={syncWithBudget}
              onChange={(e) => setSyncWithBudget(e.target.checked)}
              className="mt-0.5 accent-accent-blue"
            />
            <span>
              {affectsUsdt && affectsUsdc ? (
                <>
                  Sincronizar en Resumen (<strong className="text-text-primary">Ahorro USDT</strong> y{' '}
                  <strong className="text-accent-gold">Emergencia USDC</strong>)
                </>
              ) : affectsUsdc ? (
                <>
                  Sincronizar en Resumen (<strong className="text-accent-gold">Fondo Emergencia USDC</strong>:{' '}
                  {formatUsd(liquidityStats.emergencyUsdcUsd)})
                </>
              ) : (
                <>
                  Sincronizar USDT en Resumen (<strong className="text-text-primary">Ahorro e Inversión</strong>)
                </>
              )}
            </span>
          </label>

          {syncWithBudget && usdtDirection === 'out' && (
            <div className="text-[11px] bg-bg-input/60 border border-border rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between text-text-muted">
                <span>USDT en Ahorro + libre:</span>
                <strong className="text-accent-blue">
                  {formatUsd(liquidityStats.eligibleUsdtUsd)}
                </strong>
              </div>
              {liquidityStats.otherEnvelopesUsdtUsd > 0 && (
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>En otros sobres (gastos):</span>
                  <span>{formatUsd(liquidityStats.otherEnvelopesUsdtUsd)}</span>
                </div>
              )}

              {exceedsEligibleUsdt && (
                <div className="p-2 rounded-lg bg-accent-red/10 border border-accent-red/30 space-y-2">
                  <p className="text-[11px] text-accent-red flex items-start gap-1.5 leading-snug">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      Supera tu saldo de Ahorro ({formatUsd(liquidityStats.eligibleUsdtUsd)}) por{' '}
                      <strong>
                        {formatUsd(spendCheckAmountUsd - liquidityStats.eligibleUsdtUsd)}
                      </strong>
                      .
                    </span>
                  </p>
                  {liquidityStats.eligibleUsdtUsd > 0 && (
                    <button
                      type="button"
                      onClick={() => setUsdValue(liquidityStats.eligibleUsdtUsd.toFixed(2))}
                      className="w-full py-1 px-2 rounded bg-accent-blue/20 border border-accent-blue/40 text-accent-blue text-[10px] font-semibold cursor-pointer"
                    >
                      Usar máximo de Ahorro ({formatUsd(liquidityStats.eligibleUsdtUsd)})
                    </button>
                  )}
                  <label className="flex items-start gap-1.5 text-[10px] text-accent-gold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowOverdraft}
                      onChange={(e) => setAllowOverdraft(e.target.checked)}
                      className="mt-0.5 accent-accent-gold"
                    />
                    <span>Permitir tomar el faltante de otros sobres con USDT</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || blockedByOverdraft}
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
