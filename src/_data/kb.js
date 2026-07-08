/**
 * KB loader — compiles the public knowledge tree (kb/, repo root) into
 * build-time data (plan §3a, wave 2 Content/KB lane).
 *
 * The two-tree contract:
 *   - kb/            → PUBLIC knowledge distillate (this repo; PR-gated;
 *                      nothing lands here that isn't publishable).
 *   - research substrate → the firm's knowledge home (~/Projects/knowledge,
 *                      area-everlane-realty). Source PDFs, deep research,
 *                      interview notes. NEVER read by this build.
 *
 * What this file exposes to templates:
 *   kb.guidesLive / kb.neighborhoodsLive  → entries with status "live"
 *                      (each: front matter + `body` markdown). The from-kb
 *                      pagination templates build one page per live entry.
 *   kb.guidesPlanned / kb.neighborhoodsPlanned → status "outline" entries
 *                      (listed as coming-soon on index pages; NO page built —
 *                      an outline is a sourcing plan, not publishable prose).
 *   kb.facts         → kb/facts/<domain>.yaml parsed (value + source +
 *                      last-verified per entry; linted by scripts/kb-lint.mjs).
 *
 * Numbers discipline (plan §3d, BOUND): market statistics NEVER live in kb/
 * markdown — they come exclusively from the feed mirror (src/_data/feed.js →
 * Supabase market_stats, SQL-computed). kb/ carries narrative + sourced
 * regulatory/geographic facts only.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";

const KB_ROOT = path.resolve(process.cwd(), "kb");

function readMdDir(dir) {
  const abs = path.join(KB_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .map((f) => {
      const raw = fs.readFileSync(path.join(abs, f), "utf8");
      const { data, content } = matter(raw);
      const slug = data.slug || f.replace(/\.md$/, "");
      return { ...data, slug, body: content.trim(), _file: `kb/${dir}/${f}` };
    })
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug));
}

function readFacts() {
  const abs = path.join(KB_ROOT, "facts");
  const out = {};
  if (!fs.existsSync(abs)) return out;
  for (const f of fs.readdirSync(abs).filter((f) => /\.ya?ml$/.test(f))) {
    const doc = yaml.load(fs.readFileSync(path.join(abs, f), "utf8"));
    if (doc && doc.domain) out[doc.domain] = doc;
  }
  return out;
}

const guides = readMdDir("guides");
const neighborhoods = readMdDir("neighborhoods");

export default {
  guidesLive: guides.filter((g) => g.status === "live"),
  guidesPlanned: guides.filter((g) => g.status !== "live"),
  neighborhoodsLive: neighborhoods.filter((n) => n.status === "live"),
  neighborhoodsPlanned: neighborhoods.filter((n) => n.status !== "live"),
  facts: readFacts()
};
