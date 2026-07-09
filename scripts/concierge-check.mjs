/**
 * concierge-check — proves the wave-3 concierge SCAFFOLDING is sound (runs in
 * `npm run check`, third stage after check.mjs + kb-lint.mjs). It touches
 * nothing the other two guard; it validates only the concierge grounding layer:
 *
 *   1 · the four kb/guardrails/*.yaml files are present, parse, and carry the
 *       shape the runtime guard depends on;
 *   2 · every fair-housing + mls-claims pattern compiles;
 *   3 · the compiled corpus (src/_data/concierge.js) is fully GROUNDED — every
 *       fact atom carries value+source+url+dates+confidence, every prose doc
 *       carries type+slug+title;
 *   4 · the guardrail patterns run CLEAN over the corpus — i.e. the guard works
 *       AND the corpus the bot will answer from is already fair-housing- and
 *       Rule-32-clean (kb-lint guards authored pages; this guards the compiled
 *       corpus, which includes the fact atoms kb-lint does not scan).
 *
 * This makes kb/guardrails/*.yaml and src/_data/concierge.js load-bearing today
 * (a live check depends on them), not dead scaffolding awaiting the bot.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const GUARDRAILS = path.join(ROOT, "kb", "guardrails");

let failures = 0, passes = 0;
const ok = (m) => { passes++; console.log(`  ok  ${m}`); };
const fail = (m) => { failures++; console.error(`FAIL  ${m}`); };

/* ---- 1 · guardrail files present + parse + required shape ---- */
const shapeOK = {
  "fair-housing": (d) => Array.isArray(d?.patterns) && d.patterns.length > 0,
  "mls-claims": (d) => Array.isArray(d?.patterns) && d.patterns.length > 0,
  "display-caps": (d) => d?.caps && Number(d.caps.snippet_max_chars) > 0 && d?.attribution,
  "pii-exclusion": (d) =>
    Array.isArray(d?.excluded_field_categories) && d.excluded_field_categories.length > 0 && d?.never_inferred === true
};
const guard = {};
for (const [name, isShaped] of Object.entries(shapeOK)) {
  const p = path.join(GUARDRAILS, `${name}.yaml`);
  if (!fs.existsSync(p)) { fail(`kb/guardrails/${name}.yaml missing`); continue; }
  let doc;
  try { doc = yaml.load(fs.readFileSync(p, "utf8")); }
  catch (e) { fail(`kb/guardrails/${name}.yaml does not parse: ${e.message}`); continue; }
  guard[name] = doc;
  if (isShaped(doc)) ok(`kb/guardrails/${name}.yaml present + well-formed`);
  else fail(`kb/guardrails/${name}.yaml missing required shape`);
}

/* ---- 2 · pattern files compile ---- */
function compile(name) {
  const out = [];
  for (const e of guard[name]?.patterns || []) {
    try { out.push({ id: e.id, label: e.label, re: new RegExp(e.pattern, e.flags || "") }); }
    catch (err) { fail(`kb/guardrails/${name}.yaml pattern ${e.id} does not compile: ${err.message}`); }
  }
  return out;
}
const fhPatterns = compile("fair-housing");
const mlsPatterns = compile("mls-claims");
if (fhPatterns.length) ok(`fair-housing: all ${fhPatterns.length} patterns compile`);
if (mlsPatterns.length) ok(`mls-claims: all ${mlsPatterns.length} patterns compile`);

/* ---- 3 · corpus loads + every atom is grounded ---- */
const concierge = (await import(path.join(ROOT, "src", "_data", "concierge.js"))).default;
const facts = concierge.corpus.facts;
const prose = concierge.corpus.prose;
{
  let bad = 0;
  for (const a of facts) {
    for (const k of ["id", "domain", "value", "source", "source_url", "as_of", "last_verified", "confidence"]) {
      if (!a[k]) { fail(`concierge fact atom ${a.id || "(no id)"}: missing ${k}`); bad++; }
    }
    if (a.confidence && !["HIGH", "MEDIUM", "LOW"].includes(a.confidence)) {
      fail(`concierge fact atom ${a.id}: confidence must be HIGH|MEDIUM|LOW`); bad++;
    }
  }
  if (!facts.length) fail("concierge corpus has zero fact atoms");
  else if (!bad) ok(`all ${facts.length} concierge fact atoms grounded (value+source+url+dates+confidence)`);
}
{
  let bad = 0;
  for (const d of prose) {
    for (const k of ["type", "slug", "title"]) if (!d[k]) { fail(`concierge prose doc ${d.slug || "(no slug)"}: missing ${k}`); bad++; }
  }
  if (!prose.length) fail("concierge corpus has zero prose docs");
  else if (!bad) ok(`all ${prose.length} concierge prose docs carry type+slug+title`);
}

/* ---- 4 · guardrails run CLEAN over the corpus ---- */
function corpusSpans() {
  const parts = [];
  for (const a of facts) { parts.push(a.value); if (a.notes) parts.push(a.notes); }
  for (const d of prose) { parts.push(d.title); if (d.question) parts.push(d.question); parts.push(d.lede); }
  return parts.filter(Boolean);
}
const spans = corpusSpans();
{
  let bad = 0;
  for (const t of spans) for (const { label, re } of fhPatterns) {
    if (re.test(t)) { fail(`fair-housing pattern (${label}) hit corpus: "${t.slice(0, 60)}…"`); bad++; }
  }
  if (!bad) ok(`fair-housing guard runs clean over the concierge corpus (${spans.length} spans)`);
}
{
  let bad = 0;
  for (const t of spans) for (const { label, re } of mlsPatterns) {
    if (re.test(t)) { fail(`mls-claims pattern (${label}) hit corpus: "${t.slice(0, 60)}…"`); bad++; }
  }
  if (!bad) ok(`mls-claims guard runs clean over the concierge corpus`);
}

console.log(`\nconcierge-check: ${passes} checks passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
