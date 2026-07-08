/**
 * Local + CI checks for the preview build (wave 0 rail).
 * Run: npm run check (builds first) — or node scripts/check.mjs on an existing _site/.
 *
 * Checks: required surfaces · noindex everywhere · sitemap.xml XML
 * well-formedness + loc↔file agreement · robots.txt disallow-all · llms.txt ·
 * JSON-LD parse on every page · internal-link integrity · intake endpoint
 * preserved-but-inert · tokens.css generated.
 */
import fs from "node:fs";
import path from "node:path";
import { XMLValidator } from "fast-xml-parser";
import siteData from "../src/_data/site.js";

const SITE = path.resolve(process.cwd(), "_site");
// Deliberately a pinned literal (NOT read from the source it checks): if the
// site's endpoint ever changes, this check must fail LOUDLY so the change is
// re-reviewed against the never-POST / preserved-endpoint charter constraint.
const INTAKE_ENDPOINT = "https://selenko.app.n8n.cloud/webhook/intake-everlane";
// Single-sourced from src/_data/site.js — sitemap <loc> URLs are absolute against this base.
const SITE_URL = siteData.url;
const BASE_PATH = new URL(SITE_URL + "/").pathname; // e.g. "/everlane-realty-preview/"

let failures = 0;
let passes = 0;
function ok(msg) { passes++; console.log(`  ok  ${msg}`); }
function fail(msg) { failures++; console.error(`FAIL  ${msg}`); }

if (!fs.existsSync(SITE)) {
  console.error("_site/ not found — run `npm run build` first (or use `npm run check`).");
  process.exit(2);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const htmlFiles = [...walk(SITE)].filter((f) => f.endsWith(".html"));
const rel = (f) => path.relative(SITE, f);

/* ---- 1 · Required surfaces (plan §2 IA — every launch surface has a stub) ---- */
const required = [
  "index.html",
  "search/index.html",
  "valuation/index.html",
  "market/index.html",
  "neighborhoods/index.html",
  "neighborhoods/old-northeast/index.html",
  "guides/index.html",
  "guides/flood-zones-insurance-st-pete/index.html",
  "guides/best-neighborhoods-st-petersburg/index.html",
  "team/serge-osaulenko/index.html",
  "about/index.html",
  "contact/index.html",
  "ai/index.html",
  "privacy/index.html",
  "terms/index.html",
  "dmca/index.html",
  "accessibility/index.html",
  "404.html",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "assets/tokens.css",
  "assets/styles.css",
  "assets/site.js",
  "assets/favicon.svg",
  ".nojekyll"
];
for (const r of required) {
  if (fs.existsSync(path.join(SITE, r))) ok(`surface exists: ${r}`);
  else fail(`missing required surface: ${r}`);
}

/* ---- 2 · noindex on EVERY page (preview must not be indexable) ---- */
{
  let bad = 0;
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    if (!html.includes('<meta name="robots" content="noindex">')) {
      fail(`missing noindex: ${rel(f)}`);
      bad++;
    }
  }
  if (!bad) ok(`noindex present in all ${htmlFiles.length} HTML pages`);
}

/* ---- 3 · sitemap.xml: well-formed XML, every loc built, no excluded pages ---- */
{
  const smPath = path.join(SITE, "sitemap.xml");
  if (fs.existsSync(smPath)) {
    const xml = fs.readFileSync(smPath, "utf8");
    const valid = XMLValidator.validate(xml);
    if (valid === true) ok("sitemap.xml is well-formed XML");
    else fail(`sitemap.xml invalid XML: ${JSON.stringify(valid)}`);

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (locs.length > 0) ok(`sitemap.xml has ${locs.length} <loc> entries`);
    else fail("sitemap.xml has zero <loc> entries");
    for (const loc of locs) {
      const u = new URL(loc);
      let p = decodeURIComponent(u.pathname);
      if (p.startsWith(BASE_PATH)) p = "/" + p.slice(BASE_PATH.length);
      if (p.endsWith("/")) p += "index.html";
      if (!fs.existsSync(path.join(SITE, p))) fail(`sitemap loc has no built file: ${loc}`);
    }
    if (locs.some((l) => l.includes("404"))) fail("404 page must not be in sitemap");
    else ok("404 not in sitemap");
  }
}

