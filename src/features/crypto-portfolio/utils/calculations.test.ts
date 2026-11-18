import { describe, expect, it } from 'vitest';
import type {
  CoinMappings,
  CoinTargets,
  LivePrices,
  Transaction,
} from '../../../shared/types';
import {
  computeHoldings,
  computePortfolioSummary,
  computeSmartTradeRecommendation,
} from './calculations';

describe('crypto-portfolio/utils/calculations', () => {
  const coinMappings: CoinMappings = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    USDT: 'tether',
  };
  const targets: CoinTargets = {
    BTC: { buy: 20, sell: 25 },
    ETH: { buy: 15, sell: 30 },
  };
  const stablecoins = ['USDT', 'USDC'];

  it('computes weighted average DCA, token balances, and excludes Deposit/Gas from cost basis', () => {
    const transactions: Transaction[] = [
      { date: '2026-01-01', type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 100 },
      { date: '2026-01-10', type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 200 },
      { date: '2026-01-15', type: 'Earn (Staking)', asset: 'BTC', tokens: '1', usdValue: 0 },
      { date: '2026-01-20', type: 'Deposit', asset: 'BTC', tokens: '0.5', usdValue: 150 },
      { date: '2026-01-25', type: 'Gas (Fee)', asset: 'BTC', tokens: '0.1', usdValue: 10 },
    ];
    const livePrices: LivePrices = { bitcoin: { usd: 120 } };

    const holdings = computeHoldings(
      transactions,
      coinMappings,
      livePrices,
      targets,
      stablecoins,
    );
    const btc = holdings.find((h) => h.ticker === 'BTC');
    expect(btc).toBeDefined();

    // 1 + 1 + 1 + 0.5 - 0.1 = 3.4 tokens
    expect(btc!.currentTokens).toBeCloseTo(3.4, 6);
    // totalSpent only counts Buy ($300), totalAcquired counts Buy + Earn (3 tokens) -> DCA = $100
    expect(btc!.totalSpent).toBeCloseTo(300, 6);
    expect(btc!.dca).toBeCloseTo(100, 6);
    expect(btc!.currentValue).toBeCloseTo(408, 6); // 3.4 * 120
    expect(btc!.pnl).toBeCloseTo(108, 6);
    expect(btc!.targetBuyPrice).toBeCloseTo(80, 6);
    expect(btc!.targetSellPrice).toBeCloseTo(125, 6);
    expect(btc!.tradeSignal).toBe('WATCH');
  });

  it('triggers BUY and SELL signals when live price crosses dual targets', () => {
    const transactions: Transaction[] = [
      { date: '2026-02-01', type: 'Buy', asset: 'BTC', tokens: '2', usdValue: 200 },
      { date: '2026-02-01', type: 'Buy', asset: 'ETH', tokens: '1', usdValue: 100 },
    ];
    // BTC DCA = 100 -> BUY <= 80, SELL >= 125
    // ETH DCA = 100 -> BUY <= 85, SELL >= 130
    const livePrices: LivePrices = {
      bitcoin: { usd: 75 },
      ethereum: { usd: 135 },
    };

    const holdings = computeHoldings(
      transactions,
      coinMappings,
      livePrices,
      targets,
      stablecoins,
    );
    const btc = holdings.find((h) => h.ticker === 'BTC')!;
    const eth = holdings.find((h) => h.ticker === 'ETH')!;

    expect(btc.tradeSignal).toBe('BUY');
    expect(eth.tradeSignal).toBe('SELL');
  });

  it('neutralizes stablecoin P&L to $0 and defaults stablecoin price to $1 when unpriced', () => {
    const transactions: Transaction[] = [
      { date: '2026-03-01', type: 'Deposit', asset: 'USDT', tokens: '500', usdValue: 500 },
      { date: '2026-03-05', type: 'Withdraw', asset: 'USDT', tokens: '125', usdValue: 125 },
    ];

    const holdings = computeHoldings(transactions, coinMappings, {}, targets, stablecoins);
    const usdt = holdings.find((h) => h.ticker === 'USDT')!;

    expect(usdt.isStablecoin).toBe(true);
    expect(usdt.livePrice).toBe(1);
    expect(usdt.currentTokens).toBeCloseTo(375, 6);
    expect(usdt.currentValue).toBeCloseTo(375, 6);
    expect(usdt.investedUsd).toBeCloseTo(375, 6);
    expect(usdt.pnl).toBeCloseTo(0, 6);
  });

  it('computes global portfolio summary separating volatile crypto and stablecoins', () => {
    const transactions: Transaction[] = [
      { date: '2026-03-01', type: 'Deposit', asset: 'USDT', tokens: '500', usdValue: 500 },
      { date: '2026-03-02', type: 'Withdraw', asset: 'USDT', tokens: '100', usdValue: 100 },
      { date: '2026-03-03', type: 'Buy', asset: 'BTC', tokens: '0.005', usdValue: 250 },
      { date: '2026-03-04', type: 'Sell', asset: 'BTC', tokens: '0.001', usdValue: 60 },
    ];
    const livePrices: LivePrices = { bitcoin: { usd: 70_000 } };

    const holdings = computeHoldings(
      transactions,
      coinMappings,
      livePrices,
      targets,
      stablecoins,
    );
    const summary = computePortfolioSummary(transactions, holdings);

    // BTC remaining: 0.004 * 70,000 = 280; USDT: 400 * 1 = 400
    expect(summary.totalCryptoValue).toBeCloseTo(280, 6);
    expect(summary.totalStableValue).toBeCloseTo(400, 6);
    expect(summary.totalPortfolioValue).toBeCloseTo(680, 6);
    expect(summary.netFiatInvested).toBeCloseTo(400, 6);
    expect(summary.totalPnl).toBeCloseTo(280, 6);
  });

  it('computes exact DCA break-even buy amount so newTargetBuyPrice < livePrice and enforces 3-tier dip matrix with residual reserve', () => {
    const transactions: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 100 },
    ];
    // Tier 1 (-10% vs $100 DCA, targetBuyPct = 10% -> targetBuyPrice = $90; wait: if targetBuyPct = 8%, price = 90 triggers BUY)
    const customTargets: CoinTargets = {
      BTC: { buy: 8, sell: 20 },
    };
    const [holding] = computeHoldings(
      transactions,
      coinMappings,
      { bitcoin: { usd: 90 } }, // -10% drop -> Tier 1 (8-12%)
      customTargets,
      stablecoins,
    );
    expect(holding.tradeSignal).toBe('BUY');

    const recTier1 = computeSmartTradeRecommendation({
      holding,
      eligibleCapitalUsd: 200,
      totalVolatileCryptoUsd: 90,
    });

    // Mathematical proof: after buying breakEvenBuyUsd at $90, newTargetBuyPrice must be strictly < $90
    const addedTokens = recTier1.breakEvenBuyUsd / 90;
    const verifiedNewDca = (100 + recTier1.breakEvenBuyUsd) / (1 + addedTokens);
    expect(verifiedNewDca * (1 - 8 / 100)).toBeLessThan(90);
    expect(recTier1.dipTier).toBe(1);
    // Eligible = 200 -> 25% = 50, min residual 25 allows up to 120 (60%) -> tacticalBuy = 50
    expect(recTier1.tacticalBuyUsd).toBeCloseTo(50, 2);
    expect(recTier1.residualAfterBuyUsd).toBeCloseTo(150, 2);

    // Tier 2 (-15%) & Tier 3 (-25%)
    const [holdingTier2] = computeHoldings(
      transactions,
      coinMappings,
      { bitcoin: { usd: 85 } },
      customTargets,
      stablecoins,
    );
    const recTier2 = computeSmartTradeRecommendation({
      holding: holdingTier2,
      eligibleCapitalUsd: 200,
      totalVolatileCryptoUsd: 85,
    });
    expect(recTier2.dipTier).toBe(2);
    expect(recTier2.tacticalBuyUsd).toBeCloseTo(80, 2); // 40% of 200

    const [holdingTier3] = computeHoldings(
      transactions,
      coinMappings,
      { bitcoin: { usd: 75 } },
      customTargets,
      stablecoins,
    );
    const recTier3 = computeSmartTradeRecommendation({
      holding: holdingTier3,
      eligibleCapitalUsd: 200,
      totalVolatileCryptoUsd: 75,
    });
    expect(recTier3.dipTier).toBe(3);
    expect(recTier3.tacticalBuyUsd).toBeCloseTo(120, 2); // 60% of 200, keeping $80 (>= $25)

    // Safety filter when eligible capital < $20 or violates $25 residual reserve
    const recBlocked = computeSmartTradeRecommendation({
      holding: holdingTier3,
      eligibleCapitalUsd: 30, // maxSpendable = min(5, 18) = 5 < $20 min trade
      totalVolatileCryptoUsd: 75,
    });
    expect(recBlocked.tacticalBuyUsd).toBe(0);
    expect(recBlocked.blockedReason).toBeDefined();
  });

  it('recommends 25% profit trim on SELL and flags high altcoin concentration (>35%)', () => {
    const transactions: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'ETH', tokens: '1', usdValue: 100 },
    ];
    const [eth] = computeHoldings(
      transactions,
      coinMappings,
      { ethereum: { usd: 150 } }, // +50% >= +30% target -> SELL
      targets,
      stablecoins,
    );
    expect(eth.tradeSignal).toBe('SELL');

    const rec = computeSmartTradeRecommendation({
      holding: eth,
      eligibleCapitalUsd: 500,
      totalVolatileCryptoUsd: 200, // 150 / 200 = 75% > 35%
    });
    expect(rec.suggestedSellTokens).toBeCloseTo(0.25, 6);
    expect(rec.suggestedSellUsd).toBeCloseTo(37.5, 2);
    expect(rec.concentrationWarning).toBeDefined();
  });
});
