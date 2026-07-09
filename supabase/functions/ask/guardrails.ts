// guardrails — the cheap, deterministic FIRST gate the edge function runs over
// every generated answer, plus the PII scrub for the query log and the coarse
// category derivation. The regex is a FLOOR / known-bad tripwire (see
// kb/guardrails/README.md): grounding + the semantic judge are the load-bearing
// fair-housing enforcement. This file is token-independent — no model calls.

export interface Pattern { id: string; pattern: string; flags: string; label: string; }
export interface Tripwire { id: string; label: string; domain: string; re: RegExp; }

/** Compile the fair-housing + mls-claims patterns shipped in the bundle. */
export function compileTripwires(guardrails: {
  fairHousing: Pattern[];
  mlsClaims: Pattern[];
}): Tripwire[] {
  const out: Tripwire[] = [];
  for (const p of guardrails.fairHousing) {
    out.push({ id: p.id, label: p.label, domain: "fair-housing", re: new RegExp(p.pattern, p.flags) });
  }
  for (const p of guardrails.mlsClaims) {
    out.push({ id: p.id, label: p.label, domain: "mls-claims", re: new RegExp(p.pattern, p.flags) });
  }
  return out;
}

/** First tripwire hit over the text, or null. A hit = suppress-and-regenerate. */
export function runTripwires(text: string, tripwires: Tripwire[]): Tripwire | null {
  for (const t of tripwires) {
    // fresh lastIndex each call (patterns are non-global, but be safe)
    t.re.lastIndex = 0;
    if (t.re.test(text)) return t;
  }
  return null;
}

/**
 * Scrub a user query to PII-free form BEFORE it is logged. Redacts emails,
 * phone numbers, street addresses, ZIPs, and long digit runs; caps length.
 * The log stores category + this scrubbed query only — never name/email/phone/
 * address, never the answer, never a transcript.
 */
export function scrubPII(raw: string): string {
  let s = (raw || "").slice(0, 500);
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
  s = s.replace(/(\+?\d[\d().\-\s]{7,}\d)/g, "[phone]");
  // street address: number + street words
  s = s.replace(/\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|terrace|ter|parkway|pkwy|highway|hwy)\b\.?/gi, "[address]");
  s = s.replace(/\b\d{5}(?:-\d{4})?\b/g, "[zip]");        // ZIP
  s = s.replace(/\b\d{4,}\b/g, "[num]");                   // any long digit run
  // Best-effort protected-class / self-identification scrub. Regex can never be
  // complete here (that is exactly why query text is off by default), but this
  // redacts the common "I'm a <X> ..." self-disclosures if logging is opted in.
  s = s.replace(/\b(i(?:'m| am)|we(?:'re| are)|as a|being a|for (?:my|our))\b[^.?!,;]{0,60}/gi, "[personal]");
  s = s.replace(/\b(muslim|christian|jewish|catholic|hindu|buddhist|churchgoing|synagogue|mosque|black|white|hispanic|latino|latina|asian|immigrant|disabled|wheelchair|single mom|single dad|single mother|single father|pregnant)\b/gi, "[redacted]");
  return s.replace(/\s+/g, " ").trim().slice(0, 240);
}

const CATEGORY_KEYS: Record<string, RegExp> = {
  flood: /\b(flood|fema|elevation|firm|zone\s*(ae|ve|x)|surge|hurricane|helene|milton)\b/i,
  insurance: /\b(insurance|premium|citizens|carrier|coverage|policy|nfip)\b/i,
  tax: /\b(tax|millage|homestead|save our homes|portability|assessed)\b/i,
  "short-term-rental": /\b(airbnb|short[- ]?term rental|str|vrbo|vacation rental)\b/i,
  neighborhood: /\b(neighborhood|old northeast|snell isle|shore acres|kenwood|downtown|gulfport|tierra verde|crescent lake|pinellas point)\b/i,
  inventory: /\b(listing|for sale|on the market|available|inventory|homes? (for sale|available)|price range|under \$)\b/i,
  process: /\b(process|closing|offer|contract|inspection|contingency|escrow|cma|valuation|appraisal|what.?s my home worth)\b/i,
  transit: /\b(transit|bus|suncoast|commute|airport|walkab)\b/i
};

/** Coarse, PII-free category for the query log. */
export function categorize(question: string): string {
  for (const [cat, re] of Object.entries(CATEGORY_KEYS)) {
    if (re.test(question)) return cat;
  }
  return "other";
}

/** sha256 hex of a string (for decoupling the logged session id). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
