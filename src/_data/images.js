/**
 * Scene-illustration map (wave-4 image engine, 2026-07-11).
 *
 * Vintage-postcard-style neighborhood/guide/home art, generated to the operator's
 * 1934 St. Pete linen-postcard anchor (build/wave-4/image-engine-research/). This
 * data file SCANS src/assets/img/ and, for each BASE image (a *.jpg NOT suffixed
 * -<width>), exposes { src, srcset } — the 1600px original plus whatever responsive
 * derivatives exist (scripts/derive-images.py writes -800 and -400). A template
 * renders a real <img> ONLY when the base file exists, else falls back to the honest
 * placeholder plate (no broken refs, by construction).
 *
 * These are ILLUSTRATIONS, not photographs — templates label them as such in alt
 * text (trust discipline on a real-estate site).
 */
import fs from "node:fs";
import path from "node:path";

const BASE = path.resolve(process.cwd(), "src/assets/img");
const WIDTHS = [400, 800]; // derivative widths; the base original is treated as 1600w
const ORIGINAL_W = 1600;
const isDerivative = (f) => /-\d+\.(jpe?g|png|webp)$/i.test(f);

function entry(sub, file) {
  const rel = (sub ? sub + "/" : "") + file;
  const src = `/assets/img/${rel}`;
  const stem = file.replace(/\.[^.]+$/, "");
  const ext = file.slice(file.lastIndexOf("."));
  const dir = sub ? path.join(BASE, sub) : BASE;
  const parts = [];
  for (const w of WIDTHS) {
    if (fs.existsSync(path.join(dir, `${stem}-${w}${ext}`))) {
      parts.push(`/assets/img/${sub ? sub + "/" : ""}${stem}-${w}${ext} ${w}w`);
    }
  }
  parts.push(`${src} ${ORIGINAL_W}w`);
  return { src, srcset: parts.join(", ") };
}

function mapDir(sub) {
  const dir = path.join(BASE, sub);
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !isDerivative(f))
      .map((f) => [f.replace(/\.[^.]+$/, ""), entry(sub, f)])
  );
}

export default {
  home: fs.existsSync(path.join(BASE, "home.jpg")) ? entry("", "home.jpg") : null,
  neighborhoods: mapDir("neighborhoods"),
  guides: mapDir("guides")
};
