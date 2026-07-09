// answerer — the concierge's strict-schema tool-use loop (kb/guardrails/README.md
// §"The concierge guardrail loop"). The model NEVER free-forms KB data: it calls
// typed tools, answers only from returned atoms, and every draft passes the
// regex tripwire THEN the semantic judge before it ships.
//
// Model: Haiku 4.5 serves AND judges (claude-haiku-4-5-20251001). The Sonnet-5
// judge escalation is a ONE-LINE env swap (CONCIERGE_JUDGE_MODEL) — designed
// for, not pre-taken (spec: the red-team validates the Haiku judge first).
//
// Haiku 4.5 does NOT accept `thinking`/`effort` (they 400 on that model), so we
// never send them. Structured outputs ARE supported on Haiku 4.5 — the judge
// uses output_config.format for a clean verdict.

import Anthropic from "npm:@anthropic-ai/sdk";
import { runTripwires, type Tripwire } from "./guardrails.ts";

// $/1M tokens (input, output) — cost math for the spend cap. 2 model classes.
const PRICE: Record<string, [number, number]> = {
  "claude-haiku-4-5-20251001": [1.0, 5.0],
  "claude-haiku-4-5": [1.0, 5.0],
  "claude-sonnet-5": [3.0, 15.0]
};
function costOf(model: string, inTok: number, outTok: number): number {
  const [ci, co] = PRICE[model] ?? [1.0, 5.0];
  return (inTok / 1e6) * ci + (outTok / 1e6) * co;
}

interface FactAtom {
  id: string; domain: string; value: string; source: string; source_url: string;
  as_of: string; confidence: "HIGH" | "MEDIUM" | "LOW"; notes?: string;
}
interface ProseDoc {
  type: string; slug: string; title: string; question: string | null;
  lede: string; sources: { name: string; url: string }[];
}
export interface Corpus { facts: FactAtom[]; prose: ProseDoc[]; }

export interface AnswerResult {
  text: string;
  citations: { name: string; url: string }[];
  route: "search" | "contact" | null;
  suppressed: boolean;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  serveModel: string;
}

