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
    "guides/flood-zones-insurance-st-pete/index.html": "Article"
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

/* ---- 9 · tokens.css is build-generated with the placeholder marker ---- */
{
  const tokens = fs.readFileSync(path.join(SITE, "assets/tokens.css"), "utf8");
  if (tokens.includes(":root") && tokens.includes("PLACEHOLDER")) ok("tokens.css generated from data file, marked PLACEHOLDER");
  else fail("tokens.css missing :root or PLACEHOLDER status marker");
}

console.log(`\n${passes} checks passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
