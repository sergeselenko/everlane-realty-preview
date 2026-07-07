# Everlane Realty — PREVIEW site

**This is the rebuild preview, not the live site.** Engagement #149, Build wave 0 (the rail).
Every page is `noindex`, robots.txt is disallow-all, and the intake form is rendered disabled.
Nothing here touches everlanerealty.com.

## Stack

- [Eleventy 3](https://www.11ty.dev/) (plain JS config, Nunjucks templates, zero client-JS by default)
- Design tokens: `src/_data/tokens.js` → build-generated `/assets/tokens.css`
  (**placeholder values — awaiting design convergence round 1**, plan §4)
- Build-generated discovery layer: `sitemap.xml`, `robots.txt`, `llms.txt`, per-page JSON-LD

## Commands

```bash
npm install       # once
npm run build     # → _site/
npm run serve     # local dev server
npm run check     # build + CI-equivalent checks (sitemap XML, JSON-LD, internal links, noindex, form-inert)
```

## Publishing (when the public preview repo is authorized)

1. Create the empty repo `sergeselenko/everlane-realty-preview` (public, no README/license — this repo pushes as-is).
2. `git remote add origin git@github.com:sergeselenko/everlane-realty-preview.git && git push -u origin main`
3. Repo Settings → Pages → Source: **GitHub Actions**.
4. Re-run the `CI` workflow (or push any commit) — the deploy job builds with
   `PATH_PREFIX=/everlane-realty-preview/` and publishes to
   `https://sergeselenko.github.io/everlane-realty-preview/`.

No CNAME file exists here on purpose: the preview must never claim the production domain.