/* ---- 4 · robots.txt: preview disallow-all ---- */
{
  const rPath = path.join(SITE, "robots.txt");
  if (fs.existsSync(rPath)) {
    const robots = fs.readFileSync(rPath, "utf8");
    if (/^User-agent: \*$/m.test(robots) && /^Disallow: \/$/m.test(robots)) {
      ok("robots.txt is disallow-all (preview policy)");
    } else fail("robots.txt is not disallow-all — preview must not be crawlable");
  }
}

/* ---- 5 · llms.txt non-empty and marked preview ---- */
{
  const lPath = path.join(SITE, "llms.txt");
  if (fs.existsSync(lPath)) {
    const llms = fs.readFileSync(lPath, "utf8");
    if (llms.trim().length > 100 && llms.includes("PREVIEW")) ok("llms.txt generated and marked PREVIEW");
    else fail("llms.txt empty or missing PREVIEW marker");
  }
}

/* ---- 6 · JSON-LD: every block on every page must parse; key pages must have blocks ---- */
{
  let blocks = 0, badBlocks = 0;
  const mustHave = {
    "index.html": "RealEstateAgent",
    "team/serge-osaulenko/index.html": "Person",
    "guides/flood-zones-insurance-st-pete/index.html": "Article",
    "guides/best-neighborhoods-st-petersburg/index.html": "Article",
    "neighborhoods/old-northeast/index.html": "Article"
  };
  const found = {};
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      blocks++;
      try {
        const parsed = JSON.parse(m[1]);
        if (!parsed["@context"] || !parsed["@type"]) {
          fail(`JSON-LD missing @context/@type in ${rel(f)}`);
          badBlocks++;
        } else {
          (found[rel(f)] ??= []).push(parsed["@type"]);
        }
      } catch (e) {
        fail(`JSON-LD does not parse in ${rel(f)}: ${e.message}`);
        badBlocks++;
      }
    }
  }
  if (!badBlocks) ok(`all ${blocks} JSON-LD blocks parse with @context/@type`);
  for (const [page, type] of Object.entries(mustHave)) {
    if ((found[page] || []).includes(type)) ok(`${page} carries ${type} JSON-LD`);
    else fail(`${page} missing required ${type} JSON-LD`);
  }
  const crumbPages = Object.entries(found).filter(([, t]) => t.includes("BreadcrumbList"));
  if (crumbPages.length >= 2) ok(`BreadcrumbList JSON-LD present on ${crumbPages.length} pages`);
  else fail("expected BreadcrumbList JSON-LD on breadcrumbed pages");
}

/* ---- 7 · Internal links resolve to built files ---- */
{
  let checked = 0, broken = 0;
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      const raw = m[1];
      if (/^(https?:|\/\/|mailto:|tel:|data:|#)/.test(raw)) continue;
      const clean = raw.split("#")[0].split("?")[0];
      if (!clean) continue;
      let target;
      if (clean.startsWith("/")) target = path.join(SITE, clean);
      else target = path.resolve(path.dirname(f), clean);
      if (clean.endsWith("/")) target = path.join(target, "index.html");
      checked++;
      if (!fs.existsSync(target)) {
        // allow extensionless directory-style links
        if (fs.existsSync(path.join(target, "index.html"))) continue;
        fail(`broken internal link in ${rel(f)}: ${raw}`);
        broken++;
      }
    }
  }
  if (!broken) ok(`all ${checked} internal links resolve`);
}

