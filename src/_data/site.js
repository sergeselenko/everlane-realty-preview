/**
 * Site-wide data. `url` is the absolute base used in sitemap.xml, canonical
 * links and JSON-LD; override with SITE_URL at deploy time (the CI deploy job
 * sets it to the GitHub Pages project URL).
 */
export default {
  name: "Everlane Realty",
  preview: true,
  url: (process.env.SITE_URL || "https://sergeselenko.github.io/everlane-realty-preview").replace(/\/$/, ""),
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
