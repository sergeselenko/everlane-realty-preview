// /ask/ live flag (concierge wave-3 flip, #149). When true, src/ask.njk renders
// the working chat shell (fieldset enabled + ask.js loaded); when false it falls
// back to the honest "assistant offline" coming-state. Flipped ON at the wave-3
// preview go-live after the red-team + gap-finder cleared. The PRODUCTION repo
// carries its own copy of this flag and stays false until the wave-4 cutover.
export default true;
