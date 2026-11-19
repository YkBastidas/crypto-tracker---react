import { describe, expect, it } from 'vitest';
import type {
  CoinMappings,
  CoinTargets,
  LivePrices,
  Transaction,
} from '../../../shared/types';
import {
  buildAiPortfolioReportMarkdown,
  computeHoldings,
  computePortfolioExposure,
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

  it('prioritizes deeper drop on simultaneous BUY alerts when groups are within +5% target and discards sub-$20 remainder', () => {
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

    // BTC takes full Tier 1 block ($45); ETH is discarded ($0) with priority message, never cut or inflated
    expect(recBtc.tacticalBuyUsd).toBe(45);
    expect(recBtc.priorityRank).toBe(1);
    expect(recEth.tacticalBuyUsd).toBe(0);
    expect(recEth.priorityRank).toBe(2);
    expect(recEth.blockedReason).toContain('Prioridad asignada a BTC');
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

    // When both overweight BTC (-10.75%, Tier 1) and underweight PAXG (-10.28%, Gold Tier 2) trigger BUY, PAXG takes Priority #1 ($70)
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
    expect(recBtc.tacticalBuyUsd).toBe(0);
    expect(recBtc.blockedReason).toContain('Prioridad asignada a PAXG');
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
    expect(recBtc.tacticalBuyUsd).toBe(0);
    expect(recBtc.blockedReason).toContain('Prioridad asignada a PAXG');
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
});
