/**
 * Booking (Cal.com) config — plan §2 row 9, calcom-embed-plan.md.
 *
 * calLink is the operator's PUBLIC Cal.com event link (no API key — the
 * booking URL is public by design). Provided by the operator 2026-07-08:
 * his profile is cal.com/serge-osaulenko with two event types (15min / 30min);
 * the 30-minute meeting is wired as the free consult (the site's booking copy
 * promises a free consult). To force the 15-minute event, the profile picker,
 * or a future dedicated "free-consult" slug, change the default below or set
 * CALCOM_LINK at build time — templates read ONLY booking.calLink.
 *
 * Unlike GA4 this is NOT environment-gated: the link is public and identical on
 * preview and production, so it defaults ON — the preview shows the real live
 * calendar for the operator's end-to-end test (calcom-embed-plan §2.5). When
 * calLink is unset the templates fall back to the mailto/phone + sample slots.
 */
export default {
  calLink: process.env.CALCOM_LINK || "serge-osaulenko/30min",
  durationLabel: "30-minute"
};
