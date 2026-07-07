/**
 * ============================================================================
 * DESIGN TOKENS — LOCKED: C · ST. PETE EDITORIAL (operator lock 2026-07-07)
 * ============================================================================
 * Source of truth: design-exploration/convergence-round-2/rationale.md §6
 * (the lock list) + client-materials/operator-design-verdict-r2-2026-07-07.md.
 * The 9 palette tokens below are C's round-1 palette carried verbatim through
 * round 2; every text/ground pair in use is computed against WCAG AA in
 * rationale §7 (35 pairs, 0 failures — contrast.py is the count of record).
 *
 * This file compiles to /assets/tokens.css on every build
 * (src/assets/tokens.css.njk). Templates and CSS consume ONLY the custom
 * properties — this file stays the single swap point.
 *
 * ----------------------------------------------------------------------------
 * TYPE — system faces with honest fallbacks (NO webfont ships in this build):
 *   display  = Avenir Next Condensed (Apple system face). Windows/Android
 *              visitors currently see Arial Narrow / a narrow grotesque —
 *              the identity forks by OS (rationale §5.2). This fork is
 *              INTERIM, not accepted: the r2 verdict binds the free path as
 *              system faces PLUS a free close-alternative webfont for
 *              non-Apple devices, CHOSEN ON PREVIEW — that choosing moment
 *              (candidates staged on a branch preview, self-hosted) is a
 *              named wave-1/2 staged item, and the raw fallback is what the
 *              Android review below will show until it lands.
 *   body     = Charter (Apple system face) → Bitstream Charter (Linux) →
 *              Iowan Old Style → Georgia.
 *
 * DEFERRED FONT-LICENSE DECISION (operator verdict r2, judgment 2 — deferred,
 * NOT declined): launch on the free path. Revisit the Avenir Next Condensed
 * perpetual self-hosted web license (Monotype via Fontspring/MyFonts, Demi
 * Bold + Bold, self-hosted WOFF2, ~50–80KB one-time — rationale §5.2) when
 * device analytics show Windows/Android share; the operator wants to see the
 * fallback himself on a real Android device first (the preview URL on any
 * phone). Free close-alternative plan if the quote surprises: Archivo Narrow
 * or Oswald (Google faces in the condensed register), SELF-HOSTED — closest
 * flavor picked on preview. Either way the face lands below as a local
 * @font-face; NEVER as an external request (zero-external-request posture).
 *
 *   -- @font-face slot (EMPTY by decision — fill only when the license lands) --
 *   -- @font-face {
 *   --   font-family: "Avenir Next Condensed";        (or the free alternative)
 *   --   src: local files under /assets/fonts/ ONLY — woff2, self-hosted;
 *   --        no Google Fonts CSS, no CDN, no external URL of any kind.
 *   --   font-weight: 600 700; font-display: swap;
 *   -- }
 * ----------------------------------------------------------------------------
 *
 * COMPAT ALIASES: wave-0 stub pages and a few inline styles still reference
 * the old token names (--navy, --slate, --accent, …). Those names now alias
 * the locked palette (var() references, single-sourced) so every stub page
 * inherits C's world with zero off-palette color. Aliases die as pages are
 * rebuilt on the chassis — do not use them in new templates.
 */
export default {
  _status:
    "LOCKED — C · St. Pete Editorial (operator lock 2026-07-07; rationale.md §6; verify-byline amendment lands in templates, not tokens)",
  colors: {
    // ---- the 9 locked palette tokens (C, round-1 verbatim) ----
    "c-bg": "#FAFAF6", // gallery ground (page background)
    "c-ink": "#22261F", // ink (text, dark bands, footer ground)
    "c-sub": "#5F6458", // secondary text on light grounds
    "c-pink": "#C98A8F", // decorative pink — rules/underlines + dark-ground eyebrows ONLY
    "c-pinkdeep": "#9E4A52", // deep pink — kickers/eyebrows on light grounds (AA-passing rung)
    "c-palm": "#3E5C43", // palm — links, labels, primary button, booking band
    "c-paper": "#F1EEE6", // paper card ground
    "c-paper-deep": "#E9E5D9", // deepened paper rung — card fills that must read against the gallery ground (operator feedback 7/7: hood cards blended in). AA on this ground, computed: ink 12.2 · sub 4.83 · palm 5.92 · pinkdeep 4.69 — all pass
    "c-line": "#DDDACE", // hairlines / borders
    "c-dark-sub": "#C2C6B8", // secondary text on dark (ink) grounds — incl. delta lines

    // ---- legacy compat aliases (wave-0 stub markup; single-sourced via var()) ----
    "navy": "var(--c-ink)",
    "navy-2": "var(--c-palm)",
    "ink": "var(--c-ink)",
    "slate": "var(--c-sub)",
    "mist": "var(--c-paper)",
    "line": "var(--c-line)",
    "accent": "var(--c-palm)",
    "accent-dk": "var(--c-palm)",
    "eyebrow": "var(--c-pinkdeep)",
    "white": "var(--c-bg)",

    // ---- functional states (form status only; render on their own tinted
    //      grounds, computed 2026-07-07: #276749 on #E8F5EE = 6.00:1,
    //      #9B2C2C on #FDEAEA = 6.50:1 — both pass AA) ----
    "ok": "#276749",
    "err": "#9B2C2C"
  },
  type: {
    "font":
      'Charter, "Bitstream Charter", "Iowan Old Style", Georgia, "Times New Roman", serif',
    "font-display":
      '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif'
  },
  layout: {
    // C's world is square-edged editorial: no radii, no drop shadows.
    "radius": "0",
    "shadow": "none",
    "wrap": "1040px"
  }
};
