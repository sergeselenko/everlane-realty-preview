// AI Concierge — Supabase edge function `ask`  (re-website #149, Wave 3)
// ============================================================================
// The server-side answerer (guardrail-loop gate 4). Holds the Anthropic key as
// a Supabase secret (set by the operator at deploy — a Commitment-Gate action;
// NEVER hardcoded here), enforces the hard spend cap + per-session + per-IP rate
// limit via table counters, writes the PII-minimized query log to RLS-locked
// tables, and runs the strict-schema tool-use loop + tripwire + judge (answerer.ts).
//
// FAIL-SAFE CONTRACT (spec): this function never errors and never overspends.
// A cap hit, an env gap, or ANY thrown error degrades to an honest resting
// state — "the assistant's resting; browse the guides or reach Serge" — with the
// CTAs intact. The /ask/ page renders that state; nothing half-wired ships live.
//
// STAGED — not deployed this build (Supabase MCP disconnected). Deploy per
// build/wave-3/concierge-deploy-runbook.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import corpus from "./corpus.generated.json" with { type: "json" };
import { answer } from "./answerer.ts";
import { compileTripwires, scrubPII, categorize, sha256Hex } from "./guardrails.ts";

// ---- config (env-tunable; caps default to the operator-approved ceiling) ----
const DAY_CAP = Number(Deno.env.get("CONCIERGE_DAY_CAP_USD") ?? "5");
const MONTH_CAP = Number(Deno.env.get("CONCIERGE_MONTH_CAP_USD") ?? "50");
const SESSION_TURN_CAP = Number(Deno.env.get("CONCIERGE_SESSION_TURN_CAP") ?? "20");
// PII posture: log CATEGORY ONLY by default. The scrubbed free-text query is the
// most fair-housing-sensitive string in the exchange (a user can self-disclose a
// protected class in it), so it is NOT stored unless the operator explicitly
// opts in — and even then it is PII-scrubbed first (gap-finder MAJOR-1).
const LOG_QUERY_TEXT = (Deno.env.get("CONCIERGE_LOG_QUERY_TEXT") ?? "false") === "true";
const SERVE_MODEL = Deno.env.get("CONCIERGE_SERVE_MODEL") ?? "claude-haiku-4-5-20251001";
// One-line Sonnet escalation if the red-team shows the judge slipping on
// fair-housing paraphrase: set CONCIERGE_JUDGE_MODEL=claude-sonnet-5.
const JUDGE_MODEL = Deno.env.get("CONCIERGE_JUDGE_MODEL") ?? "claude-haiku-4-5-20251001";
// Pessimistic per-turn cost reservation (spend-cap integrity, F1). Booked at
// precheck, reconciled down at record. Default is a generous worst case for the
// max ~8 Haiku calls a turn can make.
const WORST_CASE_TURN_USD = Number(Deno.env.get("CONCIERGE_WORST_CASE_TURN_USD") ?? "0.05");
// Per-IP griefing throttle (F2): the client-supplied sessionId cap is void if it
// is rotated per request, so cap turns per client IP over a rolling window.
const IP_TURN_CAP = Number(Deno.env.get("CONCIERGE_IP_TURN_CAP") ?? "40");
const IP_WINDOW_MIN = Number(Deno.env.get("CONCIERGE_IP_WINDOW_MIN") ?? "60");

// CORS scoped to the site origin(s). Comma-separated env allowlist; the runbook
// sets it to the production + preview origins at deploy.
const ALLOWED = (Deno.env.get("CONCIERGE_ALLOWED_ORIGINS") ??
  "https://everlanerealty.com,https://www.everlanerealty.com,https://sergeselenko.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin"
  };
}

// The honest resting/degrade state — CTAs intact, never an error to the user.
function resting(origin: string | null, reason: string) {
  return json(origin, 200, {
    state: "resting",
    reason,
    text: "The assistant is resting right now. The buyer & seller guides cover flood zones, " +
      "neighborhoods, and the buying process in depth — or reach Serge directly for a free consult.",
    ctas: [
      { label: "Browse the guides", href: "/guides/" },
      { label: "Book a consult with Serge", href: "/contact/" }
    ]
  });
}
function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) }
  });
}

const tripwires = compileTripwires((corpus as any).guardrails);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return resting(origin, "method");

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // No key / no store wired yet → honest resting state (never error).
    if (!apiKey || !supabaseUrl || !serviceKey) return resting(origin, "not-configured");

    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim();
    const sessionId = String(body?.sessionId ?? "").trim();
    // Bound the client-supplied fields before anything durable is written (F7).
    if (!question || question.length > 500 || !sessionId || sessionId.length > 100) {
      return resting(origin, "bad-request");
    }
    // Forwarded client IP for the griefing throttle (F2). May be spoofable, but it
    // raises the bar past trivial sessionId rotation; empty → IP throttle skipped.
    const clientIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
      || (req.headers.get("x-real-ip") ?? "").trim();

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ---- hard spend cap + per-session + per-IP rate limit + cost reservation (atomic) ----
    const { data: pre, error: preErr } = await db.rpc("concierge_precheck", {
      p_session: sessionId,
      p_ip: clientIp,
      p_day_cap: DAY_CAP,
      p_month_cap: MONTH_CAP,
      p_session_turn_cap: SESSION_TURN_CAP,
      p_ip_turn_cap: IP_TURN_CAP,
      p_ip_window_min: IP_WINDOW_MIN,
      p_reserve: WORST_CASE_TURN_USD
    });
    if (preErr) return resting(origin, "meter-unavailable");        // fail-safe
    if (!pre?.allowed) return resting(origin, pre?.reason ?? "cap"); // ceiling hit → degrade

    // ---- the guardrail loop (answer + semantic judge; 2+ model calls) ----
    const result = await answer({
      apiKey,
      question,
      corpus: (corpus as any).corpus,
      tripwires,
      feedGated: (corpus as any).feedGated,
      serveModel: SERVE_MODEL,
      judgeModel: JUDGE_MODEL
    });

    // ---- reconcile the reserved cost down to actual + PII-minimized query log ----
    // Spend-cap integrity is separate from the log (F1): if this reconcile fails,
    // the worst-case reservation stays booked (cap keeps binding) and we log LOUD
    // so a systematic failure is visible — never a silent under-meter.
    const { error: recErr } = await db.rpc("concierge_record_spend", {
      p_cost: result.costUsd,
      p_reserved: WORST_CASE_TURN_USD
    });
    if (recErr) console.error("concierge: record_spend reconcile FAILED (worst-case stays booked):", recErr.message);
    await db.from("concierge_query_log").insert({
      session_hash: await sha256Hex(sessionId),
      category: categorize(question),
      // Category-only by default; scrubbed query text only if the operator opts in.
      query_scrubbed: LOG_QUERY_TEXT ? scrubPII(question) : null,
      answered: true,
      suppressed: result.suppressed,
      route: result.route,
      model: result.serveModel,
      cost_usd: result.costUsd,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut
    }).catch(() => {}); // logging must never break the answer

    return json(origin, 200, {
      state: "live",
      text: result.text,
      citations: result.citations,
      route: result.route,
      ctas: result.route === "search"
        ? [{ label: "Open listing search", href: "/search/" }]
        : result.route === "contact"
          ? [{ label: "Book a consult with Serge", href: "/contact/" }]
          : []
    });
  } catch (_e) {
    // ANY failure → honest resting state. Never a 500 to the visitor.
    return resting(origin, "error");
  }
});