// ---- GROUNDING retrieval (structural fair-housing guard, plan §3a) ----------
// The handler returns ONLY atoms from the compiled corpus; no corpus hit → no
// assertion. Pure keyword overlap — token-independent, no embeddings service.
function tokenize(s: string): Set<string> {
  return new Set(
    (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2)
  );
}
function overlap(a: Set<string>, bText: string): number {
  const b = tokenize(bText);
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

// Generic filler that creates spurious answer↔source overlap (a homestead answer
// sharing "year"/"value" with a climate page, or a fair-housing refusal listing
// "housing stock, flood history, walkability"). Excluded when scoring citations so
// only DISTINCTIVE content (numbers, place names, terms) counts (F3).
const CITE_STOP = new Set(
  ("area areas place places home homes house year years market value values rule rules local really actually specific different various matter matters looking around between through help talk book free consult that this your have will they them what when whom where which while there here just like also into over more most many some with from been were would could should about need want know knew make take give find best good great kind still much stock history commute walkability distances vibe aligns plainly facts fact thing things point people person family families group groups community communities live living move buying selling home).")
    .split(" ")
);

function retrieve(query: string, domain: string | undefined, corpus: Corpus) {
  const q = tokenize(query);
  const facts = corpus.facts
    .filter((f) => !domain || f.domain === domain)
    .map((f) => ({ f, s: overlap(q, `${f.value} ${f.notes ?? ""} ${f.domain}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.f);
  const prose = corpus.prose
    .map((p) => ({ p, s: overlap(q, `${p.title} ${p.question ?? ""} ${p.lede}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.p);
  return { facts, prose };
}

const TOOLS = [
  {
    name: "search_kb",
    description:
      "Retrieve grounded facts and guide passages from Everlane's published knowledge base. " +
      "This is the ONLY source you may assert from. Each fact carries a confidence: assert HIGH " +
      "facts plainly; for MEDIUM facts keep the hedge written in the fact's notes and never upgrade " +
      "it to sound primary. If nothing relevant returns, say you don't know and route to the broker.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look up, in the user's own terms." },
        domain: {
          type: "string",
          description: "Optional filter: climate, flood, geography, historic-districts, insurance, str-rules, tax, transit."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "route_to_search",
    description:
      "The ONLY path for questions this KB cannot answer. Use destination='listings' for any " +
      "question about specific homes / inventory / prices for sale (Everlane does not search or " +
      "reproduce the MLS here). Use destination='contact' when you don't know, or when the user " +
      "shows transaction intent (ready to buy/sell, wants a valuation, wants to make an offer). " +
      "Never collect the user's name, email, phone, or address in this chat.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string", enum: ["listings", "contact"] },
        reason: { type: "string" }
      },
      required: ["destination", "reason"]
    }
  }
];

function systemPrompt(feedGated: { listingSearch: string; guidedCMA: string }): string {
  return [
    "You are Everlane Realty's website assistant for St. Petersburg and Tampa Bay, Florida.",
    "You speak for a licensed brokerage; be warm, plain-spoken, and brief (2–5 short sentences).",
    "",
    "HARD RULES (these are compliance and fair-housing lines, not style):",
    "1. GROUNDED ONLY. Assert nothing that did not come back from a search_kb call. If the KB has",
    "   no answer, say so honestly and use route_to_search(destination='contact'). Never invent a",
    "   fact, a statute, a price, or a market number.",
    "2. DESCRIBE THE PLACE, NEVER WHO IT SUITS. Talk about a neighborhood's features, flood story,",
    "   housing stock, rules, and process — never the kind of person who 'belongs' there, and never",
    "   any implication tied to race, color, religion, national origin, sex, familial status, or",
    "   disability. Do not answer 'is this a good area for [group]' — redirect to the place's facts.",
    "   And when you decline such a request and point to Serge, offer ONLY that he can walk through the",
    "   FACTS of a specific home or neighborhood — NEVER say or imply he will discuss safety, crime,",
    "   which areas to 'avoid', a neighborhood's 'vibe', or who 'fits' a place. Promising that",
    "   conversation offline is the same fair-housing violation as making the steer yourself.",
    "   On ANY such decline (a 'good for [group]', 'family-friendly', 'best for a cohort', 'safest',",
    "   'who fits', or protected-class question), CALL route_to_search(destination='contact') so the",
    "   reply routes to Serge rather than dangling sources.",
    "3. NOT AN MLS TERMINAL. You consult Everlane's own published knowledge and, once live, its",
    "   licensed data feed. You never present yourself as searching, accessing, or being the MLS.",
    "   For inventory questions use route_to_search(destination='listings').",
    "4. NO IN-CHAT LEAD CAPTURE. Never ask for or accept a name, email, phone, or address. When the",
    "   user is ready to act, point them to book a consult with Serge.",
    "5. Preserve each fact's confidence: HIGH asserts plainly; MEDIUM keeps its written hedge.",
    "6. PLAIN PROSE, NO LINKS OR URLS. Never write a web address, a domain, or a markdown [text](url)",
    "   link in your answer. Do NOT guess or print the site's domain — refer to the buyer & seller",
    "   guides, the search page, or a consult with Serge in WORDS only; the page renders the actual",
    "   sources and next-step buttons for you.",
    "",
    `Feed-gated capabilities (honest coming states): listing search — ${feedGated.listingSearch}; ` +
    `guided valuation comps — ${feedGated.guidedCMA}. Say so plainly; never fabricate a result.`,
    "",
    "Close with the natural next step: a specific guide, the /search/ page for inventory, or booking",
    "a free consult with Serge for anything transactional."
  ].join("\n");
}

// ---- the semantic OUTPUT JUDGE (README §3b) ---------------------------------
// Catches CODED / paraphrased steering the regex cannot — the protected classes
// are deliberately the JUDGE's domain, not faked in regex.
async function judge(
  client: Anthropic, model: string, question: string, answer: string,
  onUsage: (m: string, i: number, o: number) => void
): Promise<{ pass: boolean; reason: string }> {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      verdict: { type: "string", enum: ["PASS", "FAIL"] },
      reason: { type: "string" }
    },
    required: ["verdict", "reason"]
  };
  const resp = await client.messages.create({
    model,
    max_tokens: 512,
    system:
      "You are a fair-housing compliance judge for a US real-estate assistant. Read the DRAFT ANSWER " +
      "and decide if it steers by protected class — race, color, religion, national origin, sex, " +
      "familial status, or disability — INCLUDING coded or paraphrased steering (e.g. 'good schools', " +
      "'family-friendly', 'safe/up-and-coming/diverse area', 'quiet churchgoing community', 'great for " +
      "young professionals', implying who does or doesn't belong). Also FAIL it if it claims to search " +
      "or be the MLS, or if it fabricates a fact/price. Return verdict=FAIL with a short reason if any " +
      "of that is present; otherwise PASS. Judge the answer only, not the question.",
    messages: [
      { role: "user", content: `QUESTION:\n${question}\n\nDRAFT ANSWER:\n${answer}` }
    ],
    output_config: { format: { type: "json_schema", schema } }
  } as any);
  onUsage(model, resp.usage.input_tokens ?? 0, resp.usage.output_tokens ?? 0);
  try {
    const txt = (resp.content.find((b: any) => b.type === "text") as any)?.text ?? "{}";
    const j = JSON.parse(txt);
    return { pass: j.verdict === "PASS", reason: j.reason || "" };
  } catch {
    // Judge unparseable → fail closed (suppress), never ship an ungraded draft.
    return { pass: false, reason: "judge_unparseable" };
  }
}

