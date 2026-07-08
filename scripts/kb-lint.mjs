/**
 * KB lint — the machine-checkable slice of the KB's bound editorial rules
 * (wave 2, Content/KB lane; runs in `npm run check` and CI).
 *
 *  1 · FACT DISCIPLINE (plan §3a): every kb/facts entry carries
 *      value + source + source_url + as_of + last_verified + confidence.
 *  2 · PAGE DISCIPLINE (E-E-A-T, R2 §1.4): every LIVE kb page carries a named
 *      author, published/last_verified dates, review cadence, question, and a
 *      non-empty sources list (name + url + accessed each).
 *  3 · FAIR HOUSING (chassis rule, bound by the round-2 grade finding 3):
 *      place-not-people copy. Demographic-steering patterns fail the build.
 *  4 · RULE 32 STOP-LIST (compliance lane, build/wave-2/compliance/
 *      rules-current-read.md): never "search the MLS" / "access the MLS"
 *      in any kb entry or page-template copy.
 *  5 · NO MODEL NUMBERS SMELL-TEST: live kb prose must not carry
 *      median/DOM/inventory-style market-stat claims (those render from the
 *      feed mirror or not at all — plan §3d). Heuristic, not exhaustive:
 *      the human gate stays the real check.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";

const ROOT = process.cwd();
const KB = path.join(ROOT, "kb");

let failures = 0;
let passes = 0;
const ok = (m) => { passes++; console.log(`  ok  ${m}`); };
const fail = (m) => { failures++; console.error(`FAIL  ${m}`); };

/* ---- 1 · facts discipline ---- */
{
  const dir = path.join(KB, "facts");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  if (!files.length) fail("kb/facts/ has no yaml files");
  for (const f of files) {
    const doc = yaml.load(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!doc?.domain || !doc?.updated || !doc?.review) {
      fail(`kb/facts/${f}: missing domain/updated/review header`);
      continue;
    }
    let bad = 0;
    for (const fact of doc.facts || []) {
      for (const k of ["id", "value", "source", "source_url", "as_of", "last_verified", "confidence"]) {
        if (!fact?.[k]) { fail(`kb/facts/${f} → ${fact?.id || "(no id)"}: missing ${k}`); bad++; }
      }
      if (fact?.confidence && !["HIGH", "MEDIUM", "LOW"].includes(fact.confidence)) {
        fail(`kb/facts/${f} → ${fact.id}: confidence must be HIGH|MEDIUM|LOW`); bad++;
      }
    }
    if (!bad) ok(`kb/facts/${f}: ${(doc.facts || []).length} facts, all carry value+source+dates+confidence`);
  }
}

/* ---- 2 · page discipline ---- */
const pages = [];
for (const sub of ["guides", "neighborhoods"]) {
  const dir = path.join(KB, sub);
  if (!fs.existsSync(dir)) { fail(`kb/${sub}/ missing`); continue; }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md") && x.toLowerCase() !== "readme.md")) {
    const { data, content } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
    pages.push({ file: `kb/${sub}/${f}`, data, content });
  }
}
{
  const slugs = new Set();
  for (const p of pages) {
    const s = p.data.slug;
    if (slugs.has(`${p.data.type}:${s}`)) fail(`duplicate slug ${s} (${p.file})`);
    slugs.add(`${p.data.type}:${s}`);
  }
  let bad = 0;
  for (const p of pages) {
    // status is a strict enum — a typo ("Live") would silently unbuild the page
    // (kb.js filters on exact "live"); fail loudly instead (grade finding 8).
    if (!["live", "outline"].includes(p.data.status)) {
      fail(`${p.file}: status must be exactly "live" or "outline" (got "${p.data.status}")`); bad++;
    }
    const req = p.data.status === "live"
      ? ["slug", "type", "status", "title", "question", "description", "author", "published", "last_verified", "review"]
      : ["slug", "type", "status", "title", "last_verified"];
    for (const k of req) if (!p.data[k]) { fail(`${p.file}: missing front matter ${k}`); bad++; }
    // Sources: REQUIRED non-empty on live entries (kb/README.md schema).
    // Optional on outlines — but if present, entries must be real and complete
    // (no check-satisfying filler; grade finding 7).
    if (p.data.status === "live" && (!Array.isArray(p.data.sources) || !p.data.sources.length)) {
      fail(`${p.file}: live entry with missing/empty sources list`); bad++;
    }
    if (Array.isArray(p.data.sources)) {
      for (const s of p.data.sources) {
        for (const k of ["name", "url", "accessed"]) {
          if (!s?.[k]) { fail(`${p.file}: source entry missing ${k}`); bad++; }
        }
      }
    }
    if (p.data.status === "live" && /\bTODO\b/.test(p.content)) {
      fail(`${p.file}: live entry contains TODO`); bad++;
    }
  }
  if (!bad) ok(`${pages.length} kb pages: front matter complete (author/dates/sources per status)`);
}

