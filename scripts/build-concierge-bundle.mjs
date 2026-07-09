/**
 * build-concierge-bundle — compiles the token-INDEPENDENT grounding layer
 * (src/_data/concierge.js) into a single static JSON the Supabase edge function
 * ships as its ground truth. One source of truth, two consumers:
 *
 *   - concierge.js  → the build-time corpus (kb/facts + kb prose, guardrail YAML)
 *   - THIS bundle   → the runtime copy the edge function loads (no kb/ filesystem
 *                     in the deployed function, so the corpus is baked in here)
 *
 * Run on every `npm run check` (before concierge-check.mjs, which validates the
 * emitted bundle against the compiled corpus so the two can never drift). The
 * edge function imports the emitted file:
 *   import corpus from "./corpus.generated.json" with { type: "json" };
 *
 * NOTHING here is a model call and nothing needs a token — this is the
 * buildable-now half of the concierge (plan §4 feed-sequencing).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "supabase", "functions", "ask", "corpus.generated.json");

const concierge = (await import(path.join(ROOT, "src", "_data", "concierge.js"))).default;

/* Guardrail patterns the edge function runs over generated text (the cheap
 * first-gate tripwire, BEFORE the semantic judge — see kb/guardrails/README.md).
 * We ship only the two pattern-bearing guards; display-caps + pii-exclusion are
 * feed-gated config the KB-answering half does not exercise. */
function patternsOf(guard) {
  return (guard?.patterns || []).map((p) => ({
    id: p.id,
    pattern: p.pattern,
    flags: p.flags || "",
    label: p.label
  }));
}

const bundle = {
  // No timestamp on purpose: the bundle must be DETERMINISTIC so the committed
  // file is byte-stable across `npm run check` runs (never perpetually git-dirty).
  // concierge-check content-compares it against the compiled corpus (F9).
  source: "src/_data/concierge.js (compiled from kb/facts + kb prose + kb/guardrails)",
  meta: concierge.meta,
  corpus: {
    // Fact atoms carry confidence + notes so the model can preserve the
    // HIGH-asserts-plainly / MEDIUM-keeps-its-hedge discipline (README step 2).
    facts: concierge.corpus.facts,
    prose: concierge.corpus.prose
  },
  guardrails: {
    fairHousing: patternsOf(concierge.guardrails.fairHousing),
    mlsClaims: patternsOf(concierge.guardrails.mlsClaims)
  },
  // The judge's protected-class domain (README step 3b): deliberately NOT faked
  // in regex — the semantic judge is the load-bearing coverage for these.
  judgeProtectedClasses: [
    "race", "color", "religion", "national origin",
    "sex", "familial status", "disability"
  ],
  feedGated: concierge.feedGated
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2) + "\n");

console.log(
  `build-concierge-bundle: wrote ${path.relative(ROOT, OUT)} — ` +
  `${bundle.corpus.facts.length} facts, ${bundle.corpus.prose.length} prose docs, ` +
  `${bundle.guardrails.fairHousing.length} fair-housing + ${bundle.guardrails.mlsClaims.length} mls-claims patterns.`
);
