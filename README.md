# Silverflow

Silverflow is a personal-use Albion Online Black Market crafting intelligence dashboard designed for GitHub Pages. It compares crafting in the five Royal cities against crafting directly in Caerleon, includes resource-return economics, and ranks opportunities using profitability, liquidity, quote freshness, and available capital.

## V1 features

- Americas / Europe / Asia server toggle.
- T4.1–T4.4 default scan, with broader tier/category support from generated game data.
- Best Royal-city calculation by evaluating all five Royal cities.
- Separate Caerleon craft scenario to avoid finished-goods transport risk.
- Instant-buy vs buy-order material acquisition.
- Black Market sell-now vs list-order exits.
- Premium / non-Premium market taxes.
- No-focus and focus calculations side by side.
- Resource-return rate applied only to return-eligible recipe components.
- Conservative gross cash-required calculation for 50-item affordability filtering.
- 50, 100, and custom batch economics.
- 14-day average Black Market volume and freshness gating.
- Favorites / watchlist stored in `localStorage`.
- Manual server/city/buy-or-sell price overrides stored in `localStorage`.
- Adjustable effective station fee per crafted item (default 350 silver).
- Optional extra production-bonus input for known daily/event bonuses.

## Calculation model

For a recipe's return-eligible materials:

```text
resource return rate = total production bonus / (1 + total production bonus)
true material cost = gross materials - (return-eligible material value × RRR)
true craft cost = true material cost + buy-order setup + fixed recipe silver + station fee
```

The default production bonuses are:

- City base: +18%
- Matching city specialty: +15%
- Focus: +59%

Artifacts/tokens whose game data has `@maxreturnamount="0"` are marked non-returnable and are never discounted by RRR.

Sale-now uses the current Black Market highest buy order and transaction tax. Listed sales use the current lowest sell listing plus the 2.5% setup fee. Premium transaction tax is modeled at 4%; non-Premium at 8%.

## Data

Market prices and history come from the community-run [Albion Online Data Project](https://www.albion-online-data.com/). The full crafting catalog is generated from `ao-data/ao-bin-dumps` by `scripts/generate_catalog.py`.

Because AODP observations are populated when players load markets in game, Silverflow surfaces the timestamp of every pricing chain and rejects stale opportunities according to the configured max-age threshold.

`data/catalog.seed.json` contains a small fallback set based on the video examples. The GitHub Pages deployment workflow generates the complete current catalog before publishing.

## Local use

No package install or build step is required.

```bash
npm test
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

To generate the full current game catalog locally (internet required):

```bash
python3 scripts/generate_catalog.py
```

## GitHub Pages

`.github/workflows/pages.yml` is intentionally manual (`workflow_dispatch`) so deployment occurs only when explicitly requested. It regenerates the current catalog, runs the calculation tests, and deploys the static site.

The weekly data-refresh workflow is also included. Once the app is on the default branch, it regenerates `data/catalog.json` from current game dumps and commits only when the catalog changes.

## Disclaimer

Silverflow is an unofficial personal planning tool. Albion Online market data can be incomplete or stale. Validate high-value trades in game before committing capital.
