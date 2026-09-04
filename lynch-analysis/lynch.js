/*
 * Lynch analysis engine.
 *
 * Pure calculation code: no DOM, no I/O. Loads as a classic <script> in the
 * browser (exposes window.Lynch) and as a CommonJS module in Node (for tests).
 *
 * All dollar inputs are in $ millions and share counts in millions, so any
 * "$M / shares" division lands directly in dollars per share.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Lynch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- helpers

  /** Coerce to a finite number, or null when the field is blank/unusable. */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  /** Parse "1.20, 1.55, 2.02" into [1.2, 1.55, 2.02]. */
  function series(v) {
    if (Array.isArray(v)) return v.map(num).filter(function (n) { return n !== null; });
    if (typeof v !== 'string' || !v.trim()) return [];
    return v.split(/[,\s]+/).map(num).filter(function (n) { return n !== null; });
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function round(n, dp) {
    if (n === null || !Number.isFinite(n)) return null;
    var f = Math.pow(10, dp === undefined ? 2 : dp);
    return Math.round(n * f) / f;
  }

  function div(a, b) {
    if (a === null || b === null || b === 0) return null;
    return a / b;
  }

  /** Piecewise-linear interpolation through [x, y] anchor points. */
  function interp(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
    return points[points.length - 1][1];
  }

  function stdev(xs) {
    if (xs.length < 2) return 0;
    var mean = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
    var v = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (xs.length - 1);
    return Math.sqrt(v);
  }

  /** Compound annual growth rate in %, or null when the maths is meaningless. */
  function cagr(vals) {
    if (!vals || vals.length < 2) return null;
    var first = vals[0], last = vals[vals.length - 1], years = vals.length - 1;
    if (first <= 0 || last <= 0) return null; // sign changes make CAGR nonsense
    return (Math.pow(last / first, 1 / years) - 1) * 100;
  }

  /** Year-over-year growth rates in %, skipping non-positive bases. */
  function yoy(vals) {
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      if (vals[i - 1] <= 0) continue;
      out.push(((vals[i] - vals[i - 1]) / Math.abs(vals[i - 1])) * 100);
    }
    return out;
  }

  // ------------------------------------------------------------- categories

  var CATEGORIES = {
    slowGrower: {
      label: 'Slow Grower',
      traits: 'Large and mature, growing at roughly GDP rate, pays a steady dividend.',
      playbook: 'Hold for the income, not the appreciation. Lynch sold if the dividend was cut or growth stalled — and he kept few of these, since a slow grower ties up money a fast grower could be compounding.'
    },
    stalwart: {
      label: 'Stalwart',
      traits: 'Large-cap with roughly 10-12% earnings growth; defensive, recession-resistant.',
      playbook: 'Buy on dips and pessimism, take the 30-50% gain, then rotate into the next one. Stalwarts are portfolio ballast, not ten-baggers — Lynch held them for protection during downturns.'
    },
    fastGrower: {
      label: 'Fast Grower',
      traits: 'Small or mid-cap growing earnings 20-25%+ in an expanding niche.',
      playbook: "Lynch's favourites and the source of his ten-baggers. Hold through the growth phase and watch for the end of it: saturation of the concept, decelerating same-store or same-unit numbers, or a P/E that has run far past the growth rate."
    },
    cyclical: {
      label: 'Cyclical',
      traits: 'Revenue and earnings expand and contract with the economic cycle.',
      playbook: 'Timing is everything and the P/E lies: a low P/E on peak earnings is the danger signal, a high P/E on trough earnings often marks the bottom. Buy into pessimism early in the cycle, sell into optimism.'
    },
    turnaround: {
      label: 'Turnaround',
      traits: 'Troubled or restructuring; a candidate to return to profitability.',
      playbook: 'Highest risk and highest reward, and uncorrelated with the market. Demand a concrete catalyst and a balance sheet that can survive until it arrives — check cash versus debt maturities before the earnings story.'
    },
    assetPlay: {
      label: 'Asset Play',
      traits: 'Market cap sits below the value of assets the market is ignoring (real estate, cash, brand, patents).',
      playbook: 'Find the hidden asset, confirm it is real and unencumbered by debt, then wait for the catalyst that makes the market notice. Patience is the whole strategy here.'
    }
  };

  var CATEGORY_KEYS = Object.keys(CATEGORIES);

  /**
   * Suggest a Lynch category from the numbers alone.
   * Cyclicals and asset plays need business knowledge, so they are only ever
   * suggested when the balance sheet screams asset play; otherwise the user
   * overrides in the UI.
   */
  function classify(m) {
    var g = m.growthRate, eps = m.epsTrailing, cap = m.marketCap;

    if (m.netCashLessTotalLiabilities !== null && m.marketCap &&
        m.netCashLessTotalLiabilities > m.marketCap * 0.5) {
      return { key: 'assetPlay', reason: 'Liquid assets net of all liabilities exceed half the market cap — the balance sheet, not the earnings, is the story.' };
    }
    if (eps !== null && eps <= 0) {
      return { key: 'turnaround', reason: 'Trailing earnings are negative, so this is a recovery story until profitability returns.' };
    }
    if (g === null) {
      return { key: 'stalwart', reason: 'No growth rate supplied — defaulting to stalwart. Set the growth rate or an EPS history to refine this.' };
    }
    if (g >= 20) {
      return { key: 'fastGrower', reason: 'Earnings growth of ' + round(g, 1) + '% clears the 20% fast-grower threshold.' };
    }
    if (g >= 8) {
      return {
        key: 'stalwart',
        reason: 'Growth of ' + round(g, 1) + '% sits in the 8-20% stalwart band' + (cap ? ' at a $' + round(cap / 1000, 1) + 'B market cap' : '') + '.'
      };
    }
    if (g < 8 && m.dividendYield !== null && m.dividendYield >= 2) {
      return { key: 'slowGrower', reason: 'Sub-8% growth paired with a ' + round(m.dividendYield, 1) + '% yield is the classic slow-grower profile.' };
    }
    if (g < 0) {
      return { key: 'turnaround', reason: 'Earnings are shrinking, which puts this in turnaround territory until growth resumes.' };
    }
    return { key: 'slowGrower', reason: 'Growth of ' + round(g, 1) + '% is below the stalwart band.' };
  }

  // ---------------------------------------------------------------- scoring

  /**
   * PEG attractiveness, anchored on Lynch's bands:
   * PEG < 0.5 -> 10, 1.0 -> 7, 1.5 -> 4, 2.0 -> 1, 3.0+ -> 0.
   */
  function pegScore(peg) {
    if (peg === null || peg <= 0) return null;
    return round(interp([[0, 10], [0.5, 10], [1, 7], [1.5, 4], [2, 1], [3, 0]], peg), 1);
  }

  /**
   * Fallback for companies with no usable P/E (turnarounds, loss-makers):
   * score price-to-book instead, as Lynch did when earnings were absent.
   */
  function bookScore(pb) {
    if (pb === null || pb <= 0) return null;
    return round(interp([[0, 10], [1, 10], [2, 7], [3, 4], [4, 1], [6, 0]], pb), 1);
  }

  /** Steadiness of the earnings record: down years and volatility both cost. */
  function consistencyScore(eps) {
    if (!eps || eps.length < 3) return null;
    var score = 10;
    for (var i = 0; i < eps.length; i++) if (eps[i] <= 0) score -= 3;
    for (var j = 1; j < eps.length; j++) if (eps[j] < eps[j - 1]) score -= 2.5;
    score -= clamp(stdev(yoy(eps)) / 20, 0, 3);
    return round(clamp(score, 0, 10), 1);
  }

  /** Balance-sheet health: net cash, leverage and liquidity. */
  function balanceScore(m) {
    var score = 5, known = false;

    if (m.netCash !== null) {
      known = true;
      score += m.netCash > 0 ? 2 : -1;
      if (m.marketCap && m.netCash > 0 && m.netCash / m.marketCap >= 0.1) score += 1;
    }
    if (m.debtToEquity !== null) {
      known = true;
      if (m.debtToEquity < 0.3) score += 2;
      else if (m.debtToEquity < 0.8) score += 1;
      else if (m.debtToEquity > 2.5) score -= 3;
      else if (m.debtToEquity > 1.5) score -= 2;
    }
    if (m.currentRatio !== null) {
      known = true;
      if (m.currentRatio >= 2) score += 1;
      else if (m.currentRatio < 1) score -= 2;
    }
    // Lynch's hard line: debt at 80% of total capital is a balance sheet in charge
    // of the company, rather than the other way round.
    if (m.debtToCapital !== null && m.debtToCapital >= 0.8) { known = true; score -= 3; }

    return known ? round(clamp(score, 0, 10), 1) : null;
  }

  /** How closely the numbers match the ideal profile of the chosen category. */
  function fitScore(key, m) {
    var g = m.growthRate, s;
    switch (key) {
      case 'fastGrower':
        if (g === null) return null;
        s = interp([[0, 0], [10, 3], [20, 7], [30, 9], [40, 10]], g);
        if (m.debtToEquity !== null && m.debtToEquity > 1) s -= 2; // leverage kills growth stories
        if (m.epsTrailing !== null && m.epsTrailing <= 0) s -= 3;
        break;
      case 'stalwart':
        if (g === null) return null;
        s = g >= 8 && g <= 15 ? 9 : interp([[0, 2], [8, 9], [15, 9], [25, 4], [40, 2]], g);
        if (m.dividendYield) s += 0.5;
        if (m.marketCap && m.marketCap >= 10000) s += 0.5;
        break;
      case 'slowGrower':
        if (g === null) return null;
        s = interp([[0, 6], [4, 8], [8, 7], [15, 3], [25, 1]], g);
        if (m.dividendYield !== null) s += m.dividendYield >= 3 ? 2 : m.dividendYield >= 1.5 ? 1 : -1;
        break;
      case 'turnaround':
        s = 5;
        if (m.epsTrailing !== null && m.epsTrailing <= 0) s += 1;    // it is genuinely troubled
        if (m.netCash !== null) s += m.netCash > 0 ? 3 : -2;         // can it survive the wait?
        if (m.currentRatio !== null) s += m.currentRatio >= 1.5 ? 1 : -1;
        break;
      case 'assetPlay':
        if (m.netCashLessTotalLiabilities === null || !m.marketCap) return null;
        s = interp([[-0.5, 1], [0, 5], [0.25, 7], [0.5, 9], [1, 10]],
                   m.netCashLessTotalLiabilities / m.marketCap);
        break;
      default: // cyclical — where you are in the cycle is a judgment call
        return null;
    }
    return round(clamp(s, 0, 10), 1);
  }

  var VERDICTS = [
    { min: 48, label: 'Strong Lynch Stock', tone: 'good', note: 'Meets the Lynch criteria across the board.' },
    { min: 36, label: 'Watchlist Candidate', tone: 'ok', note: 'Worth following; wait for a better entry or a clearer story.' },
    { min: 24, label: 'Proceed With Caution', tone: 'warn', note: 'The story is weak or the valuation is stretched.' },
    { min: 0, label: 'Avoid', tone: 'bad', note: 'Does not meet the Lynch criteria.' }
  ];

  function verdictFor(score) {
    for (var i = 0; i < VERDICTS.length; i++) if (score >= VERDICTS[i].min) return VERDICTS[i];
    return VERDICTS[VERDICTS.length - 1];
  }

  // ----------------------------------------------------------------- flags

  function buildFlags(m, q) {
    var green = [], red = [];
    q = q || {};

    if (m.peg !== null && m.peg <= 1) green.push('PEG of ' + round(m.peg, 2) + ' clears Lynch’s primary filter (PEG ≤ 1).');
    if (m.peg !== null && m.peg > 2) red.push('PEG of ' + round(m.peg, 2) + ' is more than double the growth rate — you are paying for growth twice.');
    if (m.lynchRatio !== null && m.lynchRatio >= 1.5) green.push('(Growth + yield) / P/E of ' + round(m.lynchRatio, 2) + ' is in the range Lynch called excellent (≥ 1.5).');
    if (m.netCashPerShare !== null && m.price && m.netCashPerShare > 0 && m.netCashPerShare / m.price >= 0.1) {
      green.push('Net cash of $' + round(m.netCashPerShare, 2) + '/share is ' + round((m.netCashPerShare / m.price) * 100, 0) + '% of the price — a real balance-sheet cushion.');
    }
    if (m.debtToEquity !== null && m.debtToEquity < 0.3) green.push('Debt-to-equity of ' + round(m.debtToEquity, 2) + ' leaves the balance sheet out of the way.');
    if (m.debtToCapital !== null && m.debtToCapital >= 0.8) red.push('Debt is ' + round(m.debtToCapital * 100, 0) + '% of total capital — past Lynch’s 80% danger line.');
    if (m.growthRate !== null && m.growthRate >= 20) green.push('Earnings growth of ' + round(m.growthRate, 1) + '% is fast-grower territory.');
    if (m.growthRate !== null && m.growthRate < 0) red.push('Earnings are shrinking (' + round(m.growthRate, 1) + '%), so price has nothing to follow.');
    if (m.institutionalOwnership !== null && m.institutionalOwnership < 40) green.push('Institutional ownership of ' + round(m.institutionalOwnership, 0) + '% means Wall Street has not crowded in yet.');
    if (m.institutionalOwnership !== null && m.institutionalOwnership > 70) red.push('Institutional ownership of ' + round(m.institutionalOwnership, 0) + '% — Lynch preferred under-owned, under-followed companies.');
    if (m.currentRatio !== null && m.currentRatio >= 2) green.push('Current ratio of ' + round(m.currentRatio, 2) + ' covers near-term obligations comfortably.');
    if (m.currentRatio !== null && m.currentRatio < 1) red.push('Current ratio of ' + round(m.currentRatio, 2) + ' signals working-capital pressure — check whether it is structural.');
    if (m.netLiquidAssets !== null && m.netLiquidAssets < 0) red.push('Current liabilities exceed current assets; the earnings story has to carry the stock entirely.');
    if (m.epsHistory.length >= 3 && m.epsHistory.every(function (v, i, a) { return i === 0 || v >= a[i - 1]; })) {
      green.push('Earnings rose in every year on record — the predictability Lynch wanted.');
    }

    var qualitative = {
      boringName: ['green', 'Boring name or boring business — the kind of company Wall Street overlooks.'],
      niche: ['green', 'Operates in a niche nobody follows.'],
      insiderBuying: ['green', 'Insiders are buying — the one insider signal Lynch trusted.'],
      buybacks: ['green', 'The company is buying back its own shares.'],
      replicable: ['green', 'The growth story is replicable across new stores, markets or geographies.'],
      hotStock: ['red', 'Hot stock in a hot industry — a crowded trade Lynch avoided on principle.'],
      acquisitive: ['red', 'On an acquisition spree — Lynch’s "diworsification".'],
      noRevenue: ['red', 'A whisper stock: great story, no meaningful revenue.'],
      dependentOnOneCustomer: ['red', 'Depends on a single large customer.']
    };
    Object.keys(qualitative).forEach(function (k) {
      if (q[k]) (qualitative[k][0] === 'green' ? green : red).push(qualitative[k][1]);
    });

    return { green: green, red: red };
  }

  // --------------------------------------------------------------- analyse

  /**
   * Run the full analysis. Every field is optional: whatever is missing simply
   * scores as unknown and is excluded from the total rather than guessed at.
   */
  function analyze(input) {
    input = input || {};
    var q = input.qualitative || {};

    var price = num(input.price);
    var shares = num(input.sharesOutstanding);
    var epsTrailing = num(input.epsTrailing);
    var epsForward = num(input.epsForward);
    var cash = num(input.cash);
    var totalDebt = num(input.totalDebt);
    var totalLiabilities = num(input.totalLiabilities);
    var currentAssets = num(input.currentAssets);
    var currentLiabilities = num(input.currentLiabilities);
    var equity = num(input.shareholdersEquity);
    var dividendYield = num(input.dividendYield);
    var institutionalOwnership = num(input.institutionalOwnership);

    var epsHistory = series(input.epsHistory);
    var revenueHistory = series(input.revenueHistory);

    var epsCagr = cagr(epsHistory);
    var revenueCagr = cagr(revenueHistory);
    // An explicit growth rate wins; otherwise fall back to the EPS record.
    var growthRate = num(input.growthRate);
    var growthSource = growthRate !== null ? 'supplied'
      : epsCagr !== null ? 'EPS history (' + (epsHistory.length - 1) + '-yr CAGR)'
      : null;
    if (growthRate === null) growthRate = epsCagr;

    var marketCap = price !== null && shares !== null ? price * shares : null;
    var peRatio = epsTrailing !== null && epsTrailing > 0 ? div(price, epsTrailing) : null;
    var forwardPE = epsForward !== null && epsForward > 0 ? div(price, epsForward) : null;
    var peg = peRatio !== null && growthRate !== null && growthRate > 0 ? peRatio / growthRate : null;
    // Lynch's dividend-adjusted variant: (growth + yield) / P/E, where >1.5 is excellent.
    var lynchRatio = peRatio !== null && growthRate !== null
      ? (growthRate + (dividendYield || 0)) / peRatio : null;

    // Lynch's rule of thumb: a fairly priced company trades at a P/E equal to
    // its growth rate.
    var fairValuePE = growthRate !== null && growthRate > 0 ? growthRate : null;
    var fairValuePrice = fairValuePE !== null && epsTrailing !== null && epsTrailing > 0
      ? fairValuePE * epsTrailing : null;
    var upsidePct = fairValuePrice !== null && price ? ((fairValuePrice - price) / price) * 100 : null;

    var netCash = cash !== null && totalDebt !== null ? cash - totalDebt : null;
    var netCashLessTotalLiabilities = cash !== null && totalLiabilities !== null ? cash - totalLiabilities : null;
    var netLiquidAssets = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;
    var currentAssetsLessTotalLiabilities = currentAssets !== null && totalLiabilities !== null ? currentAssets - totalLiabilities : null;

    var m = {
      price: price,
      shares: shares,
      marketCap: marketCap,
      epsTrailing: epsTrailing,
      epsForward: epsForward,
      epsHistory: epsHistory,
      revenueHistory: revenueHistory,
      epsCagr: epsCagr,
      revenueCagr: revenueCagr,
      growthRate: growthRate,
      growthSource: growthSource,
      peRatio: peRatio,
      forwardPE: forwardPE,
      peg: peg,
      lynchRatio: lynchRatio,
      fairValuePE: fairValuePE,
      fairValuePrice: fairValuePrice,
      upsidePct: upsidePct,
      dividendYield: dividendYield,
      institutionalOwnership: institutionalOwnership,
      netCash: netCash,
      netCashPerShare: div(netCash, shares),
      netCashLessTotalLiabilities: netCashLessTotalLiabilities,
      netLiquidAssets: netLiquidAssets,
      currentAssetsLessTotalLiabilities: currentAssetsLessTotalLiabilities,
      debtToEquity: equity !== null && equity > 0 ? div(totalDebt, equity) : null,
      debtToCapital: totalDebt !== null && equity !== null && totalDebt + equity > 0
        ? totalDebt / (totalDebt + equity) : null,
      currentRatio: currentLiabilities !== null && currentLiabilities > 0
        ? div(currentAssets, currentLiabilities) : null,
      bookValuePerShare: div(equity, shares),
      priceToBook: equity !== null && equity > 0 && marketCap !== null ? marketCap / equity : null
    };

    var suggestion = classify(m);
    var categoryKey = input.category && CATEGORIES[input.category] ? input.category : suggestion.key;

    // Valuation dimension: PEG where earnings allow it, price-to-book otherwise.
    var valuation = pegScore(m.peg);
    var valuationBasis = 'PEG';
    if (valuation === null) {
      valuation = bookScore(m.priceToBook);
      valuationBasis = valuation === null ? 'unavailable' : 'Price/Book (no usable P/E)';
    }

    var suggestedFit = fitScore(categoryKey, m);
    var pick = function (supplied, computed) {
      var n = num(supplied);
      return n === null ? computed : clamp(n, 0, 10);
    };

    var dimensions = [
      { key: 'valuation', label: 'PEG attractiveness', basis: valuationBasis, score: valuation, auto: true },
      { key: 'story', label: 'Story clarity', basis: 'your judgment', score: pick(input.storyScore, null), auto: false },
      { key: 'consistency', label: 'Earnings consistency', basis: epsHistory.length >= 3 ? 'EPS history' : 'your judgment', score: pick(input.consistencyScore, consistencyScore(epsHistory)), auto: epsHistory.length >= 3 },
      { key: 'balance', label: 'Balance sheet health', basis: 'balance sheet', score: pick(input.balanceScore, balanceScore(m)), auto: true },
      { key: 'moat', label: 'Competitive moat', basis: 'your judgment', score: pick(input.moatScore, null), auto: false },
      { key: 'fit', label: 'Lynch category fit', basis: suggestedFit === null ? 'your judgment' : 'category profile', score: pick(input.fitScore, suggestedFit), auto: suggestedFit !== null }
    ];

    var scored = dimensions.filter(function (d) { return d.score !== null; });
    var rawTotal = scored.reduce(function (a, d) { return a + d.score; }, 0);
    // Unscored dimensions are extrapolated rather than counted as zero, so a
    // partially filled analysis is not automatically an "Avoid".
    var total = scored.length ? round((rawTotal / scored.length) * 6, 1) : null;
    var verdict = total === null ? null : verdictFor(total);

    var perShare = function (v) { return div(v, shares); };
    var pctOfPrice = function (v) {
      var ps = perShare(v);
      return ps === null || !price ? null : (ps / price) * 100;
    };
    var bsRow = function (label, formula, value) {
      return {
        label: label, formula: formula, total: value,
        perShare: perShare(value), pctOfPrice: pctOfPrice(value)
      };
    };

    return {
      ticker: (input.ticker || '').toUpperCase(),
      company: input.company || '',
      story: input.story || '',
      metrics: m,
      category: {
        key: categoryKey,
        label: CATEGORIES[categoryKey].label,
        traits: CATEGORIES[categoryKey].traits,
        playbook: CATEGORIES[categoryKey].playbook,
        suggestedKey: suggestion.key,
        suggestedLabel: CATEGORIES[suggestion.key].label,
        reason: suggestion.reason,
        overridden: categoryKey !== suggestion.key
      },
      scorecard: { dimensions: dimensions, total: total, max: 60, scoredCount: scored.length, verdict: verdict },
      flags: buildFlags(m, q),
      balanceSheet: [
        bsRow('Net cash − total liabilities', '(Cash + ST securities) − total liabilities', netCashLessTotalLiabilities),
        bsRow('Net cash', 'Cash + ST securities − total debt', netCash),
        bsRow('Net liquid assets', 'Current assets − current liabilities', netLiquidAssets),
        bsRow('Current assets − total liabilities', 'Current assets − total liabilities', currentAssetsLessTotalLiabilities)
      ]
    };
  }

  return {
    analyze: analyze,
    classify: classify,
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    VERDICTS: VERDICTS,
    verdictFor: verdictFor,
    scores: {
      peg: pegScore,
      book: bookScore,
      consistency: consistencyScore,
      balance: balanceScore,
      fit: fitScore
    },
    util: { num: num, series: series, cagr: cagr, yoy: yoy, interp: interp, clamp: clamp, round: round, stdev: stdev }
  };
});
