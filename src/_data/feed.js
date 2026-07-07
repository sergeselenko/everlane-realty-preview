/**
 * Feed-mirror surface data — the BUILD-COUPLING switchboard (rationale §6).
 *
 * `listingsSyncedAgo` drives the "listings synced N min ago" honesty line
 * (B's organ in editorial dress). BOUND COUPLING (round-2 grade finding 8):
 * the line renders the REAL sync age from the feed watcher or it does not
 * render at all — an aspirational freshness claim would be the exact
 * dishonesty the line exists to preclude. It is null here BY DESIGN; wave 2
 * wires it to the feed mirror's sync timestamp (plan §5: 4h target, 12h
 * Rule-11 floor). Templates gate on this value — while null, NO synced line
 * appears anywhere in built HTML (checked by scripts/check.mjs).
 *
 * `marketStats` is the wave-2 slot for the computed stat band (SQL-computed,
 * never a model — plan §3a). While null, the band renders SAMPLE-labeled
 * figures (permitted for a labeled preview; rationale §7/§6).
 */
export default {
  listingsSyncedAgo: null, // wave 2: e.g. "22 min" — real feed-watcher value ONLY
  marketStats: null // wave 2: feed mirror `market_stats` — replaces SAMPLE figures
};
