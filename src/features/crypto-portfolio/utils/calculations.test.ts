import { describe, expect, it } from 'vitest';
import type {
  CoinMappings,
  CoinTargets,
  LivePrices,
  Transaction,
} from '../../../shared/types';
import {
  DEFAULT_TACTICAL_DIP_CONFIG,
  buildAiPortfolioReportMarkdown,
  buildPresetTacticalConfig,
  computeHoldings,
  computePortfolioExposure,
  computePortfolioSummary,
  computeSmartTradeRecommendation,
  evaluateTacticalConfigRisk,
  recommendTacticalTiersFromIncome,
  simulateTacticalConfigImpact,
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
      eligibleCapitalUsd: 120, // net after $50 DCA = $70 -> daily cap 40% of $70 = $28
      totalVolatileCryptoUsd: 750,
    });
    expect(recTier3Capped.dailyCapUsd).toBe(28);
    expect(recTier3Capped.tacticalBuyUsd).toBe(28);

    // Blocked when daily cap (40% of net) falls below $20 (never inflated)
    const recDailyCapTooSmall = computeSmartTradeRecommendation({
      holding: holdingTier3,
      eligibleCapitalUsd: 95, // net = $45 -> 40% = $18 < $20
      totalVolatileCryptoUsd: 750,
    });
    expect(recDailyCapTooSmall.dailyCapUsd).toBe(18);
    expect(recDailyCapTooSmall.tacticalBuyUsd).toBe(0);
    expect(recDailyCapTooSmall.blockedReason).toContain('Cupo diario');

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

  it('splits multi-asset daily cap >= $40 across peers and concentrates 100% on #1 when daily cap is $20-$39.99', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '20', usdValue: 2000 }, // DCA = $100
      { date: '2026-04-01', type: 'Buy', asset: 'ETH', tokens: '2', usdValue: 200 },   // DCA = $100
    ];
    const customTargets: CoinTargets = {
      BTC: { buy: 10, sell: 30 }, // targetBuyPrice = $90
      ETH: { buy: 10, sell: 30 }, // targetBuyPrice = $90
    };
    const holdings = computeHoldings(
      txs,
      { BTC: 'bitcoin', ETH: 'ethereum' },
      { bitcoin: { usd: 89.24165 }, ethereum: { usd: 89.721 } }, // BTC -10.76%, ETH -10.28% (both Crypto Tier 1)
      customTargets,
      stablecoins,
    );
    const btc = holdings.find((h) => h.ticker === 'BTC')!;
    const eth = holdings.find((h) => h.ticker === 'ETH')!;
    const matchedTargets = { 'GROUP:BTC': 90, 'GROUP:ETH': 10 }; // ~90.9% BTC (drift +0.9% <= +5%)

    // With $401.88 eligible ($140.75 daily cap >= $40), both BTC (#1) and ETH (#2) receive full Tier 1 blocks ($45 each)
    const recBtc = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btc.currentValue + eth.currentValue,
      allVolatileHoldings: holdings,
      targetAllocations: matchedTargets,
    });
    const recEth = computeSmartTradeRecommendation({
      holding: eth,
      eligibleCapitalUsd: 401.88,
      totalVolatileCryptoUsd: btc.currentValue + eth.currentValue,
      allVolatileHoldings: holdings,
      targetAllocations: matchedTargets,
    });

    expect(recBtc.tacticalBuyUsd).toBe(45);
    expect(recBtc.priorityRank).toBe(1);
    expect(recBtc.sharedAmongBuyCount).toBe(2);
    expect(recEth.tacticalBuyUsd).toBe(45);
    expect(recEth.priorityRank).toBe(2);

    // With $137.50 eligible ($87.50 net -> $35 daily cap < $40), 100% goes to #1 (BTC) and $0 to #2 (ETH)
    const recBtcLowCap = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 137.5,
      totalVolatileCryptoUsd: btc.currentValue + eth.currentValue,
      allVolatileHoldings: holdings,
      targetAllocations: matchedTargets,
    });
    const recEthLowCap = computeSmartTradeRecommendation({
      holding: eth,
      eligibleCapitalUsd: 137.5,
      totalVolatileCryptoUsd: btc.currentValue + eth.currentValue,
      allVolatileHoldings: holdings,
      targetAllocations: matchedTargets,
    });
    expect(recBtcLowCap.dailyCapUsd).toBe(35);
    expect(recBtcLowCap.tacticalBuyUsd).toBe(35);
    expect(recEthLowCap.tacticalBuyUsd).toBe(0);
    expect(recEthLowCap.blockedReason).toContain('Prioridad asignada a BTC');
    expect(recEthLowCap.blockedReason).toContain('< $40');
  });

  it('halves tactical block and deprioritizes groups overweight by >+5%, favoring underweight groups', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },   // @ $89.25 = $892.50 (59.5%)
      { date: '2026-04-01', type: 'Buy', asset: 'ETH', tokens: '5', usdValue: 500 },     // @ $108 = $540 (36%, WATCH)
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '0.75', usdValue: 75 },  // @ $89.72 = $67.29 (4.5%)
    ];
    const customTargets: CoinTargets = {
      BTC: { buy: 10, sell: 30 },
      ETH: { buy: 10, sell: 30 },
      PAXG: { buy: 5, sell: 15 },
    };
    const holdings = computeHoldings(
      txs,
      { BTC: 'bitcoin', ETH: 'ethereum', PAXG: 'pax-gold' },
      { bitcoin: { usd: 89.25 }, ethereum: { usd: 108 }, 'pax-gold': { usd: 89.72 } },
      customTargets,
      stablecoins,
    );
    const btc = holdings.find((h) => h.ticker === 'BTC')!;
    const paxg = holdings.find((h) => h.ticker === 'PAXG')!;
    const totalUsd = holdings.reduce((acc, h) => acc + h.currentValue, 0);
    const groupTargets = { 'GROUP:BTC': 50, 'GROUP:ETH': 40, 'GROUP:GOLD': 10 };

    // When only BTC triggers BUY while overweight (+9.5% > +5%), block is halved ($45 -> $22.50)
    const soloOverweightBtc = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings.filter((h) => h.ticker !== 'PAXG'),
      targetAllocations: groupTargets,
    });
    expect(soloOverweightBtc.isGroupOverweightTrimmed).toBe(true);
    expect(soloOverweightBtc.tacticalBuyUsd).toBe(22.5);

    // With $400 eligible ($140 daily cap >= $40): PAXG (#1, $70) + halved BTC (#2, $22.50)
    const recPaxg = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: groupTargets,
    });
    const recBtc = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: groupTargets,
    });
    expect(recPaxg.priorityRank).toBe(1);
    expect(recPaxg.dipTier).toBe(2);
    expect(recPaxg.tacticalBuyUsd).toBe(70);
    expect(recBtc.priorityRank).toBe(2);
    expect(recBtc.isGroupOverweightTrimmed).toBe(true);
    expect(recBtc.tacticalBuyUsd).toBe(22.5);

    // With $137.50 eligible ($35 daily cap < $40): PAXG takes all $35, overweight BTC gets $0
    const recPaxgSmall = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 137.5,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: groupTargets,
    });
    const recBtcSmall = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 137.5,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: groupTargets,
    });
    expect(recPaxgSmall.tacticalBuyUsd).toBe(35);
    expect(recBtcSmall.tacticalBuyUsd).toBe(0);
    expect(recBtcSmall.blockedReason).toContain('Prioridad asignada a PAXG');
  });

  it('enforces dual-filter cooldown after a dip buy, prevents phantom Tier 2 trigger, unlocks on >=7.5% extra drop, and resets on rebound', () => {
    const customTargets: CoinTargets = {
      BTC: { buy: 10, sell: 30 },
      PAXG: { buy: 5, sell: 15 },
    };
    const txsWithRecentDipBuy: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },   // DCA = $100
      { date: '2026-04-10', type: 'Buy', asset: 'BTC', tokens: '0.56', usdValue: 49.98 }, // executed at $89.25 (-10.75%, Nivel 1)
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '1', usdValue: 100 },     // PAXG -10.3% -> Gold Tier 2 ($70)
    ];

    // Case A: Still in Nivel 1 (-10.75%) -> BTC locked in Cooldown; PAXG becomes priority #1 and gets Gold Tier 2 ($70)
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
    expect(recPaxgN1.dipTier).toBe(2);
    expect(recPaxgN1.tacticalBuyUsd).toBe(70); // Cooldown-locked BTC does not block unlocked PAXG

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

  it('computes portfolio exposure by strategic group and by coin with optional USDT liquidity and rebalance deltas', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 500 },
      { date: '2026-04-01', type: 'Buy', asset: 'WBETH', tokens: '1', usdValue: 300 },
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '1', usdValue: 150 },
      { date: '2026-04-01', type: 'Buy', asset: 'BNB', tokens: '1', usdValue: 50 },
    ];
    const mappings: CoinMappings = {
      BTC: 'bitcoin',
      WBETH: 'wrapped-beacon-eth',
      PAXG: 'pax-gold',
      BNB: 'binancecoin',
    };
    const prices: LivePrices = {
      bitcoin: { usd: 600 },             // 60% of $1000
      'wrapped-beacon-eth': { usd: 200 }, // 20% of $1000
      'pax-gold': { usd: 150 },           // 15% of $1000
      binancecoin: { usd: 50 },           // 5% of $1000
    };
    const holdings = computeHoldings(txs, mappings, prices, targets, stablecoins);

    const groupResult = computePortfolioExposure({
      holdings,
      mode: 'group',
      includeDigitalUsdt: false,
      targetAllocations: {
        'GROUP:BTC': 50,
        'GROUP:ETH': 20,
        'GROUP:SOL': 10,
        'GROUP:GOLD': 10,
        'GROUP:ALTS': 10,
      },
    });

    expect(groupResult.totalBaseUsd).toBeCloseTo(1000, 2);
    const btcGroup = groupResult.items.find((i) => i.id === 'GROUP:BTC')!;
    const ethGroup = groupResult.items.find((i) => i.id === 'GROUP:ETH')!;
    const solGroup = groupResult.items.find((i) => i.id === 'GROUP:SOL')!;
    const altsGroup = groupResult.items.find((i) => i.id === 'GROUP:ALTS')!;

    expect(btcGroup.currentPct).toBeCloseTo(60, 2);
    expect(btcGroup.rebalanceStatus).toBe('OVERWEIGHT');
    expect(btcGroup.rebalanceDeltaUsd).toBeCloseTo(-100, 2);

    expect(ethGroup.tickers).toEqual(['WBETH']);
    expect(ethGroup.rebalanceStatus).toBe('BALANCED');

    expect(solGroup.valueUsd).toBe(0);
    expect(solGroup.rebalanceStatus).toBe('UNDERWEIGHT');
    expect(solGroup.rebalanceDeltaUsd).toBeCloseTo(100, 2);

    expect(altsGroup.currentPct).toBeCloseTo(5, 2);
    expect(altsGroup.rebalanceDeltaUsd).toBeCloseTo(50, 2);

    const coinWithUsdt = computePortfolioExposure({
      holdings,
      mode: 'coin',
      includeDigitalUsdt: true,
      digitalUsdtUsd: 250,
      targetAllocations: { BTC: 50, USDT_LIQUID: 20 },
    });
    expect(coinWithUsdt.totalBaseUsd).toBeCloseTo(1250, 2);
    const usdtSlice = coinWithUsdt.items.find((i) => i.id === 'USDT_LIQUID')!;
    expect(usdtSlice.isLiquidity).toBe(true);
    expect(usdtSlice.currentPct).toBeCloseTo(20, 2);
    expect(usdtSlice.rebalanceStatus).toBe('BALANCED');
  });

  it('builds structured Markdown portfolio and liquidity report for AI analysis', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 1000 },
      { date: '2026-04-01', type: 'Buy', asset: 'BEAM', tokens: '100', usdValue: 50 },
      { date: '2026-04-10', type: 'Sell', asset: 'BEAM', tokens: '100', usdValue: 80 },
    ];
    const holdings = computeHoldings(
      txs,
      { BTC: 'bitcoin', BEAM: 'beam-2' },
      { bitcoin: { usd: 880 }, 'beam-2': { usd: 0.7 } },
      { BTC: { buy: 10, sell: 25 } },
      stablecoins,
    );
    const active = holdings.filter((h) => h.ticker === 'BTC');
    const archived = holdings.filter((h) => h.ticker === 'BEAM');

    const groupExposure = computePortfolioExposure({
      holdings: active,
      mode: 'group',
      targetAllocations: { 'GROUP:BTC': 60 },
    });
    const coinExposure = computePortfolioExposure({
      holdings: active,
      mode: 'coin',
      targetAllocations: { BTC: 60 },
    });
    const recBtc = computeSmartTradeRecommendation({
      holding: active[0],
      eligibleCapitalUsd: 350,
      totalVolatileCryptoUsd: active[0].currentValue,
      allVolatileHoldings: active,
    });

    const report = buildAiPortfolioReportMarkdown({
      generatedAt: '2026-11-19',
      holdings: active,
      archivedHoldings: archived,
      eligibleCapital: {
        ahorroEnvelopeUsd: 200,
        unassignedUsdtUsd: 150,
        totalEligibleUsd: 350,
        excludedPhysicalCashUsd: 100,
      },
      tacticalConfig: {
        monthlyIncomeUsd: 900,
        tier1Usd: 45,
        tier2Usd: 70,
        tier3Usd: 100,
        tier3MaxFreeUsdtPct: 40,
        biweeklyDcaReserveUsd: 50,
        cooldownAdditionalDropPct: 7.5,
      },
      recommendations: { BTC: recBtc },
      groupExposure,
      coinExposure,
    });

    expect(report).toContain('# Resumen de Portafolio Crypto y Liquidez para Análisis (2026-11-19)');
    expect(report).toContain('$350.00');
    expect(report).toContain('Liquidez táctica neta disponible hoy:** $300.00');
    expect(report).toContain('Efectivo físico excluido: $100.00');
    expect(report).toContain('| BTC |');
    expect(report).toContain('COMPRAR $45.00');
    expect(report).toContain('BEAM:');
    expect(report).toContain('## Prompt para la IA');
  });

  it('unlocks Tier 3 Cooldown via capitulation escape hatch when price drops >=15% below last Tier 3 buy', () => {
    const txsTier3: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'ETH', tokens: '10', usdValue: 1000 }, // DCA = $100
      { date: '2026-04-15', type: 'Buy', asset: 'ETH', tokens: '1', usdValue: 78 },     // executed at $78 (-22%, Tier 3 consumed)
    ];
    const ethTargets: CoinTargets = { ETH: { buy: 20, sell: 40 } };

    // -10.26% below $78 ($70): stays locked, exposes capitulation unlock threshold $66.30 (-15%)
    const [lockedEth] = computeHoldings(
      txsTier3,
      coinMappings,
      { ethereum: { usd: 70 } },
      ethTargets,
      stablecoins,
    );
    expect(lockedEth.highestConsumedDipTier).toBe(3);
    const recLocked = computeSmartTradeRecommendation({
      holding: lockedEth,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: lockedEth.currentValue,
    });
    expect(recLocked.isCooldownLocked).toBe(true);
    expect(recLocked.tacticalBuyUsd).toBe(0);
    expect(recLocked.nextUnlockPrice).toBeCloseTo(66.3, 2);
    expect(recLocked.blockedReason).toContain('capitulación');

    // -16.67% below $78 ($65 <= $66.30): capitulation escape hatch unlocks Tier 3 ($100)
    const [unlockedEth] = computeHoldings(
      txsTier3,
      coinMappings,
      { ethereum: { usd: 65 } },
      ethTargets,
      stablecoins,
    );
    const recEscaped = computeSmartTradeRecommendation({
      holding: unlockedEth,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: unlockedEth.currentValue,
    });
    expect(recEscaped.isCooldownLocked).toBe(false);
    expect(recEscaped.isTier3EscapeUnlocked).toBe(true);
    expect(recEscaped.tacticalBuyUsd).toBe(100);
  });

  it('applies Defensive Gold volatility profile (5/8/12% tiers, -3.5% cooldown, -8% N3 escape) to PAXG', () => {
    const paxgMap: CoinMappings = { PAXG: 'pax-gold' };
    const paxgTarget: CoinTargets = { PAXG: { buy: 5, sell: 15 } };
    const baseTxs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '10', usdValue: 1000 }, // DCA = $100
    ];

    const [t1] = computeHoldings(baseTxs, paxgMap, { 'pax-gold': { usd: 94.5 } }, paxgTarget, stablecoins);
    const recT1 = computeSmartTradeRecommendation({
      holding: t1,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: t1.currentValue,
    });
    expect(recT1.volatilityProfile).toBe('defensive_gold');
    expect(recT1.dipTier).toBe(1);
    expect(recT1.tacticalBuyUsd).toBe(45);

    const [t2] = computeHoldings(baseTxs, paxgMap, { 'pax-gold': { usd: 88.9 } }, paxgTarget, stablecoins);
    const recT2 = computeSmartTradeRecommendation({
      holding: t2,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: t2.currentValue,
    });
    expect(recT2.dipTier).toBe(2);
    expect(recT2.tacticalBuyUsd).toBe(70);

    const [t3] = computeHoldings(baseTxs, paxgMap, { 'pax-gold': { usd: 87.5 } }, paxgTarget, stablecoins);
    const recT3 = computeSmartTradeRecommendation({
      holding: t3,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: t3.currentValue,
    });
    expect(recT3.dipTier).toBe(3);
    expect(recT3.tacticalBuyUsd).toBe(100);

    // Cooldown after Tier 1 buy at $94.50 (-5.5%): at $91.50 (-3.17% extra < 3.5%) stays locked; at $88.90 (-5.93% extra >= 3.5%) unlocks Tier 2 ($70)
    const afterN1Txs: Transaction[] = [
      ...baseTxs,
      { date: '2026-04-10', type: 'Buy', asset: 'PAXG', tokens: '1', usdValue: 94.5 },
    ];
    const [paxgLocked] = computeHoldings(afterN1Txs, paxgMap, { 'pax-gold': { usd: 91.5 } }, paxgTarget, stablecoins);
    const recLocked = computeSmartTradeRecommendation({
      holding: paxgLocked,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: paxgLocked.currentValue,
    });
    expect(paxgLocked.highestConsumedDipTier).toBe(1);
    expect(recLocked.dipTier).toBe(2);
    expect(recLocked.isCooldownLocked).toBe(true);

    const [paxgUnlocked] = computeHoldings(afterN1Txs, paxgMap, { 'pax-gold': { usd: 88.9 } }, paxgTarget, stablecoins);
    const recUnlocked = computeSmartTradeRecommendation({
      holding: paxgUnlocked,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: paxgUnlocked.currentValue,
    });
    expect(recUnlocked.dipTier).toBe(2);
    expect(recUnlocked.isCooldownLocked).toBe(false);
    expect(recUnlocked.tacticalBuyUsd).toBe(70);

    // Tier 3 escape hatch for Gold (-8% below $87.50 = $80.50)
    const afterN3Txs: Transaction[] = [
      ...baseTxs,
      { date: '2026-04-12', type: 'Buy', asset: 'PAXG', tokens: '1', usdValue: 87.5 },
    ];
    const [paxgN3Locked] = computeHoldings(afterN3Txs, paxgMap, { 'pax-gold': { usd: 82.25 } }, paxgTarget, stablecoins);
    const recN3Locked = computeSmartTradeRecommendation({
      holding: paxgN3Locked,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: paxgN3Locked.currentValue,
    });
    expect(recN3Locked.isCooldownLocked).toBe(true);
    expect(recN3Locked.nextUnlockPrice).toBeCloseTo(80.5, 2);

    const [paxgN3Escape] = computeHoldings(afterN3Txs, paxgMap, { 'pax-gold': { usd: 80.06 } }, paxgTarget, stablecoins);
    const recN3Escape = computeSmartTradeRecommendation({
      holding: paxgN3Escape,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: paxgN3Escape.currentValue,
    });
    expect(recN3Escape.isCooldownLocked).toBe(false);
    expect(recN3Escape.isTier3EscapeUnlocked).toBe(true);
    expect(recN3Escape.tacticalBuyUsd).toBe(100);
  });

  it('prioritizes Gold Tier 2 (-11.1%) over Crypto Tier 1 (-11.5%) when neither group is overweight', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 }, // @ 88.50 -> $885
      { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '2', usdValue: 200 },  // @ 88.90 -> $177.80
    ];
    const holdings = computeHoldings(
      txs,
      { BTC: 'bitcoin', PAXG: 'pax-gold' },
      { bitcoin: { usd: 88.5 }, 'pax-gold': { usd: 88.9 } },
      { BTC: { buy: 10, sell: 30 }, PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );
    const btc = holdings.find((h) => h.ticker === 'BTC')!;
    const paxg = holdings.find((h) => h.ticker === 'PAXG')!;
    const totalUsd = btc.currentValue + paxg.currentValue;
    const balancedTargets = { 'GROUP:BTC': 85, 'GROUP:GOLD': 15 };

    const recPaxg = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: balancedTargets,
    });
    const recBtc = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: balancedTargets,
    });

    expect(recPaxg.dipTier).toBe(2);
    expect(recBtc.dipTier).toBe(1);
    expect(recPaxg.priorityRank).toBe(1);
    expect(recPaxg.tacticalBuyUsd).toBe(70);
    expect(recBtc.priorityRank).toBe(2);
    expect(recBtc.tacticalBuyUsd).toBe(45);

    // With $300 eligible ($250 net -> $100 daily cap): 60% ($60) to PAXG (#1), 40% ($40) to BTC (#2)
    const recPaxgSplit = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: balancedTargets,
    });
    const recBtcSplit = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: balancedTargets,
    });
    expect(recPaxgSplit.tacticalBuyUsd).toBe(60);
    expect(recBtcSplit.tacticalBuyUsd).toBe(40);
  });

  it('tracks BNB Gas (Fee) drag explaining -13.3% price variation vs -14.1% net P&L and discloses both in AI report', () => {
    const bnbTxs: Transaction[] = [
      { date: '2026-03-02 23:24:23', type: 'Buy', asset: 'BNB', tokens: '0.00204588', usdValue: 1.85 },
      { date: '2026-03-02 23:24:36', type: 'Buy', asset: 'BNB', tokens: '0.01', usdValue: 9.4962 },
      { date: '2026-03-02 23:24:44', type: 'Buy', asset: 'BNB', tokens: '0.017', usdValue: 15.53477 },
      { date: '2026-03-02 23:24:53', type: 'Buy', asset: 'BNB', tokens: '0.024', usdValue: 20.65824 },
      { date: '2026-03-02 23:25:12', type: 'Gas (Fee)', asset: 'BNB', tokens: '0.00096605', usdValue: 0 },
      { date: '2026-03-02 23:25:23', type: 'Earn (Staking)', asset: 'BNB', tokens: '0.00000029', usdValue: 0 },
      { date: '2026-03-02 23:25:36', type: 'Buy', asset: 'BNB', tokens: '0.012', usdValue: 7.94652 },
      { date: '2026-03-02 23:25:44', type: 'Buy', asset: 'BNB', tokens: '0.121', usdValue: 75.72301 },
      { date: '2026-06-05 10:59:01', type: 'Buy', asset: 'BNB', tokens: '0.051', usdValue: 29.69934 },
      { date: '2026-08-21 06:32:16', type: 'Buy', asset: 'BNB', tokens: '0.035', usdValue: 19.705 },
      { date: '2026-08-21 06:32:51', type: 'Gas (Fee)', asset: 'BNB', tokens: '0.00165142', usdValue: 0 },
    ];
    const [bnb] = computeHoldings(
      bnbTxs,
      { BNB: 'binancecoin' },
      { binancecoin: { usd: 575.89 } },
      { BNB: { buy: 15, sell: 30 } },
      stablecoins,
    );

    expect(bnb.currentTokens).toBeCloseTo(0.2694287, 7);
    expect(bnb.gasTokens).toBeCloseTo(0.00261747, 8);
    expect(bnb.dca).toBeCloseTo(663.91, 2);
    expect(bnb.pnl).toBeCloseTo(-25.45, 2);
    expect(bnb.pnlPercent).toBeCloseTo(-0.1409, 3);
    const purePricePct = ((bnb.livePrice - bnb.dca) / bnb.dca) * 100;
    expect(purePricePct).toBeCloseTo(-13.3, 1);

    const groupExposure = computePortfolioExposure({
      holdings: [bnb],
      mode: 'group',
      targetAllocations: { 'GROUP:ALTS': 5 },
    });
    const coinExposure = computePortfolioExposure({
      holdings: [bnb],
      mode: 'coin',
      targetAllocations: { BNB: 5 },
    });
    const recBnb = computeSmartTradeRecommendation({
      holding: bnb,
      eligibleCapitalUsd: 350,
      totalVolatileCryptoUsd: bnb.currentValue,
      allVolatileHoldings: [bnb],
    });
    const markdown = buildAiPortfolioReportMarkdown({
      generatedAt: '2026-11-19',
      holdings: [bnb],
      eligibleCapital: {
        ahorroEnvelopeUsd: 200,
        unassignedUsdtUsd: 150,
        totalEligibleUsd: 350,
        excludedPhysicalCashUsd: 50,
      },
      tacticalConfig: {
        monthlyIncomeUsd: 900,
        tier1Usd: 45,
        tier2Usd: 70,
        tier3Usd: 100,
        tier3MaxFreeUsdtPct: 40,
        biweeklyDcaReserveUsd: 50,
        cooldownAdditionalDropPct: 7.5,
        goldCooldownAdditionalDropPct: 3.5,
        goldTier3EscapeDropPct: 8,
      },
      recommendations: { BNB: recBnb },
      groupExposure,
      coinExposure,
    });

    expect(markdown).toContain('Perfil Defensivo Oro (PAXG, XAUT)');
    expect(markdown).toContain('Nota de auditoría (BNB)');
    expect(markdown).toContain('-13.3%');
    expect(markdown).toContain('-14.1%');
    expect(markdown).toContain('0.0026 BNB');
  });

  it('enforces 48h temporal cooldown with Core (-15%) / Gold (-8%) Flash Crash Override and strict lock on Altcoins', () => {
    const buyTime = '2026-11-20 00:00:00';
    const plus17HoursMs = new Date(2026, 10, 20, 17, 0, 0).getTime(); // faltan 31h
    const plus20HoursMs = new Date(2026, 10, 20, 20, 0, 0).getTime(); // faltan 28h
    const plus10HoursMs = new Date(2026, 10, 20, 10, 0, 0).getTime(); // faltan 38h
    const plus49HoursMs = new Date(2026, 10, 22, 1, 0, 0).getTime();  // > 48h

    // 1. BTC (Crypto Core): -9% extra below $90 ($81.90) meets +7.5% price spacing, but stays locked during 48h (< -15% flash crash)
    const btcTxs: Transaction[] = [
      { date: '2026-10-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },
      { date: buyTime, type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 90 }, // Tier 1 (-10%) at $90
    ];
    const [btcRoutineDrop] = computeHoldings(
      btcTxs,
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 81.9 } },
      { BTC: { buy: 10, sell: 30 } },
      stablecoins,
    );
    const recBtcLocked48h = computeSmartTradeRecommendation({
      holding: btcRoutineDrop,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcRoutineDrop.currentValue,
      nowMs: plus17HoursMs,
    });
    expect(recBtcLocked48h.isCooldownLocked).toBe(true);
    expect(recBtcLocked48h.isTimeCooldownLocked).toBe(true);
    expect(recBtcLocked48h.timeCooldownRemainingHours).toBe(31);
    expect(recBtcLocked48h.flashCrashUnlockPrice).toBeCloseTo(76.5, 2);
    expect(recBtcLocked48h.blockedReason).toContain('Cooldown 48h (faltan 31h)');
    expect(recBtcLocked48h.tacticalBuyUsd).toBe(0);

    // BTC breaks 48h lock via Flash Crash Override when dropping -15.5% below $90 ($76.05 <= $76.50)
    const [btcFlashCrash] = computeHoldings(
      btcTxs,
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 76.05 } },
      { BTC: { buy: 10, sell: 30 } },
      stablecoins,
    );
    const recBtcFlashUnlock = computeSmartTradeRecommendation({
      holding: btcFlashCrash,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcFlashCrash.currentValue,
      nowMs: plus17HoursMs,
    });
    expect(recBtcFlashUnlock.isCooldownLocked).toBe(false);
    expect(recBtcFlashUnlock.isFlashCrashOverrideUnlocked).toBe(true);
    expect(recBtcFlashUnlock.tacticalBuyUsd).toBe(100);

    // 2. PAXG (Defensive Gold): -5% extra below $94.50 ($89.78) meets +3.5% gold spacing, stays locked at 20h (< -8%); unlocks at -8.5% ($86.47)
    const paxgTxs: Transaction[] = [
      { date: '2026-10-01 10:00:00', type: 'Buy', asset: 'PAXG', tokens: '10', usdValue: 1000 },
      { date: buyTime, type: 'Buy', asset: 'PAXG', tokens: '1', usdValue: 94.5 }, // Tier 1 (-5.5%) at $94.50
    ];
    const [paxgRoutineDrop] = computeHoldings(
      paxgTxs,
      { PAXG: 'pax-gold' },
      { 'pax-gold': { usd: 89.78 } },
      { PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );
    const recPaxgLocked = computeSmartTradeRecommendation({
      holding: paxgRoutineDrop,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: paxgRoutineDrop.currentValue,
      nowMs: plus20HoursMs,
    });
    expect(recPaxgLocked.isTimeCooldownLocked).toBe(true);
    expect(recPaxgLocked.timeCooldownRemainingHours).toBe(28);
    expect(recPaxgLocked.flashCrashUnlockPrice).toBeCloseTo(86.94, 2);
    expect(recPaxgLocked.tacticalBuyUsd).toBe(0);

    const [paxgFlashCrash] = computeHoldings(
      paxgTxs,
      { PAXG: 'pax-gold' },
      { 'pax-gold': { usd: 86.47 } },
      { PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );
    const recPaxgFlashUnlock = computeSmartTradeRecommendation({
      holding: paxgFlashCrash,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: paxgFlashCrash.currentValue,
      nowMs: plus20HoursMs,
    });
    expect(recPaxgFlashUnlock.isCooldownLocked).toBe(false);
    expect(recPaxgFlashUnlock.isFlashCrashOverrideUnlocked).toBe(true);
    expect(recPaxgFlashUnlock.tacticalBuyUsd).toBe(100);

    // 3. BNB (Altcoins & Otros): strict 48h lock with NO flash crash override even at -25% crash inside 10h; unlocks after >= 48h
    const bnbTxs: Transaction[] = [
      { date: '2026-10-01 10:00:00', type: 'Buy', asset: 'BNB', tokens: '10', usdValue: 1000 },
      { date: buyTime, type: 'Buy', asset: 'BNB', tokens: '1', usdValue: 88 }, // Tier 1 (-12%)
    ];
    const [bnbCrash] = computeHoldings(
      bnbTxs,
      { BNB: 'binancecoin' },
      { binancecoin: { usd: 66 } }, // -25% below $88
      { BNB: { buy: 10, sell: 30 } },
      stablecoins,
    );
    const recBnbStrictLock = computeSmartTradeRecommendation({
      holding: bnbCrash,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: bnbCrash.currentValue,
      nowMs: plus10HoursMs,
    });
    expect(recBnbStrictLock.isCooldownLocked).toBe(true);
    expect(recBnbStrictLock.isTimeCooldownLocked).toBe(true);
    expect(recBnbStrictLock.timeCooldownRemainingHours).toBe(38);
    expect(recBnbStrictLock.flashCrashUnlockPrice).toBeUndefined();
    expect(recBnbStrictLock.blockedReason).toContain('Cooldown 48h estricto');
    expect(recBnbStrictLock.tacticalBuyUsd).toBe(0);

    const recBnbAfter48h = computeSmartTradeRecommendation({
      holding: bnbCrash,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: bnbCrash.currentValue,
      nowMs: plus49HoursMs,
    });
    expect(recBnbAfter48h.isCooldownLocked).toBe(false);
    expect(recBnbAfter48h.tacticalBuyUsd).toBe(100);
  });

  it('caps first asset at 60% across multi-asset daily budgets >= $40 and reallocates unused remainder', () => {
    const txs: Transaction[] = [
      { date: '2026-04-01', type: 'Buy', asset: 'ETH', tokens: '10', usdValue: 1000 },
      { date: '2026-04-01', type: 'Buy', asset: 'SOL', tokens: '10', usdValue: 1000 },
    ];
    const mappings: CoinMappings = { ETH: 'ethereum', SOL: 'solana' };
    const coinTargets: CoinTargets = { ETH: { buy: 10, sell: 30 }, SOL: { buy: 10, sell: 30 } };
    const equalTargets = { 'GROUP:ETH': 50, 'GROUP:SOL': 50 };

    // Scenario A: Daily cap = $100 ($300 eligible, $250 net -> $100), both Tier 2 ($70 block each) -> 60% / 40% = $60 / $40
    const tier2Holdings = computeHoldings(
      txs,
      mappings,
      { ethereum: { usd: 82 }, solana: { usd: 84 } }, // ETH -18% (#1), SOL -16% (#2)
      coinTargets,
      stablecoins,
    );
    const totalT2 = tier2Holdings.reduce((acc, h) => acc + h.currentValue, 0);
    const ethA = computeSmartTradeRecommendation({
      holding: tier2Holdings[0],
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: totalT2,
      allVolatileHoldings: tier2Holdings,
      targetAllocations: equalTargets,
    });
    const solA = computeSmartTradeRecommendation({
      holding: tier2Holdings[1],
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: totalT2,
      allVolatileHoldings: tier2Holdings,
      targetAllocations: equalTargets,
    });
    expect(ethA.dailyCapUsd).toBe(100);
    expect(ethA.tacticalBuyUsd).toBe(60);
    expect(solA.tacticalBuyUsd).toBe(40);

    // Scenario B: Daily cap = $45 ($162.50 eligible -> $112.50 net * 40% = $45), both Tier 1 ($45) -> $25 / $20 (leader <= 60%, #2 >= $20)
    const tier1Holdings = computeHoldings(
      txs,
      mappings,
      { ethereum: { usd: 88 }, solana: { usd: 89 } }, // ETH -12% (#1), SOL -11% (#2)
      coinTargets,
      stablecoins,
    );
    const totalT1 = tier1Holdings.reduce((acc, h) => acc + h.currentValue, 0);
    const ethB = computeSmartTradeRecommendation({
      holding: tier1Holdings[0],
      eligibleCapitalUsd: 162.5,
      totalVolatileCryptoUsd: totalT1,
      allVolatileHoldings: tier1Holdings,
      targetAllocations: equalTargets,
    });
    const solB = computeSmartTradeRecommendation({
      holding: tier1Holdings[1],
      eligibleCapitalUsd: 162.5,
      totalVolatileCryptoUsd: totalT1,
      allVolatileHoldings: tier1Holdings,
      targetAllocations: equalTargets,
    });
    expect(ethB.dailyCapUsd).toBe(45);
    expect(ethB.tacticalBuyUsd).toBe(25);
    expect(solB.tacticalBuyUsd).toBe(20);

    // Scenario C: Daily cap = $120 ($350 eligible -> $300 net * 40% = $120), #1 ETH Tier 3 ($100) + #2 SOL Tier 1 ($45) -> Pass 1 $72/$45, Pass 2 gives $3 back -> $75/$45
    const mixedHoldings = computeHoldings(
      txs,
      mappings,
      { ethereum: { usd: 76 }, solana: { usd: 89 } }, // ETH -24% (Tier 3 $100), SOL -11% (Tier 1 $45)
      coinTargets,
      stablecoins,
    );
    const totalMixed = mixedHoldings.reduce((acc, h) => acc + h.currentValue, 0);
    const ethC = computeSmartTradeRecommendation({
      holding: mixedHoldings[0],
      eligibleCapitalUsd: 350,
      totalVolatileCryptoUsd: totalMixed,
      allVolatileHoldings: mixedHoldings,
      targetAllocations: equalTargets,
    });
    const solC = computeSmartTradeRecommendation({
      holding: mixedHoldings[1],
      eligibleCapitalUsd: 350,
      totalVolatileCryptoUsd: totalMixed,
      allVolatileHoldings: mixedHoldings,
      targetAllocations: equalTargets,
    });
    expect(ethC.dailyCapUsd).toBe(120);
    expect(ethC.tacticalBuyUsd).toBe(75);
    expect(solC.tacticalBuyUsd).toBe(45);
  });

  it('tolerates mild overweight (<= +5%, e.g. BTC 58.7% vs 55%) in Tier 2/3 while keeping underweight priority', () => {
    const recentBuyDate = '2026-11-20 06:00:00';
    const checkNowMs = new Date(2026, 10, 20, 14, 0, 0).getTime(); // 8h later -> recent PAXG buy is in 48h cooldown
    const groupTargets = {
      'GROUP:BTC': 55,
      'GROUP:ETH': 25.3,
      'GROUP:SOL': 10,
      'GROUP:GOLD': 9.7,
    };

    const holdings = computeHoldings(
      [
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 698.81 },   // @ 58.70 = $587.00 (58.7% -> +3.7% drift)
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'ETH', tokens: '5', usdValue: 253 },       // @ 50.60 = $253.00 (25.3% WATCH)
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'SOL', tokens: '2', usdValue: 100 },       // @ 50.00 = $100.00 (10.0% WATCH)
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'PAXG', tokens: '0.6', usdValue: 64.96 },  // DCA before = 108.27
        { date: recentBuyDate, type: 'Buy', asset: 'PAXG', tokens: '0.1', usdValue: 7.04 },           // bought at $70.40 -> recent 48h cooldown
      ],
      { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', PAXG: 'pax-gold' },
      { bitcoin: { usd: 58.7 }, ethereum: { usd: 50.6 }, solana: { usd: 50 }, 'pax-gold': { usd: 85.714 } }, // PAXG = $60.00 (6.0% -> -3.7% underweight), BTC -16% Tier 2
      { BTC: { buy: 10, sell: 30 }, ETH: { buy: 20, sell: 40 }, SOL: { buy: 20, sell: 40 }, PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );

    const btc = holdings.find((h) => h.ticker === 'BTC')!;
    const paxg = holdings.find((h) => h.ticker === 'PAXG')!;
    const totalUsd = holdings.reduce((acc, h) => acc + h.currentValue, 0);

    // Case 1: Underweight PAXG is blocked by 48h cooldown -> mildly overweight BTC (+3.7%) is unpenalized and gets full Tier 2 ($70)
    const recPaxgLocked = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: groupTargets,
      nowMs: checkNowMs,
    });
    expect(recPaxgLocked.isTimeCooldownLocked).toBe(true);
    expect(recPaxgLocked.tacticalBuyUsd).toBe(0);

    const recBtcAlone = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 300, // net = 250, dailyCap = 100
      totalVolatileCryptoUsd: totalUsd,
      allVolatileHoldings: holdings,
      targetAllocations: groupTargets,
      nowMs: checkNowMs,
    });
    expect(recBtcAlone.groupDriftPct).toBeCloseTo(3.7, 1);
    expect(recBtcAlone.isGroupOverweightTrimmed).toBe(false);
    expect(recBtcAlone.tacticalBuyUsd).toBe(70);

    // Case 2: When underweight PAXG IS unlocked (after 48h) and daily cap = $100, PAXG takes #1 ($60) and BTC gets #2 ($40, not $0)
    const afterCooldownMs = new Date(2026, 10, 23, 0, 0, 0).getTime();
    const holdingsNoCooldown = computeHoldings(
      [
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 698.81 },
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'ETH', tokens: '5', usdValue: 253 },
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'SOL', tokens: '2', usdValue: 100 },
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'PAXG', tokens: '0.7', usdValue: 69.37 }, // DCA = $99.10 -> @ $85.714 is -13.5% (Gold Tier 3, $100)
      ],
      { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', PAXG: 'pax-gold' },
      { bitcoin: { usd: 58.7 }, ethereum: { usd: 50.6 }, solana: { usd: 50 }, 'pax-gold': { usd: 85.714 } },
      { BTC: { buy: 10, sell: 30 }, ETH: { buy: 20, sell: 40 }, SOL: { buy: 20, sell: 40 }, PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );
    const btcOpen = holdingsNoCooldown.find((h) => h.ticker === 'BTC')!;
    const paxgOpen = holdingsNoCooldown.find((h) => h.ticker === 'PAXG')!;
    const totalOpenUsd = holdingsNoCooldown.reduce((acc, h) => acc + h.currentValue, 0);

    const recPaxgOpen = computeSmartTradeRecommendation({
      holding: paxgOpen,
      eligibleCapitalUsd: 300, // net = 250, dailyCap = 100
      totalVolatileCryptoUsd: totalOpenUsd,
      allVolatileHoldings: holdingsNoCooldown,
      targetAllocations: groupTargets,
      nowMs: afterCooldownMs,
    });
    const recBtcOpen = computeSmartTradeRecommendation({
      holding: btcOpen,
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: totalOpenUsd,
      allVolatileHoldings: holdingsNoCooldown,
      targetAllocations: groupTargets,
      nowMs: afterCooldownMs,
    });
    expect(recPaxgOpen.priorityRank).toBe(1);
    expect(recPaxgOpen.tacticalBuyUsd).toBe(60);
    expect(recBtcOpen.priorityRank).toBe(2);
    expect(recBtcOpen.isGroupOverweightTrimmed).toBe(false);
    expect(recBtcOpen.tacticalBuyUsd).toBe(40);
  });

  it('builds Conservador/Equilibrado/Agresivo presets scaled by income and evaluates Green/Yellow/Red risk levels', () => {
    const eq = buildPresetTacticalConfig('equilibrado', 900);
    expect(eq).toEqual(DEFAULT_TACTICAL_DIP_CONFIG);

    const cons = buildPresetTacticalConfig('conservador', 900);
    expect(cons.tier1Usd).toBe(30);
    expect(cons.tier2Usd).toBe(50);
    expect(cons.tier3Usd).toBe(75);
    expect(cons.tier3MaxFreeUsdtPct).toBe(25);
    expect(cons.temporalCooldownHours).toBe(72);
    expect(cons.minOrderUsd).toBe(25);
    expect(cons.limitOrderProximityPct).toBe(2);
    expect(eq.limitOrderProximityPct).toBe(3);

    const aggr = buildPresetTacticalConfig('agresivo', 1800);
    expect(aggr.tier1Usd).toBe(120);
    expect(aggr.tier2Usd).toBe(180);
    expect(aggr.tier3Usd).toBe(260);
    expect(aggr.tier3MaxFreeUsdtPct).toBe(65);
    expect(aggr.temporalCooldownHours).toBe(24);
    expect(aggr.biweeklyDcaReserveUsd).toBe(100);
    expect(aggr.limitOrderProximityPct).toBe(5);

    expect(evaluateTacticalConfigRisk(cons).level).toBe('green');
    expect(evaluateTacticalConfigRisk(eq).level).toBe('green');

    const aggrRisk = evaluateTacticalConfigRisk(buildPresetTacticalConfig('agresivo', 900));
    expect(aggrRisk.level).toBe('yellow');
    expect(aggrRisk.warnings.length).toBeGreaterThan(0);

    const redRisk = evaluateTacticalConfigRisk({
      ...eq,
      tier3MaxFreeUsdtPct: 80,
      temporalCooldownHours: 0,
      biweeklyDcaReserveUsd: 0,
      multiAssetFirstPassMaxSharePct: 90,
      minOrderUsd: 5,
    });
    expect(redRisk.level).toBe('red');
    expect(redRisk.warnings.length).toBeGreaterThanOrEqual(4);
    expect(redRisk.estimatedDaysToExhaustNetLiquidity).toBeCloseTo(1.3, 1);
  });

  it('honors injected persisted config parameters (minOrderUsd, cooldownHours, firstPassShare, overweightPct, custom tier drawdowns)', () => {
    // Custom drawdown thresholds + temporalCooldownHours = 0 / 24h
    const buyTime = '2026-11-20 00:00:00';
    const plus25HoursMs = new Date(2026, 10, 21, 1, 0, 0).getTime();

    const customCfg = {
      ...DEFAULT_TACTICAL_DIP_CONFIG,
      cryptoTier1MinDropPct: 8,
      goldTier2MinDropPct: 7,
      minOrderUsd: 10,
      temporalCooldownHours: 24,
      multiAssetFirstPassMaxSharePct: 75,
      groupOverweightThresholdPct: 8,
    };

    const txs: Transaction[] = [
      { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },
      { date: buyTime, type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 88 }, // consumed Tier 1 (>8% drop) 25h ago
      { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'PAXG', tokens: '2', usdValue: 200 }, // @ $92.50 -> -7.5% (custom Gold Tier 2 >= 7%)
    ];

    const holdingsCustom = computeHoldings(
      txs,
      { BTC: 'bitcoin', PAXG: 'pax-gold' },
      { bitcoin: { usd: 80 }, 'pax-gold': { usd: 92.5 } },
      { BTC: { buy: 8, sell: 30 }, PAXG: { buy: 5, sell: 15 } },
      stablecoins,
      customCfg,
    );
    const btc = holdingsCustom.find((h) => h.ticker === 'BTC')!;
    const paxg = holdingsCustom.find((h) => h.ticker === 'PAXG')!;

    // Verify group overweight tolerance at +7.03% (<= 8% custom threshold -> NOT trimmed; actual BTC = $880/$1065 = 82.63%)
    const groupTargets = { 'GROUP:BTC': 75.6, 'GROUP:GOLD': 24.4 };
    // 25h elapsed > custom 24h cooldown -> BTC unlocked, custom firstPassMaxShare = 75% on $100 daily cap -> $75/$25? Wait:
    // BTC is Tier 2 ($70), PAXG is underweight Tier 2 ($70) with custom 7% threshold!
    const recPaxg = computeSmartTradeRecommendation({
      holding: paxg,
      eligibleCapitalUsd: 300, // net = 250, dailyCap = 100
      totalVolatileCryptoUsd: btc.currentValue + paxg.currentValue,
      allVolatileHoldings: holdingsCustom,
      tacticalConfig: customCfg,
      targetAllocations: groupTargets,
      nowMs: plus25HoursMs,
    });
    const recBtc = computeSmartTradeRecommendation({
      holding: btc,
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: btc.currentValue + paxg.currentValue,
      allVolatileHoldings: holdingsCustom,
      tacticalConfig: customCfg,
      targetAllocations: groupTargets,
      nowMs: plus25HoursMs,
    });

    expect(recPaxg.dipTier).toBe(2); // -7.5% >= custom goldTier2MinDropPct (7%)
    expect(recBtc.isTimeCooldownLocked).toBeUndefined(); // 25h >= 24h custom cooldown
    expect(recBtc.isGroupOverweightTrimmed).toBe(false); // +7% <= 8% custom threshold
    // Underweight PAXG #1 capped at $70 (min(block 70, firstPassShare 75)), BTC #2 gets remaining $30 (>= minOrderUsd $10!)
    expect(recPaxg.tacticalBuyUsd).toBe(70);
    expect(recBtc.tacticalBuyUsd).toBe(30);

    // Custom minOrderUsd = $10 allows $15 Tier 1 solo order without discarding it
    const [soloBtc] = computeHoldings(
      [{ date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 }],
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 91.5 } }, // -8.5% -> custom cryptoTier1MinDropPct 8%
      { BTC: { buy: 8, sell: 30 } },
      stablecoins,
      customCfg,
    );
    const recSoloSmall = computeSmartTradeRecommendation({
      holding: soloBtc,
      eligibleCapitalUsd: 300,
      totalVolatileCryptoUsd: soloBtc.currentValue,
      tacticalConfig: { ...customCfg, tier1Usd: 15 },
    });
    expect(recSoloSmall.dipTier).toBe(1);
    expect(recSoloSmall.tacticalBuyUsd).toBe(15);
  });

  it('simulates live Before-vs-After liquidity caps and asset suggestion changes accurately', () => {
    const holdings = computeHoldings(
      [
        { date: '2026-04-01', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },
        { date: '2026-04-01', type: 'Buy', asset: 'PAXG', tokens: '2', usdValue: 200 },
      ],
      { BTC: 'bitcoin', PAXG: 'pax-gold' },
      { bitcoin: { usd: 88 }, 'pax-gold': { usd: 89 } }, // BTC -12% (N1), PAXG -11% (Gold N2)
      { BTC: { buy: 10, sell: 30 }, PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );

    const balanced = buildPresetTacticalConfig('equilibrado', 900);
    const conservative = buildPresetTacticalConfig('conservador', 900);
    const comparison = simulateTacticalConfigImpact({
      holdings,
      eligibleCapitalUsd: 300, // net = 250
      targetAllocations: { 'GROUP:BTC': 85, 'GROUP:GOLD': 15 },
      currentConfig: balanced,
      candidateConfig: conservative,
    });

    // Equilibrado: dailyCap $100 -> PAXG $60 (min($70, 60%)) + BTC $40 (Pass 1 min($45, 60%, 40)) -> Pass 2? Wait: PAXG $70, BTC $45 -> Pass 1 gives PAXG $60, BTC $40 ($100 total)
    expect(comparison.before.dailyCapUsd).toBe(100);
    expect(comparison.after.dailyCapUsd).toBe(62.5); // 25% of $250
    expect(comparison.dailyCapDeltaUsd).toBe(-37.5);

    expect(comparison.before.totalSuggestedBuyTodayUsd).toBe(100);
    expect(comparison.after.totalSuggestedBuyTodayUsd).toBe(62.5); // PAXG $31.25 (50%) + BTC $30 (Tier 1 conservative = $30) = $61.25! Wait: let's check Pass 2:
    // Conservador: dailyCap = 62.50, firstPassShare = 50% -> leaderPass1Cap = min(31.25, 62.5 - 25) = 31.25; Pass 1 gives PAXG 31.25, remaining = 31.25, BTC min(30, 31.25, 31.25) = 30, remaining = 1.25 -> Pass 2 PAXG headroom = 50 - 31.25 -> +1.25 -> PAXG = 32.50, BTC = 30 -> total = 62.50!
    expect(comparison.totalBuyDeltaUsd).toBe(-37.5);
    expect(comparison.before.remainingLiquidityAfterOpsUsd).toBe(200);
    expect(comparison.after.remainingLiquidityAfterOpsUsd).toBe(237.5);
    expect(comparison.remainingLiquidityDeltaUsd).toBe(37.5);

    const paxgChange = comparison.changedAssets.find((c) => c.ticker === 'PAXG')!;
    const btcChange = comparison.changedAssets.find((c) => c.ticker === 'BTC')!;
    expect(paxgChange.beforeUsd).toBe(60);
    expect(paxgChange.afterUsd).toBe(32.5);
    expect(btcChange.beforeUsd).toBe(40);
    expect(btcChange.afterUsd).toBe(30);
  });

  it('suggests LIMIT orders in Zona de Acecho respecting cooldown gates, shared BUY->LIMIT daily cap priority, 60/40 split, config 0% disable, and AI report export', () => {
    // Rule 1: Eligibility ("Zona de Acecho")
    const baseBtcTxs: Transaction[] = [
      { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 }, // DCA = $100, Target Buy (-15%) = $85
    ];

    // 1A: WATCH within <= 3% of Target Buy ($86 -> distance = (86 - 85) / 86 = 1.16%) gets exact LIMIT @ $85
    const [btcNear] = computeHoldings(
      baseBtcTxs,
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 86 } },
      { BTC: { buy: 15, sell: 30 } },
      stablecoins,
    );
    expect(btcNear.tradeSignal).toBe('WATCH');
    const recNear = computeSmartTradeRecommendation({
      holding: btcNear,
      eligibleCapitalUsd: 400, // net = $350, dailyCap = $140
      totalVolatileCryptoUsd: btcNear.currentValue,
    });
    expect(recNear.limitOrder).toBeDefined();
    expect(recNear.limitOrder!.limitPrice).toBe(85);
    expect(recNear.limitOrder!.distancePct).toBeCloseTo(1.16, 2);
    expect(recNear.limitOrder!.suggestedUsd).toBe(70); // Target Buy -15% falls into Crypto Tier 2 ($70)
    expect(recNear.limitOrder!.expiryRuleLabel).toContain('48h–72h');

    // 1B: WATCH > 3% away ($88 -> 3.41%) gets NO LIMIT order at 3%, but gets LIMIT when using Agresivo (5%)
    const [btcFar] = computeHoldings(
      baseBtcTxs,
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 88 } },
      { BTC: { buy: 15, sell: 30 } },
      stablecoins,
    );
    const recFarDefault = computeSmartTradeRecommendation({
      holding: btcFar,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcFar.currentValue,
    });
    expect(recFarDefault.limitOrder).toBeUndefined();

    const recFarAggr = computeSmartTradeRecommendation({
      holding: btcFar,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcFar.currentValue,
      tacticalConfig: buildPresetTacticalConfig('agresivo', 900),
    });
    expect(recFarAggr.limitOrder).toBeDefined();
    expect(recFarAggr.limitOrder!.limitPrice).toBe(85);

    // Setting limitOrderProximityPct = 0 disables LIMIT suggestions cleanly
    const recDisabled = computeSmartTradeRecommendation({
      holding: btcNear,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcNear.currentValue,
      tacticalConfig: { limitOrderProximityPct: 0 },
    });
    expect(recDisabled.limitOrder).toBeUndefined();

    // 1C: Cooldown-locked asset WITHIN 48h temporal cooldown (only 17h elapsed, <= 3% from flash crash price $76.50 -> @ $78 = 1.92% away) must NOT suggest LIMIT
    const recentTxs: Transaction[] = [
      { date: '2026-10-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '10', usdValue: 1000 },
      { date: '2026-11-20 00:00:00', type: 'Buy', asset: 'BTC', tokens: '1', usdValue: 90 }, // Tier 1 @ $90
    ];
    const [btcRecentCrashNear] = computeHoldings(
      recentTxs,
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 78 } },
      { BTC: { buy: 10, sell: 30 } },
      stablecoins,
    );
    const plus17HoursMs = new Date(2026, 10, 20, 17, 0, 0).getTime();
    const recBlocked48hLimit = computeSmartTradeRecommendation({
      holding: btcRecentCrashNear,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcRecentCrashNear.currentValue,
      nowMs: plus17HoursMs,
    });
    expect(recBlocked48hLimit.isTimeCooldownLocked).toBe(true);
    expect(recBlocked48hLimit.tacticalBuyUsd).toBe(0);
    expect(recBlocked48hLimit.limitOrder).toBeUndefined();

    // After 48h expires, locked at Tier 1 ($90 -> spacing unlock $83.25 = -7.5%, DCA ~$99.09 -> Tier 2 15% = $84.23 -> min = $83.25), at $84 (distance 0.89%) LIMIT IS suggested at $83.25!
    const [btcPost48hNear] = computeHoldings(
      recentTxs,
      { BTC: 'bitcoin' },
      { bitcoin: { usd: 84 } },
      { BTC: { buy: 10, sell: 30 } },
      stablecoins,
    );
    const plus60HoursMs = new Date(2026, 10, 22, 12, 0, 0).getTime();
    const recUnlockedLimit = computeSmartTradeRecommendation({
      holding: btcPost48hNear,
      eligibleCapitalUsd: 400,
      totalVolatileCryptoUsd: btcPost48hNear.currentValue,
      nowMs: plus60HoursMs,
    });
    expect(recUnlockedLimit.isTimeCooldownLocked).toBeUndefined();
    expect(recUnlockedLimit.isCooldownLocked).toBe(true);
    expect(recUnlockedLimit.tacticalBuyUsd).toBe(0);
    expect(recUnlockedLimit.limitOrder).toBeDefined();
    expect(recUnlockedLimit.limitOrder!.limitPrice).toBeCloseTo(83.25, 2);
    expect(recUnlockedLimit.limitOrder!.distancePct).toBeCloseTo(0.89, 2);

    // Rule 2: Shared Daily Cap Priority (BUY consumes first, remainder >= $20 goes to LIMIT, BUY + LIMIT <= dailyCap)
    const multiHoldings = computeHoldings(
      [
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'BTC', tokens: '5', usdValue: 500 },  // @ 83 = $415 (33.8% -> -17% BUY Tier 2 = $70)
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'ETH', tokens: '5', usdValue: 500 },  // @ 86 = $430 (35.0% -> -14% WATCH, Target Buy $85, 1.16% away -> Tier 2 $70)
        { date: '2026-04-01 10:00:00', type: 'Buy', asset: 'PAXG', tokens: '4', usdValue: 400 }, // @ 96 = $384 (31.2% -> -4% WATCH underweight -2.1%, Target Buy $95, 1.04% away -> Gold Tier 1 $45)
      ],
      { BTC: 'bitcoin', ETH: 'ethereum', PAXG: 'pax-gold' },
      { bitcoin: { usd: 83 }, ethereum: { usd: 86 }, 'pax-gold': { usd: 96 } },
      { BTC: { buy: 15, sell: 30 }, ETH: { buy: 15, sell: 30 }, PAXG: { buy: 5, sell: 15 } },
      stablecoins,
    );
    const totalMultiUsd = multiHoldings.reduce((acc, h) => acc + h.currentValue, 0);
    const equalGroupTargets = { 'GROUP:BTC': 33.4, 'GROUP:ETH': 33.3, 'GROUP:GOLD': 33.3 };

    // Case 2A: eligible = $275 -> net = $225 -> dailyCap = $90. BTC immediate BUY = $70 -> remainder = $20!
    // Limit pool [ETH, PAXG] sees remainingCap = $20 (< $40 multi-asset threshold), so only priority #1 underweight LIMIT (PAXG: 11.2% vs 33.3% = -22.1% vs ETH 25.1% vs 33.3% = -8.2%) gets the $20 LIMIT; sum = 70 + 20 = 90!
    const recBtc2A = computeSmartTradeRecommendation({
      holding: multiHoldings[0],
      eligibleCapitalUsd: 275,
      totalVolatileCryptoUsd: totalMultiUsd,
      allVolatileHoldings: multiHoldings,
      targetAllocations: equalGroupTargets,
    });
    const recEth2A = computeSmartTradeRecommendation({
      holding: multiHoldings[1],
      eligibleCapitalUsd: 275,
      totalVolatileCryptoUsd: totalMultiUsd,
      allVolatileHoldings: multiHoldings,
      targetAllocations: equalGroupTargets,
    });
    const recPaxg2A = computeSmartTradeRecommendation({
      holding: multiHoldings[2],
      eligibleCapitalUsd: 275,
      totalVolatileCryptoUsd: totalMultiUsd,
      allVolatileHoldings: multiHoldings,
      targetAllocations: equalGroupTargets,
    });
    expect(recBtc2A.tacticalBuyUsd).toBe(70);
    expect(recBtc2A.limitOrder).toBeUndefined();
    expect(recPaxg2A.limitOrder?.suggestedUsd).toBe(20);
    expect(recEth2A.limitOrder).toBeUndefined();
    expect(
      recBtc2A.tacticalBuyUsd +
        (recEth2A.limitOrder?.suggestedUsd ?? 0) +
        (recPaxg2A.limitOrder?.suggestedUsd ?? 0),
    ).toBeLessThanOrEqual(recBtc2A.dailyCapUsd!);

    // Case 2B: eligible = $262.50 -> net = $212.50 -> dailyCap = $85. BTC BUY = $70 -> remainder = $15 (< $20 floor) -> NO LIMIT suggested!
    const recPaxgTooSmallRem = computeSmartTradeRecommendation({
      holding: multiHoldings[2],
      eligibleCapitalUsd: 262.5,
      totalVolatileCryptoUsd: totalMultiUsd,
      allVolatileHoldings: multiHoldings,
      targetAllocations: equalGroupTargets,
    });
    expect(recPaxgTooSmallRem.remainingDailyCapAfterBuyUsd).toBe(15);
    expect(recPaxgTooSmallRem.limitOrder).toBeUndefined();

    // Case 2C: Two LIMIT orders sharing >= $40 remaining cap (eligible = $425 -> net = $375 -> dailyCap = $150 -> BTC takes $70 -> remainder = $80)
    // Remainder $80 split among ETH (Tier 2 $70) and PAXG (Tier 1 $45): Pass 1 leader PAXG min(45, 48, 80) = $45, ETH min(70, 48, 35) = $35 -> 45 + 35 = $80! Total BUY + LIMIT = 70 + 80 = $150!
    const recEth2C = computeSmartTradeRecommendation({
      holding: multiHoldings[1],
      eligibleCapitalUsd: 425,
      totalVolatileCryptoUsd: totalMultiUsd,
      allVolatileHoldings: multiHoldings,
      targetAllocations: equalGroupTargets,
    });
    const recPaxg2C = computeSmartTradeRecommendation({
      holding: multiHoldings[2],
      eligibleCapitalUsd: 425,
      totalVolatileCryptoUsd: totalMultiUsd,
      allVolatileHoldings: multiHoldings,
      targetAllocations: equalGroupTargets,
    });
    expect(recPaxg2C.limitOrder?.suggestedUsd).toBe(45);
    expect(recEth2C.limitOrder?.suggestedUsd).toBe(35);

    // Markdown report includes Zona de Acecho & 48h-72h expiry notice, and impact simulation detects disabling 3% -> 0%
    const markdown = buildAiPortfolioReportMarkdown({
      generatedAt: '2026-11-20',
      holdings: multiHoldings,
      eligibleCapital: {
        ahorroEnvelopeUsd: 300,
        unassignedUsdtUsd: 125,
        totalEligibleUsd: 425,
        excludedPhysicalCashUsd: 0,
      },
      tacticalConfig: DEFAULT_TACTICAL_DIP_CONFIG,
      recommendations: {
        BTC: computeSmartTradeRecommendation({
          holding: multiHoldings[0],
          eligibleCapitalUsd: 425,
          totalVolatileCryptoUsd: totalMultiUsd,
          allVolatileHoldings: multiHoldings,
          targetAllocations: equalGroupTargets,
        }),
        ETH: recEth2C,
        PAXG: recPaxg2C,
      },
      groupExposure: computePortfolioExposure({
        holdings: multiHoldings,
        mode: 'group',
        targetAllocations: equalGroupTargets,
      }),
      coinExposure: computePortfolioExposure({
        holdings: multiHoldings,
        mode: 'coin',
        targetAllocations: { BTC: 33.4, ETH: 33.3, PAXG: 33.3 },
      }),
    });
    expect(markdown).toContain('Órdenes LIMIT Sugeridas (Zona de Acecho');
    expect(markdown).toContain('$85.00');
    expect(markdown).toContain('48h–72h');

    const impact = simulateTacticalConfigImpact({
      holdings: multiHoldings,
      eligibleCapitalUsd: 425,
      targetAllocations: equalGroupTargets,
      currentConfig: DEFAULT_TACTICAL_DIP_CONFIG,
      candidateConfig: { ...DEFAULT_TACTICAL_DIP_CONFIG, limitOrderProximityPct: 0 },
    });
    expect(impact.before.totalSuggestedLimitTodayUsd).toBe(80);
    expect(impact.after.totalSuggestedLimitTodayUsd).toBe(0);
    expect(impact.changedAssets.some((a) => a.ticker === 'PAXG')).toBe(true);
  });
});
