# kb/guardrails — the concierge's guardrail source (one list, no drift)

These YAML files are the machine-readable form of the concierge guardrails. The
rule lives in **one** place with **two** consumers so they can never drift:

| File | kb-lint (build gate, TODAY) | AI concierge (runtime, wave 3) |
|---|---|---|
| `fair-housing.yaml` | check 3: fails build if a tripwire pattern hits authored kb/ prose | runs the SAME patterns over generated text as a cheap FIRST gate, before the semantic judge |
| `mls-claims.yaml` | check 4: fails build on the MLS-verb patterns in kb/ or src/ | guards generated copy + canned framing; encodes the "never claim to be MLS search" posture |
| `display-caps.yaml` | (no build consumer — pure config) | Rules 22/23/24 minimal-display snippet + Rule 26 record caps + attribution on any feed-derived snippet |
| `pii-exclusion.yaml` | (no build consumer — pure config) | Rule 28 seller/occupant field deny-list; belt to the ingest-strip suspenders |

Before this existed, the patterns were **hardcoded** in `scripts/kb-lint.mjs`.
They are now sourced from here, so the concierge reads the identical patterns —
guarded by one list, not two that rot apart.

## Read this first: what the regex is, and what actually enforces fair housing

**The `fair-housing.yaml` / `mls-claims.yaml` regex is a cheap KNOWN-BAD TRIPWIRE
and a FLOOR — not "the" enforcement, and not complete coverage.** A denylist
misses paraphrases it never listed and can over-match innocent text (e.g. a naive
"single" pattern would flag "single-family"; a "temple" religion pattern would
flag the Tocobaga temple-mound landmark that appears 4x in kb/). Treated as the
guard, it gives false confidence. It is honestly a floor:

> `coverage_status: FLOOR ONLY — a known-bad tripwire, not complete coverage`

**The LOAD-BEARING fair-housing enforcement is two other layers:**

1. **Grounding (structural).** The concierge answers ONLY from a compiled corpus
   (`src/_data/concierge.js`) that is itself proven steering-clean
   (`scripts/concierge-check.mjs` runs the tripwires over every corpus atom,
   including the fact atoms kb-lint does not scan). The bot cannot assert a
   steering claim that is not in its ground truth — plan §3a: *"enforced by what
   the bot can see, not by prompt hope."*
2. **The wave-3 SEMANTIC OUTPUT JUDGE (built next pass).** A model-graded check on
   every generated answer that catches CODED / paraphrased steering the regex
   cannot. **These protected classes are the JUDGE'S domain, deliberately NOT
   faked in regex:** religion, race, national origin, disability, and sex
   steering. The tripwire runs first (cheap, catches the obvious); the judge is
   the real coverage. Adding a regex for these would be theater — a false green.

The tripwire's value is being fast and free on every turn and failing the BUILD
if authored KB prose ever regresses — not being the whole guard.

## The concierge guardrail loop (design the wave-3 build implements)

The server-side answerer (gate 4 — Supabase edge function recommended) runs a
**strict-schema tool-use loop**; the model never free-forms KB or listing data:

1. **Retrieve** — the model calls a typed `search_kb(query, domain?)` tool. The
   handler returns only atoms from the compiled corpus (each carries `value`,
   `source`, `source_url`, `confidence`, `as_of`). No corpus hit → no assertion.
2. **Answer from grounding only** — compose from returned atoms, preserving each
   atom's confidence: HIGH asserts plainly; MEDIUM carries the hedge already
   written in the fact's `notes` (never upgraded to sound primary).
3. **Guard the output** — before emit: (a) the `fair-housing.yaml` +
   `mls-claims.yaml` tripwires run over the text (a hit = suppress-and-regenerate,
   not ship-with-a-warning); (b) the SEMANTIC JUDGE grades it for coded steering
   in the protected classes above. Both must pass.
4. **Route inventory** — a `route_to_search()` tool is the ONLY path to listing
   questions; until the feed is live it returns the honest "listing search
   arrives with the feed" state. With the feed, snippets obey `display-caps.yaml`.
5. **Spend cap + PII-free query log** — every turn is metered against the hard
   cap (gate 2); the query trail is logged with NO PII (the analytics-seam
   discipline: category fields only, never name/email/phone/address).

## Editing

Change a rule HERE, once. `npm run check` (kb-lint + concierge-check) proves the
KB still passes; the concierge picks up the same change with no code edit. Keep
`pattern` values single-quoted (literal backslashes). Add a tripwire → add it
here, not in code. Add protected-class *semantic* coverage → the judge, not regex.
