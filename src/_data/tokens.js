/**
 * ============================================================================
 * DESIGN TOKENS — PLACEHOLDER — AWAITING DESIGN CONVERGENCE ROUND 1 (plan §4)
 * ============================================================================
 * The brand is OPEN by the operator's 2026-07-07 ruling. These values are the
 * current live site's palette carried over ONLY so the wave-0 scaffold renders
 * legibly; they match NO candidate identity (the live navy/gold appears neither
 * in the 2020 brand guide nor in any explored direction — plan §4). The
 * Design-System Builder replaces this entire file when convergence locks the
 * identity (direction C "St. Pete Editorial" is the operator's live lead).
 *
 * This file is compiled into /assets/tokens.css on every build
 * (src/assets/tokens.css.njk). Templates and CSS consume ONLY the custom
 * properties — swapping this file restyles the whole site.
 *
 * One deliberate deviation from the live palette: `eyebrow` was #a9842f on
 * white = 3.48:1, a WCAG AA failure (audit §5.1). Placeholder uses slate
 * #486581 (6.08:1 on white, 5.50:1 on mist — computed 2026-07-07). AA
 * contrast is a hard constraint that survives ANY design direction (plan §4).
 */
export default {
  _status: "PLACEHOLDER — awaiting design convergence round 1 (plan §4; brand open, operator ruling 2026-07-07)",
  colors: {
    "navy": "#102a43",
    "navy-2": "#1c3d5a",
    "ink": "#243b53",
    "slate": "#486581",
    "mist": "#f0f4f8",
    "line": "#d9e2ec",
    "accent": "#c9a24b",
    "accent-dk": "#a9842f",
    "eyebrow": "#486581",
    "white": "#ffffff",
    "ok": "#2f855a",
    "err": "#c53030"
  },
  type: {
    "font": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    "font-display": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  },
  layout: {
    "radius": "10px",
    "shadow": "0 6px 24px rgba(16,42,67,.10)",
    "wrap": "1140px"
  }
};
