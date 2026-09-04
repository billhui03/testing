/* Run with: node --test lynch-analysis/test/ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Lynch = require('../lynch.js');

const close = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

// A clean fast grower: 24% growth, P/E 18, net cash, no leverage.
const fastGrower = {
  ticker: 'ngdc',
  company: 'Northgate Diner Co.',
  price: 36,
  sharesOutstanding: 120,
  epsTrailing: 2,
  epsHistory: '1.05, 1.30, 1.62, 2.00',
  revenueHistory: '410, 505, 620, 760',
  growthRate: 24,
  dividendYield: 0,
  institutionalOwnership: 31,
  cash: 480,
  totalDebt: 90,
  totalLiabilities: 640,
  currentAssets: 700,
  currentLiabilities: 300,
  shareholdersEquity: 1100
};

test('util.cagr computes compound growth and refuses meaningless inputs', () => {
  close(Lynch.util.cagr([100, 121]), 21);
  close(Lynch.util.cagr([1.05, 1.3, 1.62, 2.0]), 23.99, 0.05);
  assert.strictEqual(Lynch.util.cagr([1]), null);
  assert.strictEqual(Lynch.util.cagr([-1, 2]), null, 'sign change has no CAGR');
  assert.strictEqual(Lynch.util.cagr([2, 0]), null);
});

test('util.num strips currency and percent formatting', () => {
  assert.strictEqual(Lynch.util.num('$1,250.50'), 1250.5);
  assert.strictEqual(Lynch.util.num('24%'), 24);
  assert.strictEqual(Lynch.util.num(''), null);
  assert.strictEqual(Lynch.util.num('n/a'), null);
});

test('core valuation metrics follow the Lynch formulas', () => {
  const r = Lynch.analyze(fastGrower);
  close(r.metrics.peRatio, 18);          // 36 / 2
  close(r.metrics.peg, 0.75);            // 18 / 24
  close(r.metrics.marketCap, 4320);      // $M
  close(r.metrics.fairValuePE, 24);      // Lynch: fair P/E == growth rate
  close(r.metrics.fairValuePrice, 48);   // 24 * $2 EPS
  close(r.metrics.upsidePct, 33.33, 0.01);
  close(r.metrics.lynchRatio, 1.333, 0.01);
  close(r.metrics.netCash, 390);
  close(r.metrics.netCashPerShare, 3.25);
  close(r.metrics.debtToEquity, 0.0818, 0.001);
  close(r.metrics.currentRatio, 2.333, 0.01);
});

test('growth rate falls back to the EPS history when not supplied', () => {
  const r = Lynch.analyze({ ...fastGrower, growthRate: '' });
  close(r.metrics.growthRate, 23.99, 0.05);
  assert.match(r.metrics.growthSource, /EPS history/);
  assert.strictEqual(Lynch.analyze(fastGrower).metrics.growthSource, 'supplied');
});

test('PEG scoring hits Lynch’s band anchors', () => {
  assert.strictEqual(Lynch.scores.peg(0.4), 10);
  assert.strictEqual(Lynch.scores.peg(1), 7);
  assert.strictEqual(Lynch.scores.peg(1.5), 4);
  assert.strictEqual(Lynch.scores.peg(2), 1);
  assert.strictEqual(Lynch.scores.peg(5), 0);
  assert.strictEqual(Lynch.scores.peg(null), null);
  assert.ok(Lynch.scores.peg(0.75) > Lynch.scores.peg(1.25));
});

test('loss-makers fall back to a price-to-book valuation score', () => {
  const r = Lynch.analyze({ ...fastGrower, epsTrailing: -0.4, epsHistory: '1.2, 0.4, -0.4', growthRate: '' });
  const valuation = r.scorecard.dimensions.find((d) => d.key === 'valuation');
  assert.match(valuation.basis, /Price\/Book/);
  assert.ok(valuation.score !== null);
  assert.strictEqual(r.metrics.peg, null);
});

test('classification sorts companies into Lynch’s categories', () => {
  assert.strictEqual(Lynch.analyze(fastGrower).category.key, 'fastGrower');
  assert.strictEqual(Lynch.analyze({ ...fastGrower, growthRate: 11 }).category.key, 'stalwart');
  assert.strictEqual(
    Lynch.analyze({ ...fastGrower, growthRate: 4, dividendYield: 3.2 }).category.key,
    'slowGrower'
  );
  assert.strictEqual(
    Lynch.analyze({ ...fastGrower, epsTrailing: -1.1, growthRate: '' }).category.key,
    'turnaround'
  );
  // Liquid assets net of every liability above half the market cap: asset play.
  assert.strictEqual(
    Lynch.analyze({ ...fastGrower, cash: 3000, totalLiabilities: 400 }).category.key,
    'assetPlay'
  );
});

test('an explicit category overrides the suggestion and is flagged as such', () => {
  const r = Lynch.analyze({ ...fastGrower, category: 'cyclical' });
  assert.strictEqual(r.category.key, 'cyclical');
  assert.strictEqual(r.category.suggestedKey, 'fastGrower');
  assert.strictEqual(r.category.overridden, true);
});

test('balance sheet health rewards net cash and punishes leverage', () => {
  const healthy = Lynch.analyze(fastGrower).scorecard.dimensions.find((d) => d.key === 'balance');
  const levered = Lynch.analyze({
    ...fastGrower, cash: 20, totalDebt: 2400, shareholdersEquity: 300,
    currentAssets: 200, currentLiabilities: 500
  }).scorecard.dimensions.find((d) => d.key === 'balance');
  assert.ok(healthy.score >= 8, `healthy scored ${healthy.score}`);
  assert.ok(levered.score <= 2, `levered scored ${levered.score}`);
});

test('earnings consistency penalises down years and volatility', () => {
  assert.ok(Lynch.scores.consistency([1, 1.2, 1.44, 1.73]) >= 9);
  assert.ok(Lynch.scores.consistency([2, 1.1, 1.8, 0.9]) < 5);
  assert.strictEqual(Lynch.scores.consistency([1, 2]), null, 'needs three years');
});

test('the four balance-sheet hidden-value rows use Lynch’s formulas', () => {
  const rows = Lynch.analyze(fastGrower).balanceSheet;
  assert.deepStrictEqual(rows.map((r) => r.total), [
    480 - 640,   // net cash − total liabilities
    480 - 90,    // net cash
    700 - 300,   // net liquid assets
    700 - 640    // current assets − total liabilities
  ]);
  close(rows[1].perShare, 3.25);
  close(rows[1].pctOfPrice, 9.03, 0.01);
  assert.ok(rows[0].total < 0, 'negatives are reported, never hidden');
});

test('the scorecard totals out of 60 and lands in a verdict band', () => {
  const r = Lynch.analyze({ ...fastGrower, storyScore: 9, moatScore: 7 });
  assert.strictEqual(r.scorecard.dimensions.length, 6);
  assert.strictEqual(r.scorecard.scoredCount, 6);
  assert.ok(r.scorecard.total > 0 && r.scorecard.total <= 60);
  assert.strictEqual(r.scorecard.verdict.label, Lynch.verdictFor(r.scorecard.total).label);
  assert.strictEqual(Lynch.verdictFor(52).label, 'Strong Lynch Stock');
  assert.strictEqual(Lynch.verdictFor(40).label, 'Watchlist Candidate');
  assert.strictEqual(Lynch.verdictFor(30).label, 'Proceed With Caution');
  assert.strictEqual(Lynch.verdictFor(10).label, 'Avoid');
});

test('unscored dimensions are extrapolated, not counted as zero', () => {
  const bare = Lynch.analyze({ price: 36, epsTrailing: 2, growthRate: 24 });
  assert.ok(bare.scorecard.scoredCount < 6);
  // PEG 0.75 alone scores ~8.5/10, so the total must stay in that neighbourhood
  // rather than collapsing toward zero because of the blank fields.
  assert.ok(bare.scorecard.total > 40, `got ${bare.scorecard.total}`);
});

test('flags surface the signals Lynch actually watched', () => {
  const r = Lynch.analyze({ ...fastGrower, qualitative: { boringName: true, hotStock: true } });
  const green = r.flags.green.join(' | ');
  const red = r.flags.red.join(' | ');
  assert.match(green, /PEG/);
  assert.match(green, /Boring name/);
  assert.match(green, /Institutional ownership of 31%/);
  assert.match(red, /Hot stock/);

  const bad = Lynch.analyze({
    ...fastGrower, growthRate: -5, epsTrailing: 0.4, institutionalOwnership: 84,
    cash: 20, totalDebt: 2400, shareholdersEquity: 300, currentAssets: 200, currentLiabilities: 500
  }).flags.red.join(' | ');
  assert.match(bad, /80% danger line/);
  assert.match(bad, /under-owned/);
  assert.match(bad, /shrinking/);
  assert.match(bad, /working-capital pressure/);
});

test('an empty analysis degrades gracefully instead of throwing', () => {
  const r = Lynch.analyze({});
  assert.strictEqual(r.metrics.peg, null);
  assert.strictEqual(r.scorecard.total, null);
  assert.strictEqual(r.scorecard.verdict, null);
  assert.ok(r.category.key);
  assert.strictEqual(r.balanceSheet.length, 4);
  assert.doesNotThrow(() => Lynch.analyze());
});