/* ---- 8 · Intake endpoint: PRESERVED in source, INERT in behavior ---- */
{
  const js = fs.readFileSync(path.join(SITE, "assets/site.js"), "utf8");
  if (js.includes(INTAKE_ENDPOINT)) ok("intake endpoint string preserved in built site.js");
  else fail("intake endpoint string missing from built site.js (charter: preserve in source)");
  const previewIdx = js.indexOf("PREVIEW_MODE = true");
  const fetchIdx = js.indexOf("fetch(INTAKE_ENDPOINT");
  if (previewIdx > -1 && fetchIdx > -1 && previewIdx < fetchIdx) {
    ok("PREVIEW_MODE guard present ahead of the fetch path in built site.js");
  } else fail("PREVIEW_MODE guard missing or not ahead of fetch in built site.js");

  const contact = fs.readFileSync(path.join(SITE, "contact/index.html"), "utf8");
  if (/<fieldset class="form-preview-disabled" disabled>/.test(contact)) ok("contact form fields wrapped in <fieldset disabled>");
  else fail("contact form is not rendered disabled");
  if (contact.includes("Preview — form disabled") || contact.includes("Preview &mdash; form disabled")) ok('visible "Preview — form disabled" label present');
  else fail('missing visible "Preview — form disabled" label');
  let actionable = 0;
  for (const f of htmlFiles) {
    if (fs.readFileSync(f, "utf8").includes(`action="${INTAKE_ENDPOINT}`)) actionable++;
  }
  if (!actionable) ok("no HTML form posts directly to the intake endpoint");
  else fail("an HTML form action targets the live intake endpoint");
}

/* ---- 9 · tokens.css is build-generated and carries the LOCKED system ---- */
{
  const tokens = fs.readFileSync(path.join(SITE, "assets/tokens.css"), "utf8");
  if (tokens.includes(":root") && tokens.includes("LOCKED")) ok("tokens.css generated from data file, marked LOCKED");
  else fail("tokens.css missing :root or LOCKED status marker");
  if (tokens.includes("PLACEHOLDER")) fail("tokens.css still carries the PLACEHOLDER marker — the system is locked");
  else ok("tokens.css placeholder marker gone");
  // The 9 locked palette tokens (C · St. Pete Editorial, rationale §6/§7;
  // c-paper re-toned #F1EEE6 → #F5F5F1 per operator feedback 2026-07-08 — lighter/de-yellowed):
  const locked = ["#FAFAF6", "#22261F", "#5F6458", "#C98A8F", "#9E4A52", "#3E5C43", "#F5F5F1", "#DDDACE", "#C2C6B8"];
  const missing = locked.filter((hex) => !tokens.includes(hex));
  if (!missing.length) ok("all 9 locked palette tokens present in tokens.css");
  else fail(`locked palette tokens missing from tokens.css: ${missing.join(", ")}`);
}

/* ---- 10 · WAVE 1: locked homepage grammar order (rationale §2 — BOUND) ---- */
{
  const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const order = ["hero", "verify", "doors", "databand", "listings", "hoods", "guides", "proof", "booking"];
  const found = [...home.matchAll(/data-sec="([a-z]+)"/g)].map((m) => m[1]);
  // Exact match, no filtering: a rogue/unexpected data-sec on home is a grammar break too.
  if (JSON.stringify(found) === JSON.stringify(order)) {
    ok(`homepage sections in the locked order, no rogue sections: ${order.join(" → ")}`);
  } else {
    fail(`homepage section order broken — expected exactly ${order.join(",")} got ${found.join(",")}`);
  }
  // mast + footer come from the layout on every page:
  if (home.includes('class="site-header"') && home.includes('class="site-footer"')) ok("mast + footer present on home");
  else fail("mast or footer missing on home");
  // The amended verify byline (operator r2 amendment): split block present.
  if (home.includes('class="verify"') && home.includes("verify__photo") && home.includes("verify__info")) {
    ok("amended verify byline present (photo/info split block)");
  } else fail("amended verify byline block missing on home");
}

/* ---- 11 · WAVE 1: synced-line build-coupling (real sync age or NOTHING) ----
   The honesty-line organ is "listings synced <age> ago". Case-insensitive, and
   gated on the feed value: while feed.listingsSyncedAgo is null the line must
   appear NOWHERE; once wave 2 wires a real value, the line must render it.
   (The /ai/ colophon's "Listings synced today" COUNTER label is a different
   organ — a wave-3 live counter, no age claim — and is deliberately not
   matched by the "… ago" pattern.) */
{
  const feed = (await import("../src/_data/feed.js")).default;
  const syncedRe = /listings synced\s+\S[^<]*\bago\b/i;
  if (feed.listingsSyncedAgo == null) {
    let leaked = 0;
    for (const f of htmlFiles) {
      if (syncedRe.test(fs.readFileSync(f, "utf8"))) {
        fail(`synced line rendered without a real feed value: ${rel(f)}`);
        leaked++;
      }
    }
    if (!leaked) ok("no 'listings synced … ago' line in built HTML (coupling honored while feed value is null)");
  } else {
    const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
    if (home.includes(`listings synced ${feed.listingsSyncedAgo} ago`)) {
      ok(`synced line renders the real feed value (${feed.listingsSyncedAgo})`);
    } else fail("feed.listingsSyncedAgo is set but the synced line does not render it on home");
  }
}

