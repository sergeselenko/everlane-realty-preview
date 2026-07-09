// AI Concierge — /ask/ client (re-website #149, Wave 3).
// STAGED INERT (runbook step 6): this file exists but is NOT loaded on /ask/
// (no passthrough-copy in eleventy.config.js, no <script> tag) until the wave-4
// live-flip (runbook step 10) — which also fills the ANON key below and enables
// the disabled <fieldset> in src/ask.njk. Until then the shell stays the honest
// "assistant offline" preview and nothing here runs.
//
// Behaviour when live: POSTs the question to the deployed `ask` edge function and
// degrades SILENTLY to the resting copy on any non-200 / {state:"resting"} / error.
// No PII is sent; the sessionId is a random UUID kept in localStorage.
(function () {
  var ENDPOINT = "https://iavsouedogroqzwmccwy.supabase.co/functions/v1/ask";
  // No apikey/Authorization header: the function is public (--no-verify-jwt) and
  // the Supabase gateway accepts the POST without one (verified at deploy). Sending
  // them would force a CORS preflight the function's Allow-Headers (content-type
  // only) rejects — so the ONLY request header is content-type, which is allowed.
  var form = document.querySelector(".chat-form");
  var log = document.querySelector(".chat-log");
  if (!form || !log) return;
  var sid = localStorage.getItem("el_ask_sid") ||
    (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  localStorage.setItem("el_ask_sid", sid);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var ta = form.querySelector("textarea"); var q = (ta.value || "").trim();
    if (!q) return;
    add("you", q); ta.value = "";
    fetch(ENDPOINT, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, sessionId: sid }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.state === "resting") {
          add("bot", (d && d.text) || "The assistant is resting — browse the guides or reach Serge directly.");
          return;
        }
        add("bot", d.text, d.citations, d.ctas);
      })
      .catch(function () { add("bot", "The assistant is resting — browse the guides or reach Serge directly."); });
  });
  // Root-relative CTA hrefs (/search/, /contact/) come from the edge function,
  // which doesn't know the site's path prefix; prefix them at render so they
  // resolve on the preview (github.io/everlane-realty-preview/…) as well as on
  // production. Absolute source URLs (citations) pass through untouched.
  var BASE = (window.__ASK_BASE__ || "/");
  function withBase(h) {
    if (!h || h === "#" || /^https?:/i.test(h)) return h;
    return BASE.replace(/\/+$/, "/") + String(h).replace(/^\/+/, "");
  }
  function add(who, text, cites, ctas) {
    var p = document.createElement("p");
    p.className = "chat-msg chat-msg--" + (who === "you" ? "you" : "bot");
    p.textContent = (who === "you" ? "You: " : "Assistant: ") + text;
    log.appendChild(p);
    if (cites && cites.length) {
      var s = document.createElement("p"); s.className = "chat-cites";
      cites.forEach(function (c) {
        var a = document.createElement("a"); a.href = withBase(c.url || c.href || "#");
        a.textContent = c.name || c.label || c.url; a.rel = "nofollow";
        s.appendChild(a); s.appendChild(document.createTextNode(" "));
      });
      log.appendChild(s);
    }
    if (ctas && ctas.length) {
      var c2 = document.createElement("p"); c2.className = "chat-ctas";
      ctas.forEach(function (c) {
        var a = document.createElement("a"); a.href = withBase(c.href || "#");
        a.className = "btn btn--primary"; a.textContent = c.label || "Continue";
        c2.appendChild(a); c2.appendChild(document.createTextNode(" "));
      });
      log.appendChild(c2);
    }
  }
})();
