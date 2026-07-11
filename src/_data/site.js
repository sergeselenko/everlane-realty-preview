/**
 * Site-wide data. `url` is the absolute base used in sitemap.xml, canonical
 * links and JSON-LD; override with SITE_URL at deploy time (the CI deploy job
 * sets it to the GitHub Pages project URL).
 *
 * `preview` is THE cutover flag (launch-checklist #8 / build/wave-4/cutover-runbook.md).
 * It is the single source of truth for the whole preview→production containment:
 * flipping it true→false lifts every containment surface at once — the per-page
 * noindex + "— PREVIEW" title + ribbon (base.njk), robots disallow-all (robots.njk),
 * the llms.txt preview marker (llms.njk), both intake <fieldset disabled> (contact/
 * valuation), the client-side PREVIEW_MODE form gate (base.njk emits it as
 * <html data-preview>, assets/site.js reads it), and the `url` default below.
 * check.mjs asserts the matching posture for whichever value this holds, so
 * `npm run check` VERIFIES the flip rather than failing red at cutover. The
 * remaining go-live steps a flag cannot do (SITE_URL/GA4_ID/legalEffectiveDate,
 * webhook live-test, DNS, port-to-production) are the cutover runbook.
 */
const preview = true; // ← THE ONE cutover flag. Flip to false at go-live (cutover-runbook.md).
const PREVIEW_URL = "https://sergeselenko.github.io/everlane-realty-preview";
const PRODUCTION_URL = "https://everlanerealty.com";

export default {
  name: "Everlane Realty",
  preview,
  // Legal effective date — set to the launch date at cutover (part of the cutover runbook).
  // Blank on preview → the legal pages read "on publication of this site" instead of a bracket stub.
  legalEffectiveDate: "",
  // SITE_URL (CI deploy job) always wins; otherwise the base follows the ONE flag.
  url: (process.env.SITE_URL || (preview ? PREVIEW_URL : PRODUCTION_URL)).replace(/\/$/, ""),
  description:
    "Search every home for sale in St. Petersburg & Tampa Bay, get new-listing alerts the moment they hit, and find out what your home is worth — with Serge Osaulenko at Everlane Realty.",
  broker: {
    name: "Serge Osaulenko",
    title: "Licensed Real Estate Broker",
    license: "BK3384892",
    phone: "727-490-8037",
    phoneHref: "+17274908037",
    email: "serge@everlanerealty.com",
    street: "447 3rd Ave N, Ste. 306",
    city: "St. Petersburg",
    state: "FL",
    zip: "33701"
  },
  mlsAttribution:
    "Listings courtesy of Stellar MLS as distributed by MLS GRID. Listing data is updated multiple times daily, direct from Stellar MLS."
};
