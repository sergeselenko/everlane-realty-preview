/**
 * Scene-illustration map (wave-4 image engine, 2026-07-11).
 *
 * Vintage-postcard-style neighborhood/guide/home art, generated to the operator's
 * 1934 St. Pete linen-postcard anchor (build/wave-4/image-engine-research/). This
 * data file SCANS src/assets/img/ and exposes the available images keyed by slug —
 * so a template renders a real <img> ONLY when the file exists, and falls back to
 * the honest placeholder plate otherwise (no broken image refs, by construction).
 *
 * These are ILLUSTRATIONS, not photographs — templates label them as such in alt
 * text (trust discipline on a real-estate site).
 */
import fs from "node:fs";
import path from "node:path";

const BASE = path.resolve(process.cwd(), "src/assets/img");

function mapDir(sub) {
  const dir = path.join(BASE, sub);
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => [f.replace(/\.[^.]+$/, ""), `/assets/img/${sub}/${f}`])
  );
}

const homePath = path.join(BASE, "home.jpg");

export default {
  home: fs.existsSync(homePath) ? "/assets/img/home.jpg" : null,
  neighborhoods: mapDir("neighborhoods"),
  guides: mapDir("guides")
};
