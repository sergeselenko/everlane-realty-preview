/**
 * concierge — the AI concierge's build-time GROUNDING LAYER (wave 3, plan §5).
 *
 * This is the token-INDEPENDENT half of the concierge: the retrieval-shaped
 * corpus the bot answers from, plus the loaded guardrails. It renders NOTHING
 * on its own (no template consumes it) — it is a build-time library that:
 *   - the wave-3 server-side answerer (gate 4: a Supabase edge function) loads
 *     as its ground truth, and
 *   - scripts/concierge-check.mjs validates on every `npm run check`.
 *
 * THE GROUNDING CONTRACT (plan §3a). This corpus is the KB-answering half's
 * intended assertable surface — but be precise about the ENFORCEMENT (honest
 * mechanism, not a structural guarantee; mirrors kb/guardrails/README.md's
 * floor framing): the runtime FORCES a retrieval before the model can answer
 * (turn-0 tool_choice), INSTRUCTS it to assert only from returned atoms, and
 * JUDGES every draft for steering + fabrication. It does NOT hard-block an
 * ungrounded claim — a plausible non-numeric qualitative claim the judge does
 * not catch can slip through. So: forced-retrieval + instructed-grounding +
 * judged, NOT "if it is not here the bot cannot say it." The red-team's
 * qualitative-fabrication probe is the check that this holds in practice.
 *
 * Two atom kinds:
 *   - fact atoms   → one per kb/facts entry: an atomic, sourced, dated,
 *                    confidence-tagged claim (retrieval-shaped already).
 *   - prose docs   → one per LIVE guide / neighborhood chapter: title +
 *                    question + a short lede + its on-page sources. The bot
 *                    retrieves the doc, then grounds in the fact atoms it cites;
 *                    it never free-forms the prose.
 *
 * NUMBERS DISCIPLINE (plan §3d): NO market statistics live here — those come
 * only from the feed mirror (src/_data/feed.js → Supabase market_stats),
 * SQL-computed, and are the FEED-GATED half of the concierge (not built until
 * the MLS GRID token lands). This corpus is regulatory/geographic/narrative
 * ground only.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import kb from "./kb.js";

const GUARDRAILS_DIR = path.resolve(process.cwd(), "kb", "guardrails");

function loadGuardrail(name) {
  const p = path.join(GUARDRAILS_DIR, `${name}.yaml`);
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, "utf8"));
}

/* ---- fact atoms: flatten every kb/facts/<domain>.yaml entry ---- */
function factAtoms() {
  const out = [];
  for (const [domain, doc] of Object.entries(kb.facts || {})) {
    for (const f of doc.facts || []) {
      out.push({
        kind: "fact",
        id: f.id,
        domain,
        value: (f.value || "").trim(),
        source: f.source,
        source_url: f.source_url,
        as_of: f.as_of,
        last_verified: f.last_verified,
        confidence: f.confidence, // HIGH asserts plainly; MEDIUM keeps its hedge
        notes: f.notes ? String(f.notes).trim() : undefined
      });
    }
  }
  return out;
}

/* ---- prose docs: one retrievable doc per LIVE guide / neighborhood page ---- */
function firstParagraph(body) {
  const para = (body || "").split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#"));
  return (para || "").replace(/\s+/g, " ").trim();
}

function proseDocs() {
  const docs = [];
  const add = (type, e) => {
    docs.push({
      kind: "prose",
      type, // "guide" | "neighborhood"
      slug: e.slug,
      title: e.title,
      question: e.question || null,
      lede: firstParagraph(e.body),
      author: e.author || null,
      last_verified: e.last_verified || null,
      // On-page source visibility (Rules 16/21) is preserved — the bot cites
      // what the page cites; it never asserts beyond the page's own sources.
      sources: Array.isArray(e.sources)
        ? e.sources.map((s) => ({ name: s.name, url: s.url, accessed: s.accessed }))
        : []
    });
  };
  for (const g of kb.guidesLive || []) add("guide", g);
  for (const n of kb.neighborhoodsLive || []) add("neighborhood", n);
  return docs;
}

const facts = factAtoms();
const prose = proseDocs();

const guardrails = {
  fairHousing: loadGuardrail("fair-housing"),
  mlsClaims: loadGuardrail("mls-claims"),
  displayCaps: loadGuardrail("display-caps"),
  piiExclusion: loadGuardrail("pii-exclusion")
};

export default {
  // The retrieval corpus the KB-answering half grounds on (token-independent).
  corpus: { facts, prose },
  // The loaded guardrails (single source of truth — kb/guardrails/*.yaml).
  guardrails,
  // Feed-gated capabilities are DESIGNED, not built here — they need the MLS
  // GRID token. The concierge advertises them as honest coming states.
  feedGated: {
    listingSearch: "arrives with the MLS GRID feed",
    guidedCMA: "arrives with the MLS GRID feed (sold comps)"
  },
  meta: {
    factAtoms: facts.length,
    proseDocs: prose.length,
    domains: [...new Set(facts.map((f) => f.domain))].sort(),
    guardrailFiles: Object.entries(guardrails)
      .filter(([, v]) => v != null)
      .map(([k]) => k)
  }
};
