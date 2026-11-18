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
  recommendTacticalTiersFromIncome,
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

  it('computes informational break-even and applies income-anchored fixed tiers with DCA reserve & 40% cap', () => {
    const defaultFromIncome = recommendTacticalTiersFromIncome(900);
    expect(defaultFromIncome.tier1Usd).toBe(45);
    expect(defaultFromIncome.tier2Usd).toBe(70);
    expect(defaultFromIncome.tier3Usd).toBe(100);
    expect(defaultFromIncome.biweeklyDcaReserveUsd).toBe(50);

    const transactions: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },
    ];
    const customTargets: CoinTargets = {
      BTC: { buy: 8, sell: 20 }, // targetBuyPrice = $92
    };

    const [holdingTier1] = computeHoldings(
      transactions,
      coinMappings,
      { bitcoin: { usd: 90 } }, // -10% drop -> Tier 1 (10–14.9%)
      customTargets,
      stablecoins,
    );
    expect(holdingTier1.tradeSignal).toBe('BUY');

    const recTier1 = computeSmartTradeRecommendation({
      holding: holdingTier1,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: 900,
    });

    // Informational breakEven still mathematically lowers targetBuyPrice < $90, without shaping tacticalBuyUsd
    const addedTokens = recTier1.breakEvenBuyUsd / 90;
    const verifiedNewDca = (1000 + recTier1.breakEvenBuyUsd) / (10 + addedTokens);
    expect(verifiedNewDca * (1 - 8 / 100)).toBeLessThan(90);
    expect(recTier1.isCappedByBreakEven).toBe(false);
    expect(recTier1.dipTier).toBe(1);
    expect(recTier1.tacticalBuyUsd).toBe(45);
    expect(recTier1.freeTacticalUsdtUsd).toBeCloseTo(351.88, 2);
    expect(recTier1.residualAfterBuyUsd).toBeCloseTo(356.88, 2);

    // Tier 2 (-15%) -> $70 fixed
    const [holdingTier2] = computeHoldings(
      transactions,
      coinMappings,
      { bitcoin: { usd: 85 } },
      customTargets,
      stablecoins,
    );
    const recTier2 = computeSmartTradeRecommendation({
      holding: holdingTier2,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: 850,
    });
    expect(recTier2.dipTier).toBe(2);
    expect(recTier2.tacticalBuyUsd).toBe(70);

    // Tier 3 (-22%) -> $100 fixed, or capped at 40% of free digital USDT when smaller ($120 * 0.40 = $48)
    const [holdingTier3] = computeHoldings(
      transactions,
      coinMappings,
      { bitcoin: { usd: 75 } }, // -25%
      customTargets,
      stablecoins,
    );
    const recTier3 = computeSmartTradeRecommendation({
      holding: holdingTier3,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: 750,
    });
    expect(recTier3.dipTier).toBe(3);
    expect(recTier3.tacticalBuyUsd).toBe(100);

    const recTier3Capped = computeSmartTradeRecommendation({
      holding: holdingTier3,
      eligibleCapitalUsd: 120, // free after $50 DCA = $70, 40% of $120 = $48
      totalVolatileCryptoUsd: 750,
    });
    expect(recTier3Capped.tacticalBuyUsd).toBe(48);

    // Blocked when remaining USDT after $50 biweekly DCA reserve is < $20
    const recDcaProtected = computeSmartTradeRecommendation({
      holding: holdingTier3,
      eligibleCapitalUsd: 60, // 60 - 50 = $10 < $20
      totalVolatileCryptoUsd: 750,
    });
    expect(recDcaProtected.tacticalBuyUsd).toBe(0);
    expect(recDcaProtected.blockedReason).toContain('DCA quincenal');

    // Never inflates micro-orders (< $20) to $20
    const recDiscarded = computeSmartTradeRecommendation({
      holding: holdingTier1,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: 900,
      tacticalConfig: { tier1Usd: 15 },
    });
    expect(recDiscarded.tacticalBuyUsd).toBe(0);
    expect(recDiscarded.blockedReason).toContain('< $20');
  });

  it('prioritizes deeper drop on simultaneous BUY alerts and discards sub-$20 remainder without cutting leader', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '20', usdValue: 2000 }, // DCA = $100
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '2', usdValue: 200 },   // DCA = $100
    ];
    const customTargets: CoinTargets = {
      BTC: { buy: 10, sell: 30 },  // targetBuyPrice = $90
      PAXG: { buy: 10, sell: 30 }, // targetBuyPrice = $90
    };
    const holdings = computeHoldings(
      txs,
      { BTC: 'bitcoin', PAXG: 'pax-gold' },
      { bitcoin: { usd: 89.24165 }, 'pax-gold': { usd: 89.721 } }, // BTC -10.76%, PAXG -10.28%
      customTargets,
      stablecoins,
    );
    const btc = holdings.find((h) => h.ticker === 'BTC')!;
    const paxg = holdings.find((h) => h.ticker === 'PAXG')!;

    const recBtc = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btc.currentValue + paxg.currentValue,
      allVolatileHoldings: holdings,
    });
    const recPaxg = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btc.currentValue + paxg.currentValue,
      allVolatileHoldings: holdings,
    });

    // BTC takes full Tier 1 block ($45); PAXG is discarded ($0) with priority message, never cut or inflated
    expect(recBtc.tacticalBuyUsd).toBe(45);
    expect(recBtc.priorityRank).toBe(1);
    expect(recPaxg.tacticalBuyUsd).toBe(0);
    expect(recPaxg.priorityRank).toBe(2);
    expect(recPaxg.blockedReason).toContain('Prioridad asignada a BTC');
  });

  it('enforces dual-filter cooldown after a dip buy, prevents phantom Tier 2 trigger, unlocks on >=7.5% extra drop, and resets on rebound', () => {
    const customTargets: CoinTargets = {
      BTC: { buy: 10, sell: 30 },
      PAXG: { buy: 10, sell: 30 },
    };
    const txsWithRecentDipBuy: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },   // DCA = $100
      { date: '2026-04-10', type: 'Buy', asset: 'BTC', tokens: '0.56', usdValue: 49.98 }, // executed at $89.25 (-10.75%, Nivel 1)
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '2', usdValue: 200 },     // PAXG has NO dip buy yet
    ];

    // Case A: Still in Nivel 1 (-10.75%) -> BTC locked in Cooldown; PAXG becomes priority #1 and gets $45
    const holdingsNivel1 = computeHoldings(
      txsWithRecentDipBuy,
      { BTC: 'bitcoin', PAXG: 'pax-gold' },
      { bitcoin: { usd: 88.8 }, 'pax-gold': { usd: 89.7 } },
      customTargets,
      stablecoins,
    );
    const btcN1 = holdingsNivel1.find((h) => h.ticker === 'BTC')!;
    const paxgN1 = holdingsNivel1.find((h) => h.ticker === 'PAXG')!;

    expect(btcN1.highestConsumedDipTier).toBe(1);
    expect(btcN1.lastDipBuyPrice).toBeCloseTo(89.25, 2);

    const recBtcN1 = computeSmartTradeRecommendation({
      holding: btcN1,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btcN1.currentValue + paxgN1.currentValue,
      allVolatileHoldings: holdingsNivel1,
    });
    const recPaxgN1 = computeSmartTradeRecommendation({
      holding: paxgN1,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btcN1.currentValue + paxgN1.currentValue,
      allVolatileHoldings: holdingsNivel1,
    });

    expect(recBtcN1.isCooldownLocked).toBe(true);
    expect(recBtcN1.tacticalBuyUsd).toBe(0);
    expect(recBtcN1.blockedReason).toContain('Cooldown Nivel 1 cumplido');
    expect(recPaxgN1.tacticalBuyUsd).toBe(45); // Cooldown-locked BTC does not block unlocked PAXG

    // Case B: Enters Nivel 2 vs DCA (-15.5% @ $84), but extra drop from $89.25 is only 5.88% (< 7.5%) -> still locked
    const [btcPhantomN2] = computeHoldings(
      txsWithRecentDipBuy.slice(0, 2),
      coinMappings,
      { bitcoin: { usd: 84 } },
      customTargets,
      stablecoins,
    );
    const recPhantom = computeSmartTradeRecommendation({
      holding: btcPhantomN2,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btcPhantomN2.currentValue,
    });
    expect(recPhantom.dipTier).toBe(2);
    expect(recPhantom.isCooldownLocked).toBe(true);
    expect(recPhantom.tacticalBuyUsd).toBe(0);
    expect(recPhantom.blockedReason).toContain('falta caída adicional');

    // Case C: Enters Nivel 2 AND drops >= 7.5% below $89.25 ($82.00 is -8.12%) -> Unlocks Tier 2 ($70)
    const [btcUnlockedN2] = computeHoldings(
      txsWithRecentDipBuy.slice(0, 2),
      coinMappings,
      { bitcoin: { usd: 82 } },
      customTargets,
      stablecoins,
    );
    const recUnlocked = computeSmartTradeRecommendation({
      holding: btcUnlockedN2,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btcUnlockedN2.currentValue,
    });
    expect(recUnlocked.dipTier).toBe(2);
    expect(recUnlocked.isCooldownLocked).toBe(false);
    expect(recUnlocked.tacticalBuyUsd).toBe(70);

    // Case D: Price rebounds above Target Buy ($95 > $89.5) -> resets cycle automatically
    const [btcRebound] = computeHoldings(
      txsWithRecentDipBuy.slice(0, 2),
      coinMappings,
      { bitcoin: { usd: 95 } },
      customTargets,
      stablecoins,
    );
    expect(btcRebound.tradeSignal).toBe('WATCH');
    expect(btcRebound.highestConsumedDipTier).toBe(0);
    expect(btcRebound.lastDipBuyPrice).toBeUndefined();
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
