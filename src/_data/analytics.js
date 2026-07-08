/**
 * Measurement layer config (wave 2, plan §10 — Feed & Ops lane).
 *
 * GA4 is the bound default (operator gate answer 2026-07-07: free,
 * ads-native — the paid-traffic-attribution requirement made first-class).
 *
 * TWO gates, both must open before a single beacon fires:
 *  1) BUILD gate: `ga4Id` is null unless the GA4_ID env var is set at build
 *     (CI sets it from the repo Actions variable once the operator's GA4
 *     property exists). Null ⇒ NO analytics markup in built HTML at all.
 *  2) RUNTIME gate: /assets/analytics.js loads gtag ONLY when
 *     location.hostname is in `productionHosts` — the github.io preview,
 *     localhost, and any fork can carry the markup and still never beacon.
 *
 * Conversion events (spec: build/wave-2/feed-ops/analytics/analytics-spec.md):
 *  generate_lead (intake form success) · book_appointment (Cal.com embed)
 *  · concierge_lead (wave 3). All flow through window.elTrack — the single
 *  seam a Meta Pixel/CAPI layer would later subscribe to (readiness memo).
 */
export default {
  ga4Id: process.env.GA4_ID || null,
  productionHosts: ["everlanerealty.com", "www.everlanerealty.com"]
};
