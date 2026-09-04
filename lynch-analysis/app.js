/*
 * Lynch Analysis — UI layer.
 *
 * Builds the input form from a declarative field list, runs Lynch.analyze() on
 * every change, and renders the scorecard dashboard. No dependencies, no build
 * step: everything here is plain DOM and inline SVG.
 */
(function () {
  'use strict';

  var L = window.Lynch;
  var STORE_KEY = 'lynch-analysis:saved';
  var DRAFT_KEY = 'lynch-analysis:draft';
  var THEME_KEY = 'lynch-analysis:theme';

  // --------------------------------------------------------------- fields

  var FIELDS = [
    { group: 'Company', id: 'ticker', label: 'Ticker', type: 'text', placeholder: 'NGDC' },
    { group: 'Company', id: 'company', label: 'Company name', type: 'text', placeholder: 'Northgate Diner Co.' },
    {
      group: 'Company', id: 'category', label: 'Lynch category', type: 'select',
      options: [['', 'Auto-detect from the numbers']].concat(L.CATEGORY_KEYS.map(function (k) {
        return [k, L.CATEGORIES[k].label];
      })),
      hint: 'Cyclicals and asset plays need business knowledge — set those by hand.'
    },

    { group: 'Market', id: 'price', label: 'Share price ($)', type: 'number', step: '0.01', half: true },
    { group: 'Market', id: 'sharesOutstanding', label: 'Shares out (M)', type: 'number', step: '0.1', half: true },
    { group: 'Market', id: 'dividendYield', label: 'Dividend yield (%)', type: 'number', step: '0.01', half: true },
    { group: 'Market', id: 'institutionalOwnership', label: 'Institutional own. (%)', type: 'number', step: '1', half: true },

    { group: 'Earnings & growth', id: 'epsTrailing', label: 'Trailing EPS ($)', type: 'number', step: '0.01', half: true },
    { group: 'Earnings & growth', id: 'epsForward', label: 'Forward EPS ($)', type: 'number', step: '0.01', half: true },
    {
      group: 'Earnings & growth', id: 'growthRate', label: 'EPS growth rate (%)', type: 'number', step: '0.1',
      hint: 'Leave blank to derive the CAGR from the EPS history below.'
    },
    {
      group: 'Earnings & growth', id: 'epsHistory', label: 'EPS history (oldest first)', type: 'text',
      placeholder: '1.05, 1.30, 1.62, 2.00', hint: 'Three or more years scores earnings consistency automatically.'
    },
    {
      group: 'Earnings & growth', id: 'revenueHistory', label: 'Revenue history ($M, oldest first)', type: 'text',
      placeholder: '410, 505, 620, 760'
    },
    { group: 'Earnings & growth', id: 'startYear', label: 'First year of history', type: 'number', step: '1', placeholder: '2022' },

    { group: 'Balance sheet ($M)', id: 'cash', label: 'Cash + ST securities', type: 'number', step: '1', half: true },
    { group: 'Balance sheet ($M)', id: 'totalDebt', label: 'Total debt', type: 'number', step: '1', half: true },
    { group: 'Balance sheet ($M)', id: 'currentAssets', label: 'Current assets', type: 'number', step: '1', half: true },
    { group: 'Balance sheet ($M)', id: 'currentLiabilities', label: 'Current liabilities', type: 'number', step: '1', half: true },
    { group: 'Balance sheet ($M)', id: 'totalLiabilities', label: 'Total liabilities', type: 'number', step: '1', half: true },
    { group: 'Balance sheet ($M)', id: 'shareholdersEquity', label: "Shareholders' equity", type: 'number', step: '1', half: true },

    {
      group: 'The story', id: 'story', label: 'The story in three sentences', type: 'textarea',
      placeholder: 'What the company does, why earnings should grow, and what the market is missing.',
      hint: "Lynch's test: if you can't explain it in three sentences, you don't own it — you're gambling."
    }
  ];

  var SLIDERS = [
    { id: 'storyScore', label: 'Story clarity', auto: false },
    { id: 'moatScore', label: 'Competitive moat', auto: false },
    { id: 'consistencyScore', label: 'Earnings consistency', auto: true, dim: 'consistency' },
    { id: 'fitScore', label: 'Lynch category fit', auto: true, dim: 'fit' }
  ];

  var SIGNALS = [
    { id: 'boringName', tone: 'green', label: 'Boring name or boring business' },
    { id: 'niche', tone: 'green', label: 'Niche nobody follows' },
    { id: 'insiderBuying', tone: 'green', label: 'Insiders are buying' },
    { id: 'buybacks', tone: 'green', label: 'Company is buying back shares' },
    { id: 'replicable', tone: 'green', label: 'Growth story is replicable elsewhere' },
    { id: 'hotStock', tone: 'red', label: 'Hot stock in a hot industry' },
    { id: 'acquisitive', tone: 'red', label: 'Acquisition spree ("diworsification")' },
    { id: 'noRevenue', tone: 'red', label: 'Whisper stock — no meaningful revenue' },
    { id: 'dependentOnOneCustomer', tone: 'red', label: 'Depends on one large customer' }
  ];

  // A fictional company, so nothing here reads as real financial data.
  var EXAMPLE = {
    ticker: 'NGDC', company: 'Northgate Diner Co. (example)', category: '',
    price: '36', sharesOutstanding: '120', dividendYield: '0', institutionalOwnership: '31',
    epsTrailing: '2.00', epsForward: '2.45', growthRate: '24',
    epsHistory: '1.05, 1.30, 1.62, 2.00', revenueHistory: '410, 505, 620, 760', startYear: '2022',
    cash: '480', totalDebt: '90', currentAssets: '700', currentLiabilities: '300',
    totalLiabilities: '640', shareholdersEquity: '1100',
    story: 'A 240-restaurant diner chain that has quietly worked out how to open in small Midwestern towns nobody else wants. Each new location pays back its build cost in under two years, and there is room for roughly 900 of them. The market prices it like a restaurant business rather than the store-rollout machine it actually is.',
    storyScore: '8', moatScore: '6', storyScoreAuto: false, moatScoreAuto: false,
    consistencyScoreAuto: true, fitScoreAuto: true,
    signals: { boringName: true, niche: true, replicable: true, insiderBuying: true }
  };

  // ---------------------------------------------------------- formatting

  function fmtNum(v, dp) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function money(v, dp) {
    if (v === null || !Number.isFinite(v)) return '—';
    return (v < 0 ? '−$' : '$') + fmtNum(Math.abs(v), dp === undefined ? 2 : dp);
  }
  /** $M in, human-scaled string out. */
  function moneyM(v) {
    if (v === null || !Number.isFinite(v)) return '—';
    var sign = v < 0 ? '−' : '', a = Math.abs(v);
    if (a >= 1000) return sign + '$' + fmtNum(a / 1000, 2) + 'B';
    return sign + '$' + fmtNum(a, 0) + 'M';
  }
  function pct(v, dp) {
    if (v === null || !Number.isFinite(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v), dp === undefined ? 1 : dp) + '%';
  }
  function plainPct(v, dp) {
    if (v === null || !Number.isFinite(v)) return '—';
    return fmtNum(v, dp === undefined ? 1 : dp) + '%';
  }
  function ratio(v, dp) {
    if (v === null || !Number.isFinite(v)) return '—';
    return fmtNum(v, dp === undefined ? 2 : dp);
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toneFor(score) {
    if (score === null) return 'none';
    return score >= 7 ? 'good' : score >= 4 ? 'ok' : 'bad';
  }

  // ------------------------------------------------------------ form build

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function buildForm(form) {
    var groups = [];
    FIELDS.forEach(function (f) {
      if (groups.indexOf(f.group) < 0) groups.push(f.group);
    });

    groups.forEach(function (group) {
      var fs = el('fieldset');
      fs.appendChild(el('legend', {}, esc(group)));
      var pending = null;

      FIELDS.filter(function (f) { return f.group === group; }).forEach(function (f) {
        var wrap = el('div', { class: 'field' });
        wrap.appendChild(el('label', { for: f.id }, esc(f.label)));

        var input;
        if (f.type === 'select') {
          input = el('select', { id: f.id, name: f.id });
          f.options.forEach(function (o) {
            input.appendChild(el('option', { value: o[0] }, esc(o[1])));
          });
        } else if (f.type === 'textarea') {
          input = el('textarea', { id: f.id, name: f.id, rows: '4', placeholder: f.placeholder || '' });
        } else {
          input = el('input', {
            id: f.id, name: f.id, type: f.type === 'number' ? 'number' : 'text',
            placeholder: f.placeholder || '', autocomplete: 'off'
          });
          if (f.step) input.setAttribute('step', f.step);
        }
        wrap.appendChild(input);
        if (f.hint) wrap.appendChild(el('span', { class: 'hint' }, esc(f.hint)));

        // Half-width fields pair up into a two-column row.
        if (f.half) {
          if (!pending) {
            pending = el('div', { class: 'row2' });
            fs.appendChild(pending);
          }
          pending.appendChild(wrap);
          if (pending.children.length === 2) pending = null;
        } else {
          pending = null;
          fs.appendChild(wrap);
        }
      });
      form.appendChild(fs);
    });

    // Judgment sliders
    var judg = el('fieldset');
    judg.appendChild(el('legend', {}, 'Judgment (0–10)'));
    SLIDERS.forEach(function (s) {
      var wrap = el('div', { class: 'field' });
      wrap.appendChild(el('label', { for: s.id }, esc(s.label)));
      var row = el('div', { class: 'slider' });
      row.innerHTML =
        '<input type="range" id="' + s.id + '" name="' + s.id + '" min="0" max="10" step="0.5" value="5">' +
        '<output id="' + s.id + 'Out">5</output>' +
        (s.auto
          ? '<label class="auto-badge"><input type="checkbox" id="' + s.id + 'Auto" checked> score this from the data</label>'
          : '<span class="auto-badge">Your call — Lynch scored these himself.</span>');
      wrap.appendChild(row);
      judg.appendChild(wrap);
    });
    form.appendChild(judg);

    // Qualitative signals
    var sig = el('fieldset');
    sig.appendChild(el('legend', {}, 'Signals'));
    SIGNALS.forEach(function (s) {
      var lab = el('label', { class: 'check' + (s.tone === 'red' ? ' red' : '') });
      lab.innerHTML = '<input type="checkbox" id="sig_' + s.id + '" name="sig_' + s.id + '"><span>' + esc(s.label) + '</span>';
      sig.appendChild(lab);
    });
    form.appendChild(sig);
  }

  // ------------------------------------------------------- read / write form

  function readForm() {
    var state = { signals: {} };
    FIELDS.forEach(function (f) {
      var node = document.getElementById(f.id);
      state[f.id] = node ? node.value : '';
    });
    SLIDERS.forEach(function (s) {
      state[s.id] = document.getElementById(s.id).value;
      var auto = document.getElementById(s.id + 'Auto');
      state[s.id + 'Auto'] = auto ? auto.checked : false;
    });
    SIGNALS.forEach(function (s) {
      state.signals[s.id] = document.getElementById('sig_' + s.id).checked;
    });
    return state;
  }

  function writeForm(state) {
    state = state || {};
    FIELDS.forEach(function (f) {
      var node = document.getElementById(f.id);
      if (node) node.value = state[f.id] === undefined || state[f.id] === null ? '' : state[f.id];
    });
    SLIDERS.forEach(function (s) {
      var node = document.getElementById(s.id);
      node.value = state[s.id] === undefined ? 5 : state[s.id];
      document.getElementById(s.id + 'Out').textContent = node.value;
      var auto = document.getElementById(s.id + 'Auto');
      if (auto) auto.checked = state[s.id + 'Auto'] !== false;
    });
    SIGNALS.forEach(function (s) {
      document.getElementById('sig_' + s.id).checked = !!(state.signals && state.signals[s.id]);
    });
  }

  /** Turn raw form state into the shape Lynch.analyze() expects. */
  function toAnalysisInput(state) {
    var input = {
      ticker: state.ticker, company: state.company, category: state.category, story: state.story,
      price: state.price, sharesOutstanding: state.sharesOutstanding,
      dividendYield: state.dividendYield, institutionalOwnership: state.institutionalOwnership,
      epsTrailing: state.epsTrailing, epsForward: state.epsForward, growthRate: state.growthRate,
      epsHistory: state.epsHistory, revenueHistory: state.revenueHistory,
      cash: state.cash, totalDebt: state.totalDebt, totalLiabilities: state.totalLiabilities,
      currentAssets: state.currentAssets, currentLiabilities: state.currentLiabilities,
      shareholdersEquity: state.shareholdersEquity,
      qualitative: state.signals || {}
    };
    SLIDERS.forEach(function (s) {
      // "Auto" sliders only send a value when the user takes the wheel.
      if (!s.auto || state[s.id + 'Auto'] === false) input[s.id] = state[s.id];
    });
    return input;
  }

  // ---------------------------------------------------------------- charts

  /** Small SVG bar chart. values are plain numbers; labels line up beneath. */
  function barChart(values, labels, format, color) {
    if (!values.length) return '<p class="sub">No history entered.</p>';
    var W = 520, H = 150, padL = 6, padB = 26, padT = 22;
    var n = values.length;
    var slot = (W - padL * 2) / n;
    var bw = Math.min(64, slot * 0.62);
    var max = Math.max.apply(null, values.concat([0]));
    var min = Math.min.apply(null, values.concat([0]));
    var span = (max - min) || 1;
    var zeroY = padT + ((max - 0) / span) * (H - padT - padB);

    var bars = values.map(function (v, i) {
      var x = padL + slot * i + (slot - bw) / 2;
      var y = padT + ((max - Math.max(v, 0)) / span) * (H - padT - padB);
      var h = Math.max(2, Math.abs(v) / span * (H - padT - padB));
      var labelY = v >= 0 ? y - 6 : y + h + 13;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="3" fill="' + color + '"></rect>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + labelY.toFixed(1) +
        '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75">' + esc(format(v)) + '</text>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) +
        '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.5">' + esc(labels[i] || '') + '</text>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-hidden="true" style="width:100%;height:auto">' +
      '<line x1="0" y1="' + zeroY.toFixed(1) + '" x2="' + W + '" y2="' + zeroY.toFixed(1) +
      '" stroke="currentColor" stroke-opacity="0.18"></line>' + bars + '</svg>';
  }

  /** PEG scale from 0 to 3 with a needle at the current value. */
  function pegGauge(peg) {
    var W = 520, H = 74, padL = 8, padR = 8, trackY = 30, trackH = 12;
    var usable = W - padL - padR;
    var at = function (v) { return padL + Math.min(v, 3) / 3 * usable; };
    var bands = [
      [0, 1, 'var(--green)', 'cheap'],
      [1, 1.5, 'var(--amber)', 'fair'],
      [1.5, 3, 'var(--red)', 'expensive']
    ].map(function (b) {
      return '<rect x="' + at(b[0]).toFixed(1) + '" y="' + trackY + '" width="' + (at(b[1]) - at(b[0])).toFixed(1) +
        '" height="' + trackH + '" fill="' + b[2] + '" opacity="0.30"></rect>' +
        '<text x="' + ((at(b[0]) + at(b[1])) / 2).toFixed(1) + '" y="' + (trackY - 8) +
        '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">' + b[3] + '</text>';
    }).join('');

    var ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3].map(function (t) {
      return '<text x="' + at(t).toFixed(1) + '" y="' + (trackY + trackH + 16) +
        '" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.45">' + t + '</text>';
    }).join('');

    var needle = '';
    if (peg !== null && Number.isFinite(peg) && peg > 0) {
      var x = at(peg);
      var color = peg <= 1 ? 'var(--green)' : peg <= 1.5 ? 'var(--amber)' : 'var(--red)';
      needle =
        '<polygon points="' + (x - 5).toFixed(1) + ',' + (trackY - 2) + ' ' + (x + 5).toFixed(1) + ',' + (trackY - 2) +
        ' ' + x.toFixed(1) + ',' + (trackY + 5) + '" fill="' + color + '"></polygon>' +
        '<rect x="' + (x - 1.5).toFixed(1) + '" y="' + trackY + '" width="3" height="' + trackH + '" fill="' + color + '"></rect>' +
        (peg > 3 ? '<text x="' + (W - padR).toFixed(1) + '" y="' + (trackY - 8) +
          '" text-anchor="end" font-size="10" fill="var(--red)">off scale</text>' : '');
    }

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-hidden="true" style="width:100%;height:auto">' +
      bands + ticks + needle + '</svg>';
  }

  // ------------------------------------------------------------- rendering

  function yearLabels(startYear, n) {
    var y = L.util.num(startYear);
    var out = [];
    for (var i = 0; i < n; i++) out.push(y === null ? 'Y' + (i + 1) : String(y + i));
    return out;
  }

  function renderHero(r) {
    var m = r.metrics, v = r.scorecard.verdict;
    var catBadge = '<span class="badge cat">' + esc(r.category.label) + '</span>' +
      (r.category.overridden ? ' <span class="sub">(auto-detect said ' + esc(r.category.suggestedLabel) + ')</span>' : '');

    return '<div class="card raised hero">' +
      '<div>' +
        '<div class="ident">' +
          '<span class="ticker">' + esc(r.ticker || '—') + '</span>' +
          '<span class="name">' + esc(r.company || 'Unnamed company') + '</span>' +
        '</div>' +
        '<div style="margin-top:8px">' + catBadge + '</div>' +
        '<div class="meta">' +
          '<span>Price <b>' + money(m.price) + '</b></span>' +
          '<span>Market cap <b>' + moneyM(m.marketCap) + '</b></span>' +
          '<span>P/E <b>' + ratio(m.peRatio, 1) + '</b></span>' +
          '<span>Growth <b>' + plainPct(m.growthRate) + '</b></span>' +
          (m.dividendYield ? '<span>Yield <b>' + plainPct(m.dividendYield) + '</b></span>' : '') +
        '</div>' +
        '<div class="sub" style="margin-top:8px">' + esc(r.category.reason) + '</div>' +
      '</div>' +
      '<div class="verdict">' +
        (v
          ? '<div class="score tone-' + v.tone + '">' + fmtNum(r.scorecard.total, 1) + '<small> / 60</small></div>' +
            '<div class="label tone-' + v.tone + '">' + esc(v.label) + '</div>' +
            '<div class="note">' + esc(v.note) + '</div>' +
            (r.scorecard.scoredCount < 6
              ? '<div class="note">Extrapolated from ' + r.scorecard.scoredCount + ' of 6 dimensions.</div>' : '')
          : '<div class="score" style="color:var(--faint)">—<small> / 60</small></div>' +
            '<div class="note">Enter a price and earnings to score.</div>') +
      '</div>' +
    '</div>';
  }

  function renderScorecard(r) {
    var rows = r.scorecard.dimensions.map(function (d) {
      var w = d.score === null ? 100 : (d.score / 10) * 100;
      return '<div class="bar-row">' +
        '<div class="bar-head">' +
          '<span>' + esc(d.label) + ' <span class="basis">' + esc(d.basis) + '</span></span>' +
          '<span class="val tone-' + toneFor(d.score) + '">' + (d.score === null ? 'n/a' : fmtNum(d.score, 1) + ' / 10') + '</span>' +
        '</div>' +
        '<div class="track"><div class="fill ' + toneFor(d.score) + '" style="width:' + w + '%"></div></div>' +
      '</div>';
    }).join('');

    return '<div class="card"><h2>Lynch scorecard</h2><div class="bars">' + rows + '</div>' +
      '<p class="sub" style="margin:12px 0 0">48–60 strong · 36–47 watchlist · 24–35 caution · under 24 avoid.' +
      ' Dimensions marked <em>your judgment</em> come from the sliders, not the data.</p></div>';
  }

  function renderMetrics(r) {
    var m = r.metrics;
    var pegTone = m.peg === null ? '' : m.peg <= 1 ? 'tone-good' : m.peg <= 1.5 ? 'tone-warn' : 'tone-bad';
    var upTone = m.upsidePct === null ? '' : m.upsidePct > 0 ? 'tone-good' : 'tone-bad';
    var cashTone = m.netCashPerShare === null ? '' : m.netCashPerShare > 0 ? 'tone-good' : 'tone-bad';

    var stat = function (k, v, d, tone) {
      return '<div class="stat"><div class="k">' + esc(k) + '</div>' +
        '<div class="v ' + (tone || '') + '">' + v + '</div>' +
        '<div class="d">' + esc(d) + '</div></div>';
    };

    return '<div class="card"><h2>Key Lynch metrics</h2><div class="stats">' +
      stat('PEG ratio', ratio(m.peg), m.peg === null ? 'Needs positive EPS and growth' : 'P/E ÷ growth rate — Lynch wanted ≤ 1', pegTone) +
      stat('EPS growth', plainPct(m.growthRate), m.growthSource ? 'Source: ' + m.growthSource : 'Not supplied') +
      stat('Lynch fair value', money(m.fairValuePrice),
        m.fairValuePrice === null ? 'Fair P/E = growth rate' : 'At a P/E of ' + ratio(m.fairValuePE, 0) + ' — ' + pct(m.upsidePct, 0) + ' vs price', upTone) +
      stat('Net cash / share', money(m.netCashPerShare),
        m.netCashPerShare !== null && m.price ? plainPct((m.netCashPerShare / m.price) * 100, 0) + ' of the share price' : 'Cash + ST securities − debt', cashTone) +
      stat('(Growth + yield) ÷ P/E', ratio(m.lynchRatio),
        m.lynchRatio === null ? "Lynch's dividend-adjusted test" : m.lynchRatio >= 1.5 ? 'Excellent (≥ 1.5)' : m.lynchRatio >= 1 ? 'Acceptable' : 'Poor (< 1)',
        m.lynchRatio === null ? '' : m.lynchRatio >= 1.5 ? 'tone-good' : m.lynchRatio >= 1 ? 'tone-warn' : 'tone-bad') +
      stat('Debt to equity', ratio(m.debtToEquity),
        m.debtToCapital === null ? 'Total debt ÷ equity' : plainPct(m.debtToCapital * 100, 0) + ' of total capital',
        m.debtToEquity === null ? '' : m.debtToEquity < 0.5 ? 'tone-good' : m.debtToEquity < 1.5 ? 'tone-warn' : 'tone-bad') +
      stat('Current ratio', ratio(m.currentRatio),
        'Current assets ÷ current liabilities',
        m.currentRatio === null ? '' : m.currentRatio >= 2 ? 'tone-good' : m.currentRatio >= 1 ? 'tone-warn' : 'tone-bad') +
      stat('Forward P/E', ratio(m.forwardPE, 1), m.epsForward ? 'On forward EPS of ' + money(m.epsForward) : 'Enter a forward EPS estimate') +
      '</div></div>';
  }

  function renderPeg(r) {
    var m = r.metrics;
    var verdict = m.peg === null
      ? 'No PEG available — that needs positive trailing earnings and a growth rate.'
      : m.peg <= 0.5 ? 'At ' + ratio(m.peg) + ' you are paying well under half a point of P/E per point of growth. Lynch went hunting here.'
      : m.peg <= 1 ? 'At ' + ratio(m.peg) + ' the stock clears Lynch’s primary filter: the P/E sits below the growth rate.'
      : m.peg <= 1.5 ? 'At ' + ratio(m.peg) + ' you are paying a premium to growth. Tolerable if the growth is durable, not if it is one good year.'
      : 'At ' + ratio(m.peg) + ' the price already assumes growth the company has not delivered. Lynch called this paying twice.';

    return '<div class="card"><h2>PEG in context</h2>' + pegGauge(m.peg) +
      '<p class="sub" style="margin:10px 0 0">' + esc(verdict) + '</p></div>';
  }

  function renderBalanceSheet(r) {
    var m = r.metrics;
    var rows = r.balanceSheet.map(function (row) {
      var tone = row.pctOfPrice === null ? '' : row.pctOfPrice >= 10 ? 'tone-good' : row.pctOfPrice > 0 ? 'tone-warn' : 'tone-bad';
      return '<tr>' +
        '<td>' + esc(row.label) + '<span class="formula">' + esc(row.formula) + '</span></td>' +
        '<td class="num">' + moneyM(row.total) + '</td>' +
        '<td class="num">' + money(row.perShare) + '</td>' +
        '<td class="num ' + tone + '">' + pct(row.pctOfPrice) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card"><h2>Balance-sheet hidden value</h2>' +
      '<div class="scroll-x"><table><thead><tr>' +
      '<th>Metric</th><th>Total</th><th>Per share</th><th>% of price</th>' +
      '</tr></thead><tbody>' + rows +
      '<tr class="anchor"><td>Share price</td><td class="num">—</td><td class="num">' + money(m.price) + '</td><td class="num">100%</td></tr>' +
      '</tbody></table></div>' +
      '<p class="sub" style="margin:10px 0 0">How much of the price is backed by liquid value rather than expectations. ' +
      'Positive net cash net of every liability is a genuine asset play; deeply negative means the earnings story carries the stock alone.</p></div>';
  }

  function renderGrowth(r, state) {
    var m = r.metrics;
    var rev = m.revenueHistory, eps = m.epsHistory;
    var revLabels = yearLabels(state.startYear, rev.length);
    var epsLabels = yearLabels(state.startYear, eps.length);

    return '<div class="card"><h2>Earnings &amp; revenue record</h2>' +
      '<div class="grid2">' +
        '<div><div class="sub" style="margin-bottom:6px">Revenue ($M)' +
          (m.revenueCagr !== null ? ' · ' + plainPct(m.revenueCagr) + ' CAGR' : '') + '</div>' +
          barChart(rev, revLabels, function (v) { return moneyM(v); }, 'var(--blue)') + '</div>' +
        '<div><div class="sub" style="margin-bottom:6px">EPS ($)' +
          (m.epsCagr !== null ? ' · ' + plainPct(m.epsCagr) + ' CAGR' : '') + '</div>' +
          barChart(eps, epsLabels, function (v) { return money(v); }, 'var(--green)') + '</div>' +
      '</div>' +
      '<p class="sub" style="margin:10px 0 0">Price follows earnings. Lynch wanted the two bars growing together — ' +
      'revenue without earnings is a story, earnings without revenue is cost-cutting that eventually runs out.</p></div>';
  }

  function renderStory(r) {
    var body = r.story
      ? r.story.split(/\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('')
      : '<p class="placeholder">Write the three-sentence story in the panel. If you cannot, Lynch would say you do not own the stock — you are gambling on it.</p>';
    return '<div class="card plain prose"><h2>The story in three sentences</h2>' + body + '</div>';
  }

  function renderFlags(r) {
    var list = function (items, cls, empty) {
      return items.length
        ? '<ul class="' + cls + '">' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'
        : '<p class="empty">' + esc(empty) + '</p>';
    };
    return '<div class="card"><h2>Green flags &amp; red flags</h2><div class="flags">' +
      '<div><h3 class="tone-good">Green flags</h3>' + list(r.flags.green, 'green', 'Nothing Lynch would call a positive yet.') + '</div>' +
      '<div><h3 class="tone-bad">Red flags</h3>' + list(r.flags.red, 'red', 'No red flags detected in what you entered.') + '</div>' +
      '</div></div>';
  }

  function renderPlaybook(r) {
    return '<div class="card plain prose"><h2>Category playbook — ' + esc(r.category.label) + '</h2>' +
      '<p>' + esc(r.category.traits) + '</p>' +
      '<p>' + esc(r.category.playbook) + '</p></div>';
  }

  function render(r, state) {
    $('#dash').innerHTML =
      renderHero(r) +
      '<div class="grid2">' + renderScorecard(r) + renderPeg(r) + '</div>' +
      renderMetrics(r) +
      renderBalanceSheet(r) +
      renderGrowth(r, state) +
      renderStory(r) +
      renderFlags(r) +
      renderPlaybook(r) +
      '<p class="disclaimer">This tool applies Peter Lynch’s published framework to numbers you enter yourself. ' +
      'It fetches nothing, verifies nothing, and is not investment advice — it is a structured way to think about a company before you decide.</p>';
  }

  // ------------------------------------------------------- markdown export

  function toMarkdown(r, state) {
    var m = r.metrics, out = [];
    out.push('# Lynch analysis — ' + (r.ticker || '?') + (r.company ? ' (' + r.company + ')' : ''));
    out.push('');
    out.push('**Category:** ' + r.category.label + (r.category.overridden ? ' (auto-detect suggested ' + r.category.suggestedLabel + ')' : ''));
    if (r.scorecard.verdict) {
      out.push('**Lynch score:** ' + fmtNum(r.scorecard.total, 1) + ' / 60 — ' + r.scorecard.verdict.label);
    }
    out.push('');
    out.push('## The story');
    out.push(r.story || '_Not written._');
    out.push('');
    out.push('## Key metrics');
    out.push('');
    out.push('| Metric | Value |');
    out.push('| --- | --- |');
    [['Price', money(m.price)], ['Market cap', moneyM(m.marketCap)], ['Trailing P/E', ratio(m.peRatio, 1)],
     ['Forward P/E', ratio(m.forwardPE, 1)], ['EPS growth', plainPct(m.growthRate)], ['PEG ratio', ratio(m.peg)],
     ['(Growth + yield) ÷ P/E', ratio(m.lynchRatio)], ['Lynch fair-value P/E', ratio(m.fairValuePE, 0)],
     ['Lynch fair-value price', money(m.fairValuePrice)], ['Upside to fair value', pct(m.upsidePct)],
     ['Net cash', moneyM(m.netCash)], ['Net cash / share', money(m.netCashPerShare)],
     ['Debt to equity', ratio(m.debtToEquity)], ['Current ratio', ratio(m.currentRatio)]
    ].forEach(function (row) { out.push('| ' + row[0] + ' | ' + row[1] + ' |'); });
    out.push('');
    out.push('## Scorecard');
    out.push('');
    out.push('| Dimension | Score | Basis |');
    out.push('| --- | --- | --- |');
    r.scorecard.dimensions.forEach(function (d) {
      out.push('| ' + d.label + ' | ' + (d.score === null ? 'n/a' : fmtNum(d.score, 1) + ' / 10') + ' | ' + d.basis + ' |');
    });
    out.push('');
    out.push('## Balance-sheet hidden value');
    out.push('');
    out.push('| Metric | Total | Per share | % of price |');
    out.push('| --- | --- | --- | --- |');
    r.balanceSheet.forEach(function (row) {
      out.push('| ' + row.label + ' | ' + moneyM(row.total) + ' | ' + money(row.perShare) + ' | ' + pct(row.pctOfPrice) + ' |');
    });
    out.push('| **Share price** | — | **' + money(m.price) + '** | **100%** |');
    out.push('');
    out.push('## Green flags');
    out.push(r.flags.green.length ? r.flags.green.map(function (f) { return '- ' + f; }).join('\n') : '- None found.');
    out.push('');
    out.push('## Red flags');
    out.push(r.flags.red.length ? r.flags.red.map(function (f) { return '- ' + f; }).join('\n') : '- None found.');
    out.push('');
    out.push('## Playbook — ' + r.category.label);
    out.push(r.category.playbook);
    out.push('');
    out.push('_Generated from figures entered by hand. Not investment advice._');
    return out.join('\n');
  }

  // ---------------------------------------------------------- persistence

  function storage() {
    try {
      var t = '__lynch__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (e) {
      return null; // private windows, blocked site data, thumbnail capture
    }
  }

  function loadSaved() {
    var s = storage();
    if (!s) return {};
    try { return JSON.parse(s.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
  }

  function writeSaved(all) {
    var s = storage();
    if (!s) return false;
    try { s.setItem(STORE_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }

  function renderSaved() {
    var all = loadSaved();
    var keys = Object.keys(all).sort();
    var host = $('#savedList');
    if (!keys.length) {
      host.innerHTML = '<p class="sub">Nothing saved yet.</p>';
      return;
    }
    host.innerHTML = keys.map(function (k) {
      var entry = all[k];
      return '<div class="saved-item">' +
        '<span class="who">' + esc(k) + '</span>' +
        '<span class="sc">' + (entry.score === null || entry.score === undefined ? '—' : fmtNum(entry.score, 1)) + '</span>' +
        '<button class="btn" data-load="' + esc(k) + '">Load</button>' +
        '<button class="btn ghost" data-del="' + esc(k) + '" aria-label="Delete ' + esc(k) + '">✕</button>' +
      '</div>';
    }).join('');
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) done(); else toast('Copy blocked — select the text manually.');
  }

  // ----------------------------------------------------------------- theme

  function applyTheme(mode) {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    var s = storage();
    if (s) { try { s.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ } }
    $('#themeBtn').textContent = mode === 'system' ? 'Theme: auto' : mode === 'dark' ? 'Theme: dark' : 'Theme: light';
  }

  function initTheme() {
    var s = storage(), mode = 'system';
    if (s) { try { mode = s.getItem(THEME_KEY) || 'system'; } catch (e) { /* ignore */ } }
    applyTheme(mode);
    $('#themeBtn').addEventListener('click', function () {
      var order = ['system', 'light', 'dark'];
      var current = document.documentElement.getAttribute('data-theme') || 'system';
      applyTheme(order[(order.indexOf(current) + 1) % order.length]);
    });
  }

  // ------------------------------------------------------------------ boot

  var current = null; // { result, state }

  function update() {
    var state = readForm();
    var result = L.analyze(toAnalysisInput(state));
    current = { result: result, state: state };

    // Auto sliders mirror the computed score so the panel and dashboard agree.
    SLIDERS.forEach(function (s) {
      var auto = document.getElementById(s.id + 'Auto');
      var range = document.getElementById(s.id);
      var out = document.getElementById(s.id + 'Out');
      if (auto) {
        range.disabled = auto.checked;
        if (auto.checked) {
          var dim = result.scorecard.dimensions.find(function (d) { return d.key === s.dim; });
          var score = dim ? dim.score : null;
          if (score !== null) range.value = score;
          out.textContent = score === null ? 'n/a' : fmtNum(score, 1);
          return;
        }
      }
      out.textContent = fmtNum(parseFloat(range.value), 1);
    });

    render(result, state);

    var s = storage();
    if (s) { try { s.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* quota, private mode */ } }
  }

  function init() {
    buildForm($('#form'));

    var draft = null, s = storage();
    if (s) { try { draft = JSON.parse(s.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; } }
    writeForm(draft || EXAMPLE);

    $('#form').addEventListener('input', update);
    $('#form').addEventListener('change', update);
    $('#form').addEventListener('submit', function (e) { e.preventDefault(); });

    $('#exampleBtn').addEventListener('click', function () {
      writeForm(EXAMPLE);
      update();
      toast('Loaded the example company');
    });

    $('#clearBtn').addEventListener('click', function () {
      writeForm({ storyScoreAuto: false, moatScoreAuto: false, consistencyScoreAuto: true, fitScoreAuto: true });
      update();
      toast('Cleared');
    });

    $('#saveBtn').addEventListener('click', function () {
      var key = (current.state.ticker || current.state.company || '').trim().toUpperCase();
      if (!key) { toast('Add a ticker or company name first'); return; }
      var all = loadSaved();
      all[key] = { savedAt: new Date().toISOString(), score: current.result.scorecard.total, state: current.state };
      if (writeSaved(all)) { renderSaved(); toast('Saved ' + key); }
      else toast('Storage unavailable in this browser context');
    });

    $('#savedList').addEventListener('click', function (e) {
      var loadKey = e.target.getAttribute('data-load');
      var delKey = e.target.getAttribute('data-del');
      var all = loadSaved();
      if (loadKey && all[loadKey]) {
        writeForm(all[loadKey].state);
        update();
        toast('Loaded ' + loadKey);
      } else if (delKey) {
        delete all[delKey];
        writeSaved(all);
        renderSaved();
        toast('Deleted ' + delKey);
      }
    });

    $('#reportBtn').addEventListener('click', function () {
      copyText(toMarkdown(current.result, current.state), 'Report copied as Markdown');
    });

    $('#jsonBtn').addEventListener('click', function () {
      copyText(JSON.stringify(current.state, null, 2), 'Inputs copied as JSON');
    });

    $('#importBtn').addEventListener('click', function () {
      var box = $('#importBox');
      box.hidden = !box.hidden;
      if (!box.hidden) $('#importText').focus();
    });

    $('#importGo').addEventListener('click', function () {
      try {
        var state = JSON.parse($('#importText').value);
        writeForm(state);
        update();
        $('#importBox').hidden = true;
        $('#importText').value = '';
        toast('Imported');
      } catch (e) {
        toast('That is not valid JSON');
      }
    });

    $('#printBtn').addEventListener('click', function () { window.print(); });

    initTheme();
    renderSaved();
    update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
