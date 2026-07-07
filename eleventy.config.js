/**
 * Everlane Realty PREVIEW — Eleventy config (plain JS, ESM).
 *
 * SSG decision: Eleventy (plan §2, confirmed at wave 0 — see wave-0-rail-ktb.md;
 * Astro was the named runner-up). Zero client-JS by default matches the live
 * site's 20KB/818ms substrate ethos; every build regenerates sitemap.xml,
 * robots.txt, llms.txt and per-page JSON-LD — nothing discovery-layer is
 * hand-placed (kills the audit §2.2 "declared but 404" defect class).
 *
 * PATH_PREFIX: set when publishing to a GitHub Pages *project* page
 * (e.g. PATH_PREFIX=/everlane-realty-preview/). HtmlBasePlugin rewrites
 * root-relative URLs in HTML accordingly. Local builds default to "/".
 * SITE_URL: absolute base used in sitemap.xml, canonicals and JSON-LD.
 */
import { HtmlBasePlugin } from "@11ty/eleventy";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // Static assets copied verbatim. tokens.css is NOT here — it is generated
  // from src/_data/tokens.js on every build (the token pipeline).
  eleventyConfig.addPassthroughCopy({ "src/assets/styles.css": "assets/styles.css" });
  eleventyConfig.addPassthroughCopy({ "src/assets/site.js": "assets/site.js" });
  eleventyConfig.addPassthroughCopy({ "src/assets/favicon.svg": "assets/favicon.svg" });

  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    pathPrefix: process.env.PATH_PREFIX || "/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
}
