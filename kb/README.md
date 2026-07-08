# kb/ — the Everlane local-market knowledge base (public tree)

This tree IS the product the content engine builds (engagement #149, plan §3a). The site's guide
and neighborhood pages are its public surface; the concierge (wave 3) and the broker's own client
conversations are its other two consumers. **The concierge speaks ONLY from this tree + the
listings mirror** — compliance is enforced by what the bot can see, not by prompt hope.

## The two-tree contract (do not violate)

| Tree | Home | Holds |
|---|---|---|
| **Public KB (this tree)** | this repo, `kb/` | publishable distillate only — versioned, PR-gated, built into pages by Eleventy |
| Research substrate | the firm's knowledge home (`~/Projects/knowledge`, area-everlane-realty) | source PDFs, deep research, interview notes — never in this repo |
| Structured market data | Supabase (`listings`, `market_stats`) | ALL market numbers. Never in kb/ markdown. |

**This repo is public. Nothing lands in `kb/` that isn't publishable.**

## Layout

```
kb/
  guides/<slug>.md         one entry per guide (status: live | outline)
  neighborhoods/<slug>.md  one entry per neighborhood chapter
  facts/<domain>.yaml      atomic verified facts (flood, insurance, str-rules, …)
```

## Page entry schema (guides + neighborhoods, front matter)

```yaml
slug: flood-zones-insurance-st-pete   # = filename; page URL segment
type: guide | neighborhood
status: live | outline    # live → Eleventy builds the page; outline → listed as
                          # coming-soon only (an outline is a sourcing plan, not prose)
title: …                  # page H1
question: …               # the head query the page answers (question-phrased, AEO)
description: …            # meta description / card text
eyebrow: …                # kicker line above the H1
author: Serge Osaulenko   # named human author — E-E-A-T, required on live entries
published: 2026-07-07     # first publish date (live entries)
last_verified: 2026-07-07 # visible on-page stamp; re-checked quarterly
review: quarterly         # re-verification cadence
order: 1                  # sort position on index pages
sources:                  # required non-empty on live entries
  - id: short-key
    name: Human-readable source name
    url: https://…
    accessed: 2026-07-07
# neighborhoods add:
chapter: 1                # "The neighborhoods · Chapter NN"
stat_geo: old-northeast   # market_stats geo key the feed mirror fills (wave-2 lane a)
flood_summary: …          # the flood box paragraph (sourced, honest)
plate_note: …             # photo-placeholder caption
```

The markdown body is the narrative. Question-phrased `##` headings; every factual claim carries
an inline source + date or does not ship; confidence labels (HIGH/MEDIUM) stay in the text where
a reader benefits from honesty about model estimates vs. primary records.

## Fact entry schema (`facts/<domain>.yaml`)

```yaml
domain: flood
updated: 2026-07-07
review: quarterly
facts:
  - id: unique-key
    value: the fact, stated plainly
    source: primary source name
    source_url: https://…
    as_of: 2026-03-04        # the date the SOURCE speaks to
    last_verified: 2026-07-07 # when WE last confirmed it
    confidence: HIGH | MEDIUM | LOW
    notes: caveats, re-verification pointers
```

`scripts/kb-lint.mjs` (runs in `npm run check`) fails the build if any fact misses
value/source/last_verified, if a live page misses author/sources/last_verified, or if any entry
trips the fair-housing copy patterns.

## Bound editorial rules

1. **Fair housing (chassis rule, bound 2026-07-07):** every entry describes the PLACE — features,
   distances, housing stock, flood story — NEVER the ideal resident. No "who it fits", no
   "perfect for <group>". Linted.
2. **Numbers:** market stats render from `market_stats` (SQL-computed) or render nothing.
   A model never computes a market number. kb/ markdown carries no market statistics.
3. **Nothing auto-publishes.** `status: live` flips only in a PR the broker merges
   (one PR per page, batched Mondays — plan §3d).
4. **Quarterly sweep:** every fact past its shelf-life gets re-sourced or flagged stale on-page.