/* ---- 3 · fair housing: place, never people ---- */
{
  const patterns = [
    [/who it fits/i, `"who it fits" framing`],
    [/\b(perfect|ideal|great|suited|best) for (young|famil|retiree|professional|couple|single|empty|kids)/i, "who-it-fits copy pattern"],
    [/\byoung (families|professionals|couples)\b/i, "demographic labeling"],
    [/\bretirees\b/i, "demographic labeling"],
    [/\bempty[ -]?nesters?\b/i, "demographic labeling"],
    [/\bfamilies with (kids|children)\b/i, "familial-status steering"],
    [/\bgood schools\b/i, "school-quality steering"],
    [/\bseniors\b/i, "demographic labeling"],
    [/\b55\+/, "age-restriction framing"],
    [/\bstudents\b/i, "demographic labeling"],
    [/\bsingles\b/i, "demographic labeling"]
  ];
  let bad = 0;
  for (const p of pages) {
    const text = `${JSON.stringify(p.data)}\n${p.content}`;
    for (const [re, label] of patterns) {
      const m = text.match(re);
      if (m) { fail(`${p.file}: fair-housing pattern (${label}): "${m[0]}"`); bad++; }
    }
  }
  if (!bad) ok(`fair-housing chassis rule: no steering patterns in ${pages.length} kb entries`);
}

/* ---- 4 · Rule 32 stop-list (kb entries + page templates) ---- */
{
  const stop = /\b(search|access)\s+the\s+MLS\b/i;
  let bad = 0;
  const targets = pages.map((p) => [p.file, `${JSON.stringify(p.data)}\n${p.content}`]);
  const srcDir = path.join(ROOT, "src");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(srcDir).filter((f) => /\.(njk|md|html)$/.test(f))) {
    targets.push([path.relative(ROOT, f), fs.readFileSync(f, "utf8")]);
  }
  for (const [name, text] of targets) {
    if (stop.test(text)) { fail(`${name}: Rule 32 stop-list phrase ("search/access the MLS")`); bad++; }
  }
  if (!bad) ok(`Rule 32 stop-list clean across ${targets.length} kb entries + templates`);
}

/* ---- 5 · no market-stat claims in live kb prose (heuristic) ---- */
{
  const statSmell = /(median (sale )?price (is|of|sits at|around) \$[\d,]+|\$[\d,]+ median|days on market (is|of|around) \d+|\b\d+ active listings\b)/i;
  let bad = 0;
  for (const p of pages.filter((p) => p.data.status === "live")) {
    const m = p.content.match(statSmell);
    if (m) { fail(`${p.file}: market-stat claim in static prose ("${m[0]}") — stats render from the feed mirror only`); bad++; }
  }
  if (!bad) ok("no market-stat claims in live kb prose (feed-mirror-only rule)");
}

console.log(`\nkb-lint: ${passes} checks passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