const DEGRADE =
  "I want to be careful to only tell you things I can stand behind, and I don't have a grounded " +
  "answer for that one. The buyer & seller guides cover flood zones, neighborhoods, and the buying " +
  "process in depth — or the fastest path is a quick, free consult with Serge, who can answer directly.";

// ---- the loop ---------------------------------------------------------------
export async function answer(opts: {
  apiKey: string;
  question: string;
  corpus: Corpus;
  tripwires: Tripwire[];
  feedGated: { listingSearch: string; guidedCMA: string };
  serveModel: string;
  judgeModel: string;
}): Promise<AnswerResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const citeCandidates: { url: string; name: string; text: string }[] = []; // filtered at the end to sources the answer actually used (F3)
  let route: "search" | "contact" | null = null;
  let tokensIn = 0, tokensOut = 0, costUsd = 0;
  const onUsage = (m: string, i: number, o: number) => {
    tokensIn += i; tokensOut += o; costUsd += costOf(m, i, o);
  };

  const messages: any[] = [{ role: "user", content: opts.question }];
  const system = systemPrompt(opts.feedGated);

  // strict-schema tool loop, hard-capped at MAX_CALLS model calls for spend safety
  const MAX_CALLS = 5;
  let finalText = "";
  let suppressed = false;
  // The whole model-calling body runs under one guard: ANY error (Anthropic
  // 429/5xx/network on any of the calls) degrades safely AND preserves the
  // token cost already accrued, so index.ts always records real spend — the cap
  // stays hard even on the error path (gap-finder MAJOR-2).
  try {
  for (let call = 0; call < MAX_CALLS; call++) {
    const resp = await client.messages.create({
      model: opts.serveModel,
      max_tokens: 700,
      system,
      tools: TOOLS as any,
      // Force a tool call on the FIRST turn: the model MUST search_kb (or route)
      // before it can free-form an answer — grounding by construction, not hope.
      ...(call === 0 ? { tool_choice: { type: "any" } } : {}),
      messages
    } as any);
    onUsage(opts.serveModel, resp.usage.input_tokens ?? 0, resp.usage.output_tokens ?? 0);

    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });
      const results: any[] = [];
      for (const block of resp.content as any[]) {
        if (block.type !== "tool_use") continue;
        if (block.name === "search_kb") {
          const { facts, prose } = retrieve(block.input.query, block.input.domain, opts.corpus);
          for (const f of facts) citeCandidates.push({ url: f.source_url, name: f.source, text: `${f.value} ${f.notes ?? ""}` });
          for (const p of prose) for (const s of p.sources) citeCandidates.push({ url: s.url, name: s.name, text: `${p.title} ${p.lede}` });
          const payload = {
            facts: facts.map((f) => ({
              value: f.value, confidence: f.confidence, hedge: f.notes ?? null,
              source: f.source, source_url: f.source_url, as_of: f.as_of
            })),
            guides: prose.map((p) => ({ title: p.title, slug: p.slug, summary: p.lede })),
            note: facts.length || prose.length
              ? "Assert only from these. Keep MEDIUM facts' hedge; do not upgrade them."
              : "No grounded match. Say you don't know and route_to_search(destination='contact')."
          };
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(payload) });
        } else if (block.name === "route_to_search") {
          const dest = block.input.destination;
          route = dest === "listings" ? "search" : "contact";
          const content = dest === "listings"
            ? "Point them to the /search/ page for live listings. Live listing search arrives with the " +
              "MLS GRID feed; say that honestly. NEVER claim to search or be the MLS, never fabricate a listing."
            : "Point them to book a free consult with Serge at /contact/. Do NOT collect their name, " +
              "email, phone, or address here. If the question touched a protected class, safety/crime, " +
              "or 'which areas to avoid / who fits', frame the consult as ONLY about the FACTS of a " +
              "specific home or neighborhood — never say or imply Serge will discuss safety, crime, " +
              "'good/bad areas', vibe, or who 'fits'.";
          results.push({ type: "tool_result", tool_use_id: block.id, content });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    finalText = (resp.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    break;
  }

  if (!finalText) finalText = DEGRADE;

  // ---- guard the output: tripwire FIRST, then the semantic judge ----
  // The known-safe DEGRADE constant is never guarded (it is authored copy, not
  // model output) — a transient judge error must not turn a safe fallback into
  // a resting state (gap-finder NIT).
  const check = async (text: string) => {
    const trip = runTripwires(text, opts.tripwires);
    if (trip) return { ok: false, reason: `tripwire:${trip.domain}:${trip.id}` };
    const j = await judge(client, opts.judgeModel, opts.question, text, onUsage);
    if (!j.pass) return { ok: false, reason: `judge:${j.reason}` };
    return { ok: true, reason: "" };
  };

  if (finalText !== DEGRADE) {
    const verdict = await check(finalText);
    if (!verdict.ok) {
      suppressed = true;
      // suppress-and-REGENERATE once, from the grounding already in context
      messages.push({ role: "assistant", content: finalText });
      messages.push({
        role: "user",
        content:
          "That draft was suppressed by the fair-housing / compliance guard. Rewrite your answer using " +
          "ONLY the facts you already retrieved: describe the place, the data, and the process — never " +
          "who a place suits, never anything tied to a protected class, never a claim to search or be " +
          "the MLS. If you cannot answer cleanly from grounding, say you don't know and point to Serge. " +
          "Output ONLY the rewritten answer as plain prose — no preamble, no apology, no \"you're right\", " +
          "no reference to the previous draft or to this instruction, and no URLs or links."
      });
      const regen = await client.messages.create({
        model: opts.serveModel, max_tokens: 700, system, tools: TOOLS as any, messages
      } as any);
      onUsage(opts.serveModel, regen.usage.input_tokens ?? 0, regen.usage.output_tokens ?? 0);
      const regenText = (regen.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      const regenVerdict = regenText ? await check(regenText) : { ok: false, reason: "empty" };
      finalText = regenVerdict.ok ? regenText : DEGRADE; // still bad → honest degrade
      if (!regenVerdict.ok && route === null) route = "contact";
    }
  }
  } catch (_e) {
    // Model call / judge threw mid-turn: degrade safely; cost already accrued in
    // costUsd is preserved and recorded by the caller (hard cap on the error path).
    finalText = DEGRADE;
    if (route === null) route = "contact";
  }

  // Any degrade path (incl. MAX_CALLS exhausted with no answer) always routes to
  // Serge so the CTA renders — an empty ctas[] would be a dead-end reply (F8).
  if (finalText === DEGRADE && route === null) route = "contact";

  // Cite ONLY on a clean grounded answer. A suppressed-and-regenerated decline, a
  // route-out (search/contact), or the degrade fallback asserts no facts of its
  // own — so it must ship NO sources: six authoritative links under a fair-housing
  // refusal read as "sourced from those places" (F3). On a genuine grounded answer,
  // keep only sources whose content the answer text actually overlaps.
  // A plain-language refusal (fair-housing decline, "I don't have that data")
  // asserts no facts even when route===null and nothing was suppressed — detect it
  // so it ships no sources.
  const DECLINE_RE = /(can'?t (help|answer|steer|recommend|rank|tell you which|point)|don'?t (answer|have (a |any )?(grounded|data|info|information|that)|know which)|fair[- ]?housing (law|policy|rules|means|territory|line)|won'?t (describe|rank|steer|label)|not something (i|we) can|isn'?t in (our|the) knowledge|no grounded (answer|match))/i;
  const isGrounded = route === null && !suppressed && finalText !== DEGRADE && !DECLINE_RE.test(finalText);
  const usedCitations: { name: string; url: string }[] = [];
  if (isGrounded) {
    const qFinal = tokenize(finalText);
    const seenCite = new Set<string>();
    const scored = citeCandidates
      .map((c) => {
        const b = tokenize(c.text);
        let n = 0;
        for (const w of qFinal) if (w.length > 3 && !CITE_STOP.has(w) && b.has(w)) n++;
        return { c, n };
      })
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n);
    for (const { c } of scored) {
      if (seenCite.has(c.url)) continue;
      seenCite.add(c.url);
      usedCitations.push({ name: c.name, url: c.url });
      if (usedCitations.length >= 3) break; // top-3 by relevance — no wall of links
    }
  }

  return {
    text: finalText,
    citations: usedCitations,
    route,
    suppressed,
    costUsd,
    tokensIn,
    tokensOut,
    serveModel: opts.serveModel
  };
}