/* ---- 12 · WAVE 1: no external font requests (license DEFERRED, free path) ---- */
{
  const cssFiles = [...walk(SITE)].filter((f) => f.endsWith(".css"));
  let bad = 0;
  for (const f of cssFiles) {
    const css = fs.readFileSync(f, "utf8");
    if (/@font-face/i.test(css)) { fail(`@font-face in built CSS (webfont decision is deferred): ${rel(f)}`); bad++; }
    if (/url\s*\(/i.test(css)) { fail(`url() in built CSS (no external/asset fetches from CSS): ${rel(f)}`); bad++; }
  }
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    if (/fonts\.googleapis|fonts\.gstatic|use\.typekit|fontspring\.com|myfonts\.com/i.test(html)) {
      fail(`external font host referenced: ${rel(f)}`);
      bad++;
    }
  }
  if (!bad) ok(`no @font-face / url() in built CSS, no external font hosts in HTML (${cssFiles.length} css, ${htmlFiles.length} html)`);
}

/* ---- 13 · WAVE 2: KB-page honesty + compliance surfaces ----
   (a) HONEST STAT BAND (charter rule, plan §3d): while feed.marketStats is
       null, kb-driven stats surfaces (market hub + neighborhood chapters)
       must NOT render sample figures — the "SAMPLE FIGURES" band phrase is
       banned there (home keeps its labeled preview band, a wave-0/1 call).
   (b) Art. 15.01.A notice present on every stats surface even while pending
       (compliance fold: "Based on information from Stellar MLS®…").
   (c) E-E-A-T visible stamps: live kb pages show "Last verified"/"Updated"
       and the named author in the rendered HTML.
   (d) Article JSON-LD on kb pages carries real dates (no TODO left). */
{
  const feed = (await import("../src/_data/feed.js")).default;
  const kbStatPages = ["market/index.html"];
  // every built neighborhood chapter is a kb stats surface:
  const hoodDir = path.join(SITE, "neighborhoods");
  for (const e of fs.readdirSync(hoodDir, { withFileTypes: true })) {
    if (e.isDirectory()) kbStatPages.push(`neighborhoods/${e.name}/index.html`);
  }
  let bad = 0;
  for (const p of kbStatPages) {
    const f = path.join(SITE, p);
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    if (feed.marketStats == null && html.includes("SAMPLE FIGURES")) {
      fail(`kb stats surface renders sample figures while feed is null: ${p}`); bad++;
    }
    if (!html.includes("Based on information from Stellar MLS")) {
      fail(`missing Art. 15.01.A notice on stats surface: ${p}`); bad++;
    }
    // No UNLABELED process copy leaks into public kb surfaces (wave-2 grade
    // finding 9 — same defect class the wave-1 grade scrubbed once already).
    // Deliberate, visibly-labeled preview stubs (<span class="stub-note">, the
    // wave-1 idiom — e.g. the footer's MLS GRID attribution slot awaiting the
    // compliance lane's final text) are tolerated until their owners land.
    const bodyOnly = html.replace(/<span class="stub-note">[\s\S]*?<\/span>/g, "");
    if (/\[Art\.|compliance lane/i.test(bodyOnly)) {
      fail(`process copy leaked into rendered kb surface (bracketed slot / "compliance lane"): ${p}`); bad++;
    }
  }
  if (!bad) ok(`kb stats surfaces honest + Art. 15 notice present + no process-copy leaks (${kbStatPages.length} pages)`);

  const kbPages = [
    ["guides/flood-zones-insurance-st-pete/index.html", "Last verified"],
    ["guides/best-neighborhoods-st-petersburg/index.html", "Last verified"],
    ["neighborhoods/old-northeast/index.html", "Updated"]
  ];
  let badStamp = 0;
  for (const [p, stamp] of kbPages) {
    const html = fs.readFileSync(path.join(SITE, p), "utf8");
    if (!html.includes(stamp) || !html.includes("Serge Osaulenko")) {
      fail(`kb page missing visible ${stamp}/author stamp: ${p}`); badStamp++;
    }
    if (!html.includes("Sources for this")) {
      fail(`kb page missing on-page sources section (Rule 16/21 render visibility): ${p}`); badStamp++;
    }
    if (/TODO\(KB pipeline/.test(html)) {
      fail(`kb page JSON-LD still carries TODO dates: ${p}`); badStamp++;
    }
  }
  if (!badStamp) ok("kb pages carry visible author + date stamps, on-page sources, dated JSON-LD");
}

/* ---- 14 · WAVE 2: measurement layer — double-gated, PII-free ----
   (Feed & Ops lane.) Build gate: no GA4_ID env ⇒ zero analytics markup in
   built HTML. Runtime gate: analytics.js must host-gate on
   location.hostname BEFORE any gtag load, and elTrack call sites must not
   ship PII fields. */
{
  const analyticsData = (await import("../src/_data/analytics.js")).default;

  let tagged = 0;
  for (const f of htmlFiles) {
    if (/data-ga4=/.test(fs.readFileSync(f, "utf8"))) tagged++;
  }
  if (analyticsData.ga4Id == null) {
    if (!tagged) ok("no analytics markup in built HTML (GA4_ID unset — build gate holds)");
    else fail(`analytics markup present in ${tagged} page(s) while GA4_ID is unset`);
  } else {
    if (tagged === htmlFiles.length) ok(`analytics markup on all ${tagged} pages (GA4_ID set at build)`);
    else fail(`GA4_ID set but analytics markup on only ${tagged}/${htmlFiles.length} pages`);
  }

  const aPath = path.join(SITE, "assets/analytics.js");
  if (fs.existsSync(aPath)) {
    const a = fs.readFileSync(aPath, "utf8");
    const gateIdx = a.indexOf("HOSTS.indexOf(window.location.hostname)");
    const loadIdx = a.indexOf("googletagmanager.com");
    if (gateIdx > -1 && loadIdx > -1 && gateIdx < loadIdx) {
      ok("analytics.js host-gates before the gtag loader (runtime gate present)");
    } else fail("analytics.js missing the hostname gate ahead of the gtag loader");
  } else fail("assets/analytics.js not built");

  const js = fs.readFileSync(path.join(SITE, "assets/site.js"), "utf8");
  if (js.includes('elTrack("generate_lead"')) ok("generate_lead conversion event wired on intake success");
  else fail("site.js missing the generate_lead elTrack call");
  const evStart = js.indexOf('elTrack("generate_lead"');
  const evCall = evStart > -1 ? js.slice(evStart, evStart + 200) : "";
  if (evStart > -1 && !/data\.(name|email|phone)/.test(evCall)) ok("conversion event carries no PII fields (name/email/phone absent)");
  else if (evStart > -1) fail("conversion event payload references PII fields");
}

/* ---- 15 · WAVE 2: feed-stale banner build-coupling ----
   (Feed & Ops lane, plan §5 dead-man.) The banner renders on EVERY page
   when FEED_STALE=1 (the dead-man's repository_dispatch) and on NO page
   otherwise — the same honesty pattern as check 11. */
{
  const envData = (await import("../src/_data/env.js")).default;
  let banners = 0;
  for (const f of htmlFiles) {
    if (fs.readFileSync(f, "utf8").includes('class="stale-banner"')) banners++;
  }
  if (envData.feedStale) {
    if (banners === htmlFiles.length) ok(`stale banner on all ${banners} pages (FEED_STALE build)`);
    else fail(`FEED_STALE set but banner on only ${banners}/${htmlFiles.length} pages`);
  } else {
    if (!banners) ok("no stale banner in built HTML (FEED_STALE unset — coupling holds)");
    else fail(`stale banner leaked into ${banners} page(s) without FEED_STALE`);
  }
}

console.log(`\n${passes} checks passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
