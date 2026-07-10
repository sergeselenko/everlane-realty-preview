/** Header + footer navigation (plan §2 IA — hub-and-spoke, everything ≤2 clicks from home).
 *  Header order is the LOCKED masthead grammar (rationale §2 row 1, lock 2026-07-07):
 *  Search homes · Home value · Neighborhoods · Guides · About · Book a consult (CTA).
 *  /market/ stays reachable via the footer (and the data band's context at wave 2). */
export default {
  header: [
    { title: "Home", url: "/" },
    { title: "Search homes", url: "/search/" },
    { title: "Home value", url: "/valuation/" },
    { title: "Neighborhoods", url: "/neighborhoods/" },
    { title: "Guides", url: "/guides/" },
    { title: "Ask Lane", url: "/ask/" },
    { title: "About", url: "/about/" }
  ],
  headerCta: { title: "Book a consult", url: "/contact/" },
  footerExplore: [
    { title: "Search homes", url: "/search/" },
    { title: "Home value", url: "/valuation/" },
    { title: "Market data", url: "/market/" },
    { title: "Neighborhoods", url: "/neighborhoods/" },
    { title: "Guides", url: "/guides/" },
    { title: "Ask Lane", url: "/ask/" },
    { title: "Meet Serge", url: "/team/serge-osaulenko/" },
    { title: "About", url: "/about/" },
    { title: "Contact", url: "/contact/" }
  ],
  footerFinePrint: [
    { title: "Privacy", url: "/privacy/" },
    { title: "Terms", url: "/terms/" },
    { title: "DMCA", url: "/dmca/" },
    { title: "Accessibility", url: "/accessibility/" },
    { title: "/ai — how this site runs", url: "/ai/" }
  ]
};
