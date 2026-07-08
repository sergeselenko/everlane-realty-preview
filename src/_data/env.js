/**
 * Build-environment flags (wave 2, Feed & Ops).
 *
 * feedStale: set by CI when the feed dead-man watcher fires the
 * `feed-stale` repository_dispatch at the 12h MLS-GRID Rule-11 floor
 * (plan §5). Bakes a visible "data may be stale" banner into every page;
 * the next `feed-sync` dispatch rebuilds without it. Never set on normal
 * pushes — see .github/workflows/ci.yml.
 */
export default {
  feedStale: process.env.FEED_STALE === "1"
};
