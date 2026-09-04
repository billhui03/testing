# Lynch Analysis

A small web app that scores a stock against Peter Lynch's framework: classify the
company, check the PEG, look at what the balance sheet is actually worth, and end
up with a scorecard out of 60 and a verdict.

You supply the numbers — the app fetches nothing. That is deliberate: Lynch's point
was that the work of reading the filings is the analysis, and typing in a dozen
figures from a 10-Q is a good forcing function.

## Running it

No build step and no dependencies. Open `index.html` in a browser:

```bash
open lynch-analysis/index.html          # macOS
xdg-open lynch-analysis/index.html      # Linux
```

Or serve it, if you prefer a real origin (localStorage then persists per host):

```bash
cd lynch-analysis && npm run serve       # http://localhost:8080
```

To produce a single self-contained HTML file (everything inlined, easy to email
or host):

```bash
cd lynch-analysis && npm run build       # -> dist/lynch-analysis.html
```

## Tests

The calculation engine is pure and separately tested:

```bash
cd lynch-analysis && npm test            # node --test, no dependencies
```

## What it computes

**Category.** Suggests one of Lynch's six buckets — slow grower, stalwart, fast
grower, cyclical, turnaround, asset play — from growth rate, market cap, yield,
earnings sign and the balance sheet. Cyclicals and asset plays usually need
business knowledge the numbers don't carry, so you can override the suggestion;
the app then tells you what it would have picked.

**Valuation.** Trailing and forward P/E, PEG, and Lynch's dividend-adjusted
variant `(growth + yield) / P/E`, where 1.5 and above is what he called
excellent. Fair value uses his rule of thumb that a fairly priced company trades
at a P/E equal to its growth rate, which gives a fair-value price and a gap to
the current one.

**Balance-sheet hidden value.** Four rows — net cash less total liabilities, net
cash, net liquid assets, and current assets less total liabilities — each as a
total, per share, and as a percentage of the share price. That last column is the
point: it says how much of what you are paying is backed by liquid value rather
than expectations. Negatives are shown, never hidden.

**Scorecard, six dimensions out of 10.** PEG attractiveness, story clarity,
earnings consistency, balance-sheet health, competitive moat, and category fit.
Four are scored from the data; story clarity and moat are your judgment, because
nothing in a spreadsheet can supply them. Dimensions the data can't reach are
extrapolated rather than counted as zero, so a half-filled form doesn't collapse
into an "Avoid". Totals map to Lynch's bands: 48+ strong, 36–47 watchlist,
24–35 caution, under 24 avoid.

**Flags.** Green and red flags are derived from what you entered — PEG under 1,
net cash as a share of price, institutional ownership under 40%, debt past 80% of
total capital, a current ratio under 1 — plus the qualitative signals Lynch
watched for and you tick by hand (boring name, unfollowed niche, insider buying,
hot stock in a hot industry, acquisition spree, whisper stock).

## Inputs

Dollar figures are in millions and share counts in millions, so per-share numbers
come out in dollars. Everything is optional: a blank field scores as unknown
rather than as zero.

| Field | Notes |
| --- | --- |
| Price, shares outstanding | Drives market cap and every per-share figure |
| Trailing / forward EPS | Trailing EPS drives P/E, PEG and fair value |
| EPS growth rate | Leave blank to take the CAGR from the EPS history |
| EPS / revenue history | Oldest first, comma separated; three or more years scores earnings consistency |
| Cash + ST securities, total debt | Net cash, and the balance-sheet rows |
| Current assets / liabilities, total liabilities, equity | Current ratio, debt-to-equity, hidden-value table |
| Dividend yield, institutional ownership | The dividend-adjusted PEG, and Lynch's under-ownership preference |

## Saving work

Analyses save to `localStorage` under a ticker, and the current form is kept as a
draft across reloads. "Copy report" puts a full Markdown write-up on the
clipboard; "Copy JSON" and "Import" move inputs between browsers or machines.
Nothing leaves the page.

## Files

| File | What it is |
| --- | --- |
| `lynch.js` | The engine: classification, metrics, scoring, flags. Pure functions, no DOM |
| `app.js` | Form, dashboard rendering, inline-SVG charts, storage |
| `styles.css` | Tokens and layout; light and dark |
| `index.html` | The page |
| `build-artifact.js` | Inlines everything into one file |
| `test/lynch.test.js` | Engine tests |

## A caveat

This applies a published framework to figures you type in. It verifies nothing,
fetches nothing, and is not investment advice — it is a structured way to think
about a company before deciding anything.
