# Apple global footer UI — research findings for the eguidar storefront

> **Research-only document.** Every factual claim below is traced to a primary source: the **live HTML served by apple.com**, the **CSS and JavaScript bundles those pages link to**, and the **eguidar source files named in §9**. **Retrieval date for all Apple sources: 4 November 2026 (UTC).** Quotes are verbatim from served bytes or from the bundle as served; where I inserted a line break inside a CSS rule for readability, the block is marked as reformatted and no character was changed. Third-party blogs, teardowns and memory were **not** used as evidence. No application code, schema, config or test in this checkout was modified.
>
> **Trademark and copyright caution.** This describes an *information architecture and visual system* for inspiration only. Never copy Apple's logo, its `\uf8ff` private-use glyph, its icon-font files, SF Pro font files, its copy text, or a pixel-identical layout. The footer bundle ships licensed assets (`@font-face{font-family:"Apple Legacy Chevron";…url("../assets/ac-footer/legacy/appleicons_ultralight.woff")…}`) [R7], and Apple's web-font CSS carries `/* (C) 2019 Apple Inc. All rights reserved. */`.
>
> **Companion docs.** `apple-product-page-ui.md` and `apple-article-page-ui.md` quote this same bundle for one rule each; this file treats it as the subject and is authoritative for the footer, because it re-fetched everything on 4 November 2026.

## Summary

- **The footer is server-rendered in the first HTML stream.** `curl` returns the whole `<footer id="ac-globalfooter">` block — **27,012 B** on the en-US home and **27,955 B** on fr-FR. The en-US footer has 5 columns, 11 headings and 64 links; fr-FR has 54 links [R1][R2]. JS only adds the mobile accordion (§6).
- **It is not one component across templates.** Home and `/iphone/` share the same 64-link directory in the same order [R1][R3]; `/store` renders a **different component**, `<footer class="as-globalfooter" id="global-footersection">`, with 63 links and an `as-` prefix [R5]. Same taxonomy, different leaves.
- **5 columns / 11 headed sections / 64 links on en-US, 54 on fr-FR.** Columns are unbalanced on purpose: 15 / 12 / 13 / 10 / 14 [R1]. Sections run from **1** link ("For Healthcare") to **13** ("Apple Store").
- **Column headings are real `<h3>`s.** Each wraps a desktop `<span>` and a mobile `<button disabled>`; CSS hides one per breakpoint, so the accessible name is not doubled [R1][R7]. The heading is not a link.
- **On en-US, the entire footer is one type size: 12 px / 16 px, `-0.01em`.** A `#ac-globalfooter *{font-size:1em}` reset pins every descendant to 1 em; the only weight contrast is `600` on the 11 headings — and `400` again on the mobile trigger [R7]. Zero `clamp()`, zero second size, in 56,408 B of CSS.
- **The container is 980 px of *content* plus 22 px padding = 1024 px outer**, because the bundle resets `box-sizing:content-box`; the footer's own `min-width:1024px` is the arithmetic proof [R7]. Five columns declare `flex-basis:25%` and shrink equally to **20 % ≈ 196 px**, with a 20 px trailing margin instead of a `gap` [R7].
- **One breakpoint matters for the directory: 833 px.** 1023 px only re-flows the legal row; 480/734 px touch only the unused buystrip [R7]. JS registers 480 / 481–833 / 834–1023 / ≥1024 and enables the accordion for the two smallest [R9].
- **The accordion is JS + CSS, not CSS-only.** The served button is `disabled`; at ≤833 px JS removes `disabled` and adds `aria-expanded="false"` + `aria-controls="<ul id>"`; a click toggles `.ac-gf-directory-column-expanded` and `aria-expanded` [R9]. The chevron is an SVG polyline morphed by SMIL over 320 ms — and **there is no `prefers-reduced-motion` guard anywhere** (§7).
- **Palette: five alpha-blacks on `#f5f5f7`** — text `.56` = **4.82:1**, links `.72` = **8.81:1**, headings `.88` = **15.47:1**, pipes `.48` = **3.67:1**, hairline `.16` = **1.44:1** (decorative) [R7]. Dark mode is a class, never `prefers-color-scheme`.
- **eguidar already owns Apple's greys.** `--muted: oklch(97.1%)` = `#f5f5f5` vs `#f5f5f7` = `oklch(97.1% 0.0027 286.4)`; `--muted-foreground: oklch(54%)` = `#6f6f6f` vs `#6e6e73` = `oklch(54.0% …)`; `--border: oklch(86.5%)` = `#d2d2d2` vs `#d2d2d7`; `--link` = `#0266cc` vs `#0066cc` [R15][R7]. **The gap is the IA, not the palette**: the current footer links to **zero** shop categories and renders the same five static pages twice (§9.1).

## 0. Method and limits

I fetched each page with `curl -sS -L --compressed`, kept the raw bytes in `.scratch/apple-footer/`, resolved every `<link rel="stylesheet">` and footer `<script src>` the pages declare, and parsed the CSS with a brace-tracking reader so **each declaration is reported with its enclosing `@media`**. Markup was parsed into a tree, so counts and heading levels are counted, not eyeballed.

**All sizes are decoded bytes** (after gzip). The wire transfer is ~6× smaller — the en-US home was 42,286 B compressed, 253,563 B decoded [R1]. Footer-block sizes are measured on the extracted `<footer>…</footer>` substring, encoded as UTF-8 (en-US: 27,012 B = 26,990 chars; fr-FR: 27,955 B = 27,671 chars — the gap is multi-byte punctuation such as `©` and the non-breaking spaces). The limits of the method are tabulated at the end of this document.

### Sources inspected

| Page | URL | Served |
|---|---|---|
| en-US home [R1] | `https://www.apple.com/` | 200, 253,563 B, footer block 27,012 B |
| fr-FR home [R2] | `https://www.apple.com/fr/` | 200, 229,139 B, `<html lang="fr-FR">`, footer block 27,955 B |
| iPhone, en [R3] | `https://www.apple.com/iphone/` | 200, 413,991 B — same 64 links, plus breadcrumbs |
| iPhone, fr [R4] | `https://www.apple.com/fr/iphone/` | 200, 598,949 B — 54 links |
| Store, en [R5] | `https://www.apple.com/store` | 200, 890,967 B — **`as-globalfooter`**, 63 links |
| Store, fr [R6] | `https://www.apple.com/fr/store/` | 200, 683,426 B — same `as-` component |
| Footer CSS en_US [R7] | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` | 200, `text/css`, 56,408 B, md5 `d09bfbea…` |
| Footer CSS fr_FR [R8] | `https://www.apple.com/ac/globalfooter/8/fr_FR/styles/ac-globalfooter.built.css` | 200, 56,420 B, md5 `580c3e9d…` |
| Footer JS [R9] | `https://www.apple.com/ac/globalfooter/8/en_US/scripts/ac-globalfooter.built.js` | 200, 9,686 B — **md5 identical** to the fr script |
| Store footer CSS [R10] | `https://store.storeimages.cdn-apple.com/…/rs-external-1.74.1-85ac2/dist/us/external.css` | 200, 45,618 B — `.as-globalfooter*` |
| Country picker [R11] | `https://www.apple.com/choose-country-region/` | 200, 30,337 B — the locale link's destination |

Everything served **200**; no redirect, no archive. The bundle path is still **version 8** and locale-scoped, quoted from each page's own `<link>` [R1][R2]. The sibling product-page doc recorded **63,918 B** at this same URL on 12 October 2026; it served **56,408 B** on 4 November — the bundle rotated without a version bump. Re-fetch, never reuse.

## 1. Is the footer the same on every template?

| Template | Footer element | Links | Zones |
|---|---|---|---|
| `/` [R1] | `<footer id="ac-globalfooter" class="no-js" …>` | 64 | sosumi → directory → legal band |
| `/iphone/` [R3] | same `ac-globalfooter` | 64, **same labels and order** | breadcrumbs → sosumi → directory → legal band |
| `/store` [R5] | `<footer class="as-globalfooter" id="global-footersection" role="contentinfo" aria-labelledby="footer-label">` | 63 | breadcrumbs → sosumi → directory → legal band |

The Store variant is a **sibling implementation** with an `as-` prefix (`as-globalfooter-directory-column-section-link`, `as-globalfooter-mini-legal-link`), styled by a different bundle that declares the **same tokens in hex8** — `--footer-text-color:#0000008f`, `--footer-border-color:#00000029` — with the same `max-width:980px;padding:0 22px` and the same 833 px breakpoint [R10].

The five leaf differences are the useful part, because they show *how* Apple varies a footer without redesigning it [R1][R5]:

| Section | marcom (`ac-gf`, 64) | Store (`as-`, 63) |
|---|---|---|
| Shop and Learn | `Home` | `TV & Home` |
| Apple Store | 13, incl. `Group Reservations` | 12, none |
| For Healthcare | 1: `Apple and Healthcare` | 3: `Apple in Healthcare`, `Health on Apple Watch`, `Health Records on iPhone` |
| For Government | 4 (incl. Veterans, State/Local, Federal) | 2, incl. `Shop for Government` |
| Apple Values | `Supply Chain Innovation` | `Supply Chain` |

**Rule to copy:** one taxonomy, one component contract, a per-surface leaf list.

## 2. Anatomy

Opening tag, verbatim [R1]:

```html
<footer id="ac-globalfooter" class="no-js" lang="en-US" data-nosnippet="true"
        data-analytics-region="global footer" role="contentinfo"
        aria-labelledby="ac-gf-label">
  <div class="ac-gf-content">
    <h2 class="ac-gf-label" id="ac-gf-label">Apple Footer</h2>
    <section class="ac-gf-sosumi" aria-label="Footnotes">…</section>
    <nav class="ac-gf-directory with-5-columns" aria-label="Apple Directory" role="navigation">…</nav>
    <section class="ac-gf-footer">…</section>
    <script>…schema.org Organization JSON-LD, 1,171 B…</script>
  </div>
</footer>
```

- `data-nosnippet="true"` keeps legal prose out of search snippets [R1]; the `<h2>` is a visually hidden landmark label (`.ac-gf-label{position:absolute;clip:rect(1px,1px,1px,1px);…height:1px;width:1px}`) [R7]; the `<nav>` carries `aria-label="Apple Directory"` *and* `role="navigation"` [R1]; and the footer ships its own `Organization` JSON-LD inside itself [R1].
- **`with-5-columns` is inert** — the string occurs **0 times** in the 56,408 B bundle [R7]. It documents intent for humans; it styles nothing.

Anchor census: **76 `<a>`** on the en-US home = 64 directory + 3 shop line + 5 legal + 2 locale (small + large) + 2 footnote [R1]. fr-FR: **69** = 54 + 3 + 6 + 2 + 4 [R2].

### 2.1 Directory

```html
<div class="ac-gf-directory-column-section">
  <h3 class="ac-gf-directory-column-section-title">
    <span class="ac-gf-directory-column-section-title-text">Shop and Learn</span>
    <button class="ac-gf-directory-column-section-title-button" disabled>
      <span class="ac-gf-directory-column-section-title-text">Shop and Learn</span>
      <span class="ac-gf-directory-column-section-title-icon" aria-hidden="true"></span>
    </button>
  </h3>
  <ul id="footer-directory-column-section-products"
      class="ac-gf-directory-column-section-list" role="list">
    <li class="ac-gf-directory-column-section-item" role="listitem">
      <a class="ac-gf-directory-column-section-link" href="/us/shop/goto/store"
         data-analytics-title="store">Store</a>
    </li>
  </ul>
</div>
```

The title text is **duplicated in the DOM** — once for desktop, once inside the button. That is not an a11y bug: exactly one is `display:none` at any width (`.…-title-text{display:block}` / `@media(max-width:833px){…{display:none}}`, and the mirror pair for the button) [R7]. I checked because the text extraction reads "Shop and LearnShop and Learn"; the CSS resolves it.

### 2.2 Footnotes

```html
<section class="ac-gf-sosumi" aria-label="Footnotes">
  <ol>
    <li id="footnote-1">Based on data from an Apple-conducted study … visit <a href="/HRAccuracy/">apple.com/HRAccuracy</a>.</li>
    <li id="footnote-2">Apple Upgrade is a device leasing program available in the U.S. …</li>
  </ol>
  <ul>
    <li><span class="footnote-apple-card"><p>To access and use all Apple Card features …</p></span></li>
    <li>A subscription is required for Apple Arcade, Apple Fitness+, Apple Music, and Apple TV.</li>
    <li>Features are subject to change. … not be available in all regions or all languages.</li>
  </ul>
</section>
```

**2 numbered + 4 unnumbered notes.** `<sup>` count in the footer: **0** [R1] — so the `<ol>` is list order, not a back-reference to superscripts in the body, despite the bundle shipping `sup` rules. A `<section>` with a localised `aria-label` (`"Footnotes"` / `"Notes de bas de page"`), not a heading [R1][R2].

### 2.3 Legal band

```html
<section class="ac-gf-footer">
  <div class="ac-gf-footer-shop" x-ms-format-detection="none">
    More ways to shop: <a href="/retail/">Find an Apple Store</a> or
    <a href="https://locate.apple.com/">other retailer</a> near you.
    <span class="nowrap">Or call <a href="tel:1-800-692-7753">1-800-MY-APPLE</a> (1-800-692-7753).</span>
  </div>
  <div class="ac-gf-footer-end">
    <div class="ac-gf-footer-locale ac-gf-footer-locale-small">…</div>
    <div class="ac-gf-footer-legal">
      <div class="ac-gf-footer-legal-copyright">Copyright © 2026 Apple Inc. All rights reserved.</div>
      <ul class="ac-gf-footer-legal-links" role="list">…5 items…</ul>
    </div>
    <div class="ac-gf-footer-locale ac-gf-footer-locale-large">…</div>
  </div>
</section>
```

Two locale nodes exist because the selector moves: `-large` is `display:none` at ≤833 px, `-small` is `display:none` above it [R7]. The DOM order (locale, legal, locale) lets one link appear *before* the copyright on mobile and *after* it on desktop — duplication instead of `order`. `x-ms-format-detection="none"` stops Windows auto-linking the phone number [R1].

## 3. The column model

### 3.1 Every heading and link, in order

`en-US`, `/` [R1]; counts exact, load per column **15 / 12 / 13 / 10 / 14 = 64**.

| Section | Links | Count |
|---|---|---|
| **Shop and Learn** | Store, Mac, iPad, iPhone, Watch, Vision, AirPods, Home, AirTag, Accessories, Gift Cards | 11 |
| **Apple Wallet** | Wallet, Apple Card, Apple Pay, Apple Cash | 4 |
| **Account** | Manage Your Apple Account, Apple Store Account, iCloud.com | 3 |
| **Entertainment** | Apple One, Apple TV, Apple Music, Apple Arcade, Apple Fitness+, Apple News+, Apple Podcasts, Apple Books, App Store | 9 |
| **Apple Store** | Find a Store, Genius Bar, Today at Apple, Group Reservations, Apple Camp, Apple Store App, Certified Refurbished, Apple Upgrade, Apple Trade In, Financing, Carrier Deals at Apple, Order Status, Shopping Help | 13 |
| **For Business** | Apple and Business, Shop for Business | 2 |
| **For Education** | Apple and Education, Shop for K-12, Shop for College | 3 |
| **For Healthcare** | Apple and Healthcare | 1 |
| **For Government** | Apple and Government, Shop for Veterans and Military, Shop for State and Local Employees, Shop for Federal Employees | 4 |
| **Apple Values** | Accessibility, Education, Environment, Inclusion and Diversity, Privacy, Racial Equity and Justice, Supply Chain Innovation | 7 |
| **About Apple** | Newsroom, Apple Leadership, Career Opportunities, Investors, Ethics & Compliance, Events, Contact Apple | 7 |

Column composition: **1** = Shop and Learn + Apple Wallet; **2** = Account + Entertainment; **3** = Apple Store alone; **4** = the four audience sections; **5** = Apple Values + About Apple [R1].

### 3.2 Taxonomy

| Archetype | Sections | Optimised for | Why there |
|---|---|---|---|
| Product families | Shop and Learn (11) | Shopper who knows the noun, not the model | First column, top-left: highest-traffic intent [R1] |
| Money & wallet | Apple Wallet (4) | Payment products that are not hardware | Stacked under families, not given a column — 4 links do not justify one [R1] |
| Identity | Account (3) | Returning customer | Top of column 2: login precedes browsing [R1] |
| Subscriptions | Entertainment (9) | Services revenue, cross-sell | Column 2, the site's "second screen" [R1] |
| Store tasks | Apple Store (13) | Everything *around* a purchase: find, try, trade in, finance, track, help | Alone in column 3 and the largest section — these are verbs, not nouns [R1] |
| Audience segments | Business / Education / Healthcare / Government (2/3/1/4) | Institutional buyers who self-identify | Column 4, stacked four-deep: one door per audience [R1] |
| Corporate / values | Apple Values (7) | Reputation, policy audiences | Column 5 top [R1] |
| Corporate / facts | About Apple (7) | Press, investors, candidates | Column 5 bottom, last before legal [R1] |

The ordering is a **left-to-right funnel**: *what we sell* → *what you own* → *what you do with us* → *who you are* → *who we are*. Column 1 is the catalogue, column 5 is the company.

The absences are the design:

- **No per-model links.** One `iPhone` link covers the family; models live on `/iphone/`. 64 links cover hundreds of SKUs [R1][R3].
- **No nesting.** Depth is exactly 2: section heading → link. No third level anywhere.
- **No personalisation, search or filters.** Static markup, no per-user branch [R1].
- **No logo.** Apple's footer carries no mark; the wordmark lives in the global nav and breadcrumb [R1][R3].

### 3.3 en-US vs fr-FR

| Section (en) | en | Section (fr) | fr |
|---|---|---|---|
| Shop and Learn | 11 | S’informer et acheter | 11 |
| Apple Wallet | 4 | Apple Cartes | **1** |
| Account | 3 | Compte | 3 |
| Entertainment | 9 | Divertissements | **8** |
| Apple Store | 13 | Apple Store | **11** |
| For Business | 2 | Pour les entreprises | 2 |
| For Education | 3 | Pour l’Éducation | **2** |
| For Healthcare | 1 | Pour la santé | 1 |
| For Government | 4 | Pour le secteur public | **1** |
| Apple Values | 7 | Valeurs d’Apple | **5** |
| About Apple | 7 | À propos d’Apple | **9** |
| **Total** | **64** | | **54** |

Column loads fr: 12 / 11 / 11 / 6 / 14 [R2]. The gaps are **market reality, not translation**:

- `Apple Wallet` → `Apple Cartes`, down to **one** link (`Apple Pay`), because Apple Card and Apple Cash are US-only [R2].
- `Pour le secteur public` keeps its heading and drops to one link; the US veterans/state/federal programme stores have no French equivalent [R2].
- `Valeurs d’Apple` loses two (Inclusion and Diversity, Racial Equity and Justice); `À propos d’Apple` gains `Garantie` (`/legal/warranty/statutoryrights.html`) and `Création d’emplois en Europe` [R2].
- Labels are idiomatic, not literal: `Manage Your Apple Account` → `Gérer le compte Apple`, `Certified Refurbished` → `Produits reconditionnés et soldés`, `Shopping Help` → `Aide à l’achat`, `Career Opportunities` → `Travailler chez Apple` [R1][R2].
- `Financement` is a **different route**, not a translated slug (`/fr/shop/goto/ww/financing` vs `/us/shop/goto/payment_plan`) [R1][R2].

**The skeleton is stable across locales; the leaves are not.** A locale can drop 10 of 64 links without the footer changing shape.

## 4. The legal / utility zone

### 4.1 The "More ways to shop" sentence

en-US: `More ways to shop:` **Find an Apple Store** `or` **other retailer** `near you.` + `<span class="nowrap">Or call … (1-800-692-7753).</span>` [R1]

fr-FR: `Vous pouvez aussi faire vos achats` **dans un Apple Store** `ou` **chez un revendeur** `.` + `<span class="nowrap">Ou appeler le 0800 046 046.</span>` [R2]

| | en-US | fr-FR |
|---|---|---|
| Opener | `More ways to shop:` — colon, no verb | `Vous pouvez aussi faire vos achats` — full clause, no colon |
| Link 1 | `Find an Apple Store` → `/retail/` | `dans un Apple Store` → `/fr/retail/` |
| Link 2 | `other retailer` → `https://locate.apple.com/` | `chez un revendeur` → `https://locate.apple.com/fr/fr/` |

It is **reassembled per locale**, not word-for-word translated, so that link text completes the sentence grammatically. These are the **only always-underlined links in the footer** — `.ac-gf-footer-shop a,.ac-gf-footer-shop a:hover{color:var(--footer-mini-shop-link-color);text-decoration:underline}` [R7] — because they sit inside prose. List links are underlined on hover only (`#ac-globalfooter a:hover{text-decoration:underline}`) [R7]. **Prose links underlined; list links not.**

### 4.2 Locale selector

```html
<div class="ac-gf-footer-locale ac-gf-footer-locale-small">
  <a class="ac-gf-footer-locale-link" href="/choose-country-region/"
     title="Choose your country or region"
     aria-label="United States. Choose your country or region"
     data-analytics-title="choose your country">United States</a>
</div>
```

- A **plain link**, not a `<select>` and not a disclosure. No in-footer dropdown; it navigates to `/choose-country-region/` (200, 30,337 B) [R11].
- Visible label is the **country only**; the action lives in `title` and in an `aria-label` that *prefixes* the country — `"United States. Choose your country or region"` / `"France. Choisir un pays"` [R1][R2].
- **Locale-agnostic target** (`/choose-country-region/`, no `/fr`) on both locales [R1][R2].
- Leading 1 px pipe drawn by `:before` (`height:10px;width:1px;background-color:var(--footer-pipe-color)`); the focus ring is moved to an absolutely positioned `:after` covering the inline box [R7].
- A JS hook (`.ac-gf-footer-locale-lang`, `data-locale-current`) exists for language-switch rewriting, but **no such element is on either page** — the hook is inert here [R9][R1].

### 4.3 Copyright and legal links

| | en-US [R1] | fr-FR [R2] |
|---|---|---|
| Copyright | `Copyright © 2026 Apple Inc. All rights reserved.` | `Copyright © 2026 Apple Inc. Tous droits réservés.` |
| Link count | 5 | **6** |
| Links | `Privacy Policy` `/legal/privacy/` · `Terms of Use` `/legal/internet-services/terms/site.html` · `Sales and Refunds` `/us/shop/goto/help/sales_refunds` · `Legal` `/legal/` · `Site Map` `/sitemap/` | `Engagement de confidentialité` `/fr/legal/privacy/` · **`Utilisation des cookies` `/legal/privacy/fr/cookies/`** · `Conditions d’utilisation` `/fr/legal/terms/site.html` · `Ventes et remboursements` `/fr/shop/goto/help/sales_refunds` · `Mentions légales` `/fr/legal/` · `Plan du site` `/fr/sitemap/` |

Separators are **1 px × 10 px pipes drawn by `:after`**, not `|` characters: `.ac-gf-footer-legal-links-item:after{content:"";position:absolute;height:10px;width:1px;background-color:var(--footer-pipe-color);margin:3px 0}` with `:last-child:after{display:none}` [R7]. Each link gets `padding:0 9px;margin-inline-start:-9px;white-space:nowrap` [R7] — 18 px of air between labels, no label breaking across lines.

None of these six documents appears in the directory above. **Marketing links above, legal documents below** — the cleanest decision in the whole component.

### 4.4 Why the French footer is not just shorter

Before the numbered list, fr-FR's `ac-gf-sosumi` carries [R2]:

- Two **EU energy-label** rows rendered as `<img class="energy-flag-img" alt="" aria-hidden="true">` plus `<button class="energy-flag-cta" aria-label="Classe énergétique, iPhone Duo, classe A, échelle allant de A à G, en savoir plus" data-modal-open="modal-iphone-duo">`.
- An **inline `<style>`** declaring `.financing-title{margin:40px 0;font-size:17px;font-weight:600;text-align:center}` with a `14px` override at ≤734 px.
- `<h2 class="financing-title">Un crédit vous engage et doit être remboursé.<br>Vérifiez vos capacités de remboursement avant de vous engager.</h2>`.
- An asterisk note whose container is literally `id="footnote-*"` — valid, odd, not worth copying.

This is the only place in either footer where the type scale breaks, and it is enforced by an inline `<style>` because it is a legal obligation, not a design choice [R2]. For a French storefront this is the most directly transferable finding: **regulatory copy gets its own typographic treatment rather than being forced into the 12 px list.**

## 5. Visual system, with evidence

Quotes from the en_US bundle [R7]; fr_FR differs by 12 bytes and the same inline override [R8].

### 5.1 Tokens

```css
#ac-globalfooter{--footer-background: rgb(245, 245, 247);--footer-border-color: rgba(0, 0, 0, 0.16);
  --footer-text-color: rgba(0, 0, 0, 0.56);--footer-link-color: rgba(0, 0, 0, 0.72);
  --footer-pipe-color: rgba(0, 0, 0, 0.48);--footer-directory-title-color: rgba(0, 0, 0, 0.88);
  --footer-directory-title-focus-offset: 4px;--footer-section-border-color: var(--footer-border-color);…}
.ac-globalfooter-dark #ac-globalfooter{--footer-background: rgb(29, 29, 31);
  --footer-border-color: rgba(255,255,255,0.24);--footer-text-color: rgba(255,255,255,0.56);…}
```

Six semantic roles, one value each. Dark mode is a **class** (`.ac-globalfooter-dark`, `.theme-dark`); there is **no `prefers-color-scheme`** rule [R7].

### 5.2 Type

```css
#ac-globalfooter{font-size:12px;line-height:1.3333733333;font-weight:400;letter-spacing:-0.01em;…}
#ac-globalfooter *{float:inherit;font-size:1em;font-family:inherit;font-weight:inherit;
  line-height:inherit;letter-spacing:inherit;text-align:inherit}
```

| Element | Size / leading / weight |
|---|---|
| Root, links, footnotes, legal, locale | `12px / 1.3333733333 / 400`, `-0.01em` |
| Column heading, desktop `<span>` | `12px / 1.3333733333 / **600**`, `-0.01em` |
| Column heading, mobile `<button>` | `12px / 1.3333733333 / **400**` |
| Chevron, mobile | `14px / normal / normal` |
| fr `financing-title` | `17px / 600`, centred (`14px` ≤734) |

12 × 1.3333733333 = **16.0004 px** — a 12/16 box. Hierarchy is weight (600 vs 400) on desktop; on mobile the heading drops to **400** and hierarchy comes from colour (`0.88` vs `0.72`) and the row hairline [R7]. `clamp()` count in the bundle: **0**.

### 5.3 Container and columns

```css
#ac-globalfooter .ac-gf-content{margin:0 auto;max-width:980px;padding:0 22px}
#ac-globalfooter .ac-gf-directory{…display:flex;flex-wrap:nowrap;padding-top:20px}
#ac-globalfooter .ac-gf-directory-column{flex-basis:25%}
#ac-globalfooter .ac-gf-directory-column-section-list{margin-inline-end:20px;list-style:none;padding:0}
#ac-globalfooter .ac-gf-directory-column-section~.ac-gf-directory-column-section{padding-top:24px}
```

- The bundle resets `#ac-globalfooter,#ac-globalfooter *{box-sizing:content-box;…}` [R7], so `max-width:980px` is a **content** measure and the outer box is **980 + 44 = 1024 px** — matched by the footer's own `min-width:1024px`, the same fact stated twice [R7].
- Five columns all declare `flex-basis:25%` in a `nowrap` row, so they shrink equally to **20 %**: 980 / 5 = **196 px**, minus the 20 px trailing margin = **176 px of text measure** *(arithmetic on declared values, not a measurement)* [R7].
- **No `gap` property** exists in the bundle (count: 0). The gutter is a trailing margin — which behaves differently from `gap` when a column is empty.
- Stacked sections inside one column: `padding-top:24px` [R7].

### 5.4 Vertical rhythm and hairlines

| Boundary | Declared value | Source |
|---|---|---|
| Footnotes | `padding:17px 0 11px`, `border-bottom:1px solid` | [R7] |
| Directory | `padding-top:20px` | [R7] |
| Directory → legal band | `padding-top:37px` (`.ac-gf-directory+.ac-gf-footer`), `border-top:none` | [R7] |
| Shop line → hairline | `padding-bottom:19px`, `border-bottom:1px solid`; `margin-bottom:16px` | [R7] |
| Legal band | `padding:17px 0 11px`, bottom `+ env(safe-area-inset-bottom)` | [R7] |

Three hairlines, three jobs: **footnotes ↔ directory**, **shop line ↔ legal**, and (mobile only) **between accordion rows**. All are `--footer-section-border-color` = `rgba(0,0,0,0.16)` at `1px`.

### 5.5 Measured contrast

Computed from the tokens above against `#f5f5f7` / `#1d1d1f`, alpha-composited in sRGB, WCAG 2.x relative luminance:

| Pair | Composite | Ratio | Verdict |
|---|---|---|---|
| Text `rgba(0,0,0,.56)` on `#f5f5f7` | `#6c6c6d` | **4.82:1** | AA ✓ — where footnotes and legal copy live |
| Link `rgba(0,0,0,.72)` | `#454545` | **8.81:1** | AAA ✓ |
| Heading `rgba(0,0,0,.88)` | `#1d1d1e` | **15.47:1** | AAA ✓ |
| Pipe `rgba(0,0,0,.48)` | `#7f7f80` | **3.67:1** | passes 3:1 non-text ✓ |
| Hairline `rgba(0,0,0,.16)` | `#cececf` | **1.44:1** | decorative — exempt |
| Shop link `#0066cc` | — | **5.11:1** | AA ✓ |
| Focus ring `#0071e3` | — | **4.31:1** | passes 3:1 ✓ |
| Dark text `rgba(255,255,255,.56)` on `#1d1d1f` | `#9c9c9c` | **6.13:1** | AA ✓ |
| Dark hairline `rgba(255,255,255,.24)` | `#535355` | **2.19:1** | decorative |

The uncomfortable finding is the ordering: **the smallest, most legally important text has the lowest contrast** (4.82:1, 0.32 of headroom above AA) while decorative links get 8.81:1. Apple ships exactly one mitigation in 56 KB: `@media(prefers-contrast: more){#ac-globalfooter .ac-gf-content a:link{text-decoration:underline}}` [R7].

## 6. Responsive behaviour

| Viewport | Directory | Legal band |
|---|---|---|
| **≥1024 px** | 5 columns at 20 %; 11 sections open; headings 600 | copyright + legal links float inline, locale floats right (`float:inline-end`) |
| **834–1023 px** | 5 columns, narrower (at 900 px ≈ 171 px each) | floats drop (`float:none`, `margin-inline-end:0` at ≤1023) → copyright and links stack; locale still right |
| **≤833 px** | **stacked accordion**, 11 rows, 1 px hairline per row, panels `visibility:hidden` + `position:absolute` | single block, `padding-top:12px`; the `-small` locale node appears *before* the copyright |

Media-query inventory [R7]: **26 rules at `max-width:833px`**, 5 at `max-width:1023px`, 6 at `max-width:480px`, 1 at `max-width:1044px` (the `min-width` reset), 1 at `min-width:834px and (max-width:1023px)`, 1 `prefers-contrast: more`. The 480/734 px rules touch only `.ac-gf-buystrip*`, absent from the home page [R1].

The JS runs its own ladder, independent of the site-wide 734/1068 one [R9]:

```js
{name:"xsmall",mediaQuery:"only screen and (max-width: 480px)"},
{name:"small", mediaQuery:"only screen and (min-width: 481px) and (max-width: 833px)"},
{name:"medium",mediaQuery:"only screen and (min-width: 834px) and (max-width: 1023px)"},
{name:"large", mediaQuery:"only screen and (min-width: 1024px)"}
```

### 6.1 The accordion, precisely

**Not CSS-only.** The served button is inert (`<button class="ac-gf-directory-column-section-title-button" disabled>`); the desktop/mobile switch is pure CSS; behaviour is added at runtime [R1][R7][R9]:

```js
onViewportChange(t){
  this._isBreakPointWithMenu(t.viewport)
    ? (this.button.removeAttribute("disabled"),
       this.button.setAttribute("aria-expanded","false"),
       this.button.setAttribute("aria-controls",this.list.id))
    : (this.collapse(),
       this.button.setAttribute("disabled",""),
       this.button.removeAttribute("aria-expanded"),
       this.button.removeAttribute("aria-controls"))
}
expand(){ this.icon.iconExpandAnimationEl.beginElement(); this.expanded=!0;
  this.section.classList.add(this.options.expandedClassName); this.button.ariaExpanded=!0 }
```

with `expandedClassName:"footer-directory-column-expanded"` [R9].

| Concern | Implementation | Source |
|---|---|---|
| Trigger | `<button>` **inside** `<h3>`, no `type` (defaults to `submit`) | [R1] |
| Desktop | `disabled` + `display:none` | [R1][R7] |
| `aria-expanded` | **absent** in HTML; `"false"` at ≤833, `"true"` on expand, removed above | [R9] |
| `aria-controls` | **absent** in HTML; set to the `<ul>` id at ≤833, removed above | [R9] |
| Closed panel | `visibility:hidden;position:absolute;top:100%;z-index:-1;transform:translateY(-100px)` | [R7] |
| Open panel | `.…-expanded .…-section-list{position:static;visibility:visible;z-index:1;transform:none;transition:transform 300ms ease}` | [R7] |
| Chevron | inline SVG 11×6, polyline morphed by two SMIL `<animate>` (expand/collapse), `dur="320ms"`, `keySplines="0.12,0,0.38,0"` / `"0.2,1,0.68,1"` | [R9] |
| Chevron rotation | **not used** — `transition:transform .3s ease` on the icon is dead CSS, no `transform` is ever applied | [R7][R9] |
| No-JS | `#ac-globalfooter.no-js .…-section-list{position:static;visibility:visible;transform:none}`, and JS strips `no-js` from the footer element | [R7][R9] |
| Multi-open | yes — each section is an independent instance, no group state | [R9] |

Because the panel is `visibility:hidden` (not `hidden`, not `display:none`), its links leave both the accessibility tree and the tab order while closed — correct. But the declared `transition:transform 300ms` cannot interpolate `position:absolute → static`; the visible effect is a 300 ms slide of the contents with an instant height change *(inference from declarations; no browser was run)*.

## 7. Interaction and accessibility

| Element | Markup | Verdict |
|---|---|---|
| Landmark | `<footer role="contentinfo" aria-labelledby="ac-gf-label">` + clipped `<h2 id="ac-gf-label">Apple Footer</h2>` | correct, named `contentinfo` [R1][R7] |
| Directory | `<nav aria-label="Apple Directory" role="navigation">` | correct, named [R1] |
| Breadcrumbs | `<nav class="ac-gf-breadcrumbs" aria-label="Breadcrumbs" role="navigation">` on `/iphone/` | correct [R3] |
| Footnotes | `<section aria-label="Footnotes">` | labelled, not a heading [R1] |
| Headings | 11 × `<h3>` under the clipped `<h2>` — **real headings**, no skipped level | correct [R1] |
| Lists | `role="list"` / `role="listitem"` on every `<ul>`/`<li>` | redundant, harmless [R1] |
| Ids | **15 ids, 15 unique**, including the 11 `footer-directory-column-section-*` targets of `aria-controls` | correct [R1] |
| Focus | `#ac-globalfooter :focus-visible{outline:2px solid var(--sk-focus-color,#0071e3);outline-offset:var(--sk-focus-offset,1px)}` | 4.31:1 ✓ [R7] |
| Focus, mobile links | `outline-offset:-6px`; the section reserves `--footer-directory-title-focus-offset:4px` of bleed so `overflow:hidden` cannot clip the ring | careful [R7] |
| Focus, legal links | ring removed from the `<a>`, re-drawn on `li:focus-within:before` | correct [R7] |

### 7.1 Verified weaknesses

| Finding | Evidence | Fair characterisation |
|---|---|---|
| **No reduced-motion handling for the chevron** — 320 ms SMIL runs unconditionally; `prefers-reduced-motion` appears **0 times** in 56,408 B, and the JS template has no media check | [R7][R9] | Verified gap. Low harm (11×6 px decorative morph), but real. |
| **Dense mobile targets** — link `padding:6px 14px` + 16 px line = **28 px**; trigger `10+10+16` = **36 px**; legal links **16 px** tall | [R7] | 28/36 px clear the WCAG 2.2 AA floor (24 px) but miss the 44 px HIG target; the 16 px legal links are arguable under the inline exception. Taste + a genuine HIG deviation, not a hard failure. |
| **12 px throughout, including legal prose** | [R7] | No WCAG minimum size; a readability judgement, and one a French mobile-first shop should not inherit. |
| **Untranslated `aria-label="Apple Directory"` on fr-FR** | [R2] | Verified i18n defect: a French screen-reader user hears an English landmark. |
| **Dead affordance without JS** — `.no-js` reveals panels, but the mobile button is `display:block` and still `disabled` | [R7][R9] | Content reachable; the affordance lies. Minor. |
| **`overflow:hidden` on `#ac-globalfooter`** | [R7] | Clips any ring or popover escaping the box; mitigated on mobile by the 4 px bleed, not at desktop. |

### 7.2 What to copy

1. **The disclosure lives inside the heading** (`<h3><span>Title</span><button>Title</button></h3>`), so the heading is navigable at every width and the control is announced with the heading's name [R1].
2. **`aria-expanded` exists only when it means something** — set at ≤833 px, removed above [R9]. Most implementations leave a permanent `aria-expanded="false"` on an element that cannot expand.
3. **A real no-JS path**, not a blank box [R7].
4. **One localised label per zone**, with the landmark label visually hidden rather than omitted [R1][R2].
5. **A focus ring that is never clipped**, because the section reserves exactly the offset it needs [R7].

## 8. Why this scales — and where it breaks

64 links for nine product families and hundreds of SKUs [R1]. Six rules make that possible:

1. **Depth capped at two.** Section → link, never a third level.
2. **Families are stable nouns.** `iPhone`, `Mac`, `iPad` change rarely; models change yearly [R1].
3. **Everything below the family is pushed to a landing page.** `/iphone/` owns the model list, compare table and buy flow [R1][R3].
4. **One column per intent, not per department.** Column 3 is "things you do in a store" (13 verbs), not "Retail" + "Support" + "Financing" [R1].
5. **Audiences are columns, not filters.** Four audiences share one column and 10 links [R1].
6. **Legal documents live only in the legal row** — no duplicated destination anywhere [R1].

| Failure mode for a small shop | Why | What it looks like |
|---|---|---|
| **Empty columns** | Copying seven archetypes when the shop has six categories and no services | Headings with 0–1 links |
| **Orphan links** | Copying Apple's *labels* instead of its *intents* — a "Pour les entreprises" door with no B2B surface | A column nobody clicks |
| **Duplicating the main nav** | Treating the footer as a sitemap of the header | Same five links twice, footer adds nothing |
| **Legal text in an accordion** | Applying the mobile collapse to the legal band | Withdrawal rights one tap from invisible |
| **12 px everywhere** | Copying the single-size system without Apple's density justification (1024 px-min desktop, short labels) | Unreadable legal copy on a 360 px phone |
| **Per-SKU links** | A small catalogue makes "just link the products" feel affordable | 60 links that rot weekly |

The honest reading: Apple's footer scales because it is **shallow and noun-based**, not because it is short. A shop with six categories should end up with **fewer columns, not the same number with fewer links**.

## 9. Applied to eguidar

### 9.1 Audit of the current footer

Sources: `components/storefront/footer.tsx` [R12], its test [R13], `lib/site.ts` [R14].

| # | Finding | Severity |
|---|---|---|
| 1 | **No shop category is linked.** `shopLinks = [{href:"/"}, ...staticPages]` — "La boutique" is Accueil + five static pages, a menu of *pages*, not products. The six real categories (Smartphones, Ordinateurs & Tablettes, Audio & Hi-Fi, TV & Home Cinema, Gaming, Accessoires) never appear [R12][R16]. | **High** |
| 2 | **The same five pages render twice** — `staticPages` feeds "La boutique" (`:9`) and the legal row (`:106`), so 10 anchors for 5 destinations [R12]. | **High** |
| 3 | **Column titles are `<p>`, not headings** (`<p className="text-xs font-semibold">{title}</p>`), so the footer contributes no navigable headings [R12]. | **High** (a11y) |
| 4 | **The logo block takes a third of the grid**, forcing a 3-up layout beside two 3–4 link columns [R12]; Apple's footer has no logo at all [R1]. | Medium |
| 5 | **No landmark labelling and no `<nav>`** — unlabelled `<footer>`, plain `<div>` columns [R12]. | Medium (a11y) |
| 6 | **No mobile accordion** — `grid gap-10 sm:grid-cols-2 md:grid-cols-3` stacks everything open [R12]. | Medium |
| 7 | **Copy that undersells or confuses.** `© eguidar.com — Le code est sous licence MIT` is developer-facing in a customer legal bar; "offerte dès un certain montant" states no threshold, and `/conditions` deliberately does not either [R12][R19]. | Medium (trust) |
| 8 | **Two hairline tokens** — the footer uses `border-border` (`#d2d2d2`) while the system has `--hairline` (`color-mix(in oklch, black 16%, transparent)`) used by `.filet-bas` [R12][R15]. | Low |

Two things it does **right** and should keep: real `<Link>`s with stable hrefs, and pipes drawn as `<span aria-hidden="true" className="h-2.5 w-px bg-border"/>` rather than `|` characters [R12] — the same decision Apple makes with `:after` [R7].

### 9.2 Proposed column taxonomy

Fourteen directory links, three columns, four headed sections — the same "sections stacked inside a column" shape Apple uses in column 4 [R1], sized to a six-category catalogue [R16].

| Column | Section heading | Links | Count |
|---|---|---|---|
| 1 | **La boutique** | Tous les produits → `/produits` · Smartphones → `/categorie/smartphones` · Ordinateurs & Tablettes → `/categorie/ordinateurs-tablettes` · Audio & Hi-Fi → `/categorie/audio-hifi` · TV & Home Cinema → `/categorie/tv-home-cinema` · Gaming → `/categorie/gaming` · Accessoires → `/categorie/accessoires` | 7 |
| 2 | **Mon compte** | Mes commandes → `/commandes` · Mon panier → `/panier` · Mon profil → `/profil` | 3 |
| 3 | **Aide** | FAQ → `/faq` · Contact → `/contact` | 2 |
| 3 | **La maison** | À propos → `/a-propos` · Blog → `/blog` | 2 |

Legal row, separated from the columns exactly as Apple separates theirs: `Conditions & livraison` → `/conditions` · `Suppression des données` → `/suppression-donnees`. Copyright above them.

**Do not add links for documents that do not exist yet.** `Confidentialité` and `Mentions légales` have no route in this repository (`app/` carries `/conditions` and `/suppression-donnees` only), so they must stay out of the rendered row until the pages ship — a footer is the worst place to discover a 404. The data shape in §9.4 accepts them the day the routes exist; until then the two real documents above are the whole legal row. A shop that stores delivery addresses and accounts will want a privacy page, but that is a content task, not a footer task, and I am not asserting a legal obligation here.

Why this shape:

- **Column 1 is the catalogue**, mapping Apple's "product families" archetype onto eguidar's six category roots [R16]. `Tous les produits` plays the role `Store` plays for Apple — the one entry that says "everything, unsorted" [R1].
- **Column 2 maps Apple's "Account"** (3 links for 3 routes) [R1][R12].
- **Column 3 stacks "Aide" and "La maison"**, the way Apple stacks four audience sections into one column [R1]. Two headings in one column is cheaper than two thin columns and keeps three equal columns from looking half-empty.
- **No audience column.** There is no B2B, education or healthcare surface in the routing table; copying Apple's column 4 would create exactly the "empty doors" failure of §8.
- **No values column.** No values pages exist; "Nos engagements" would be invented content.
- **`Conditions & livraison` moves into the legal row only** — the one place Apple puts legal documents [R1] — which also removes finding #2.
- Every route the existing test asserts (`/a-propos`, `/contact`, `/faq`, `/blog`, `/conditions`) remains reachable [R13], so the contract in §11 can be met **without editing the test**.

**When to add a fourth column:** when a second help surface exists (returns, delivery tracking) or column 3 passes ~14 links. Not before — Apple's narrowest column holds 10 [R1].

### 9.3 Layout contract

| Property | Value | Rationale |
|---|---|---|
| Container | keep `mx-auto max-w-[980px] px-4 sm:px-[22px]` | House measure shared with `BandeCategories`; 936 px of content, 44 px narrower than Apple's 980 — accepted deviation [R12][R15] |
| Breakpoints | **2 layout states**: `<768px` one column of disclosure rows, `≥768px` three columns. The **same** `Accordion` runs at both widths, every section listed in `defaultValue` | Mirrors Apple's two-state directory without a second heading or a JS breakpoint (§9.6) [R7] |
| Columns | `grid grid-cols-3 gap-x-5`, sections stacked in column 3 | 20 px gutter matches Apple's `margin-inline-end:20px` without the trailing-margin trap [R7] |
| Heading | `<h3>` via **`AccordionTrigger`** (it wraps `AccordionPrimitive.Header`, which renders the `<h3>`, then the `<button>`) [R17], `text-xs font-semibold text-foreground` | `text-xs` = 0.75 rem = **12.75 px** at this project's 106.25 % root — 0.75 px off Apple, zero new tokens [R15] |
| Link | `text-xs text-muted-foreground hover:text-foreground` (`#6f6f6f` = **4.61:1** on `#f5f5f5`) | Apple's 4.82:1 relationship, from the project's own token [R15] |
| Leading | `leading-[1.3333]` → 17 px box at 12.75 px | Same ratio as Apple's 12/16 [R7] |
| Hairline | `border-hairline` (`rgba(0,0,0,.16)`, 1.44:1) instead of `border-border` | Matches `.filet-bas` and Apple's section border; fixes finding #8 [R15][R7] |
| Surface | `bg-muted` (`#f5f5f5`) | Apple's `#f5f5f7` is the same `oklch(97.1%)` L [R15][R7] |
| Rhythm | `pt-6` (24 px) between stacked sections; band `py-10 sm:py-9`; legal `pt-6` after the hairline | Apple's 24 px inter-section and 37 px band top [R7] |
| Targets | trigger `min-h-11` (44 px); links `py-2.5` (≈37 px) | Clears WCAG 2.2 AA (24 px) and approaches the 44 px HIG target Apple misses at 28 px [R7] |
| Focus | inherit global `:focus-visible{outline:2px solid #0071e3;outline-offset:1px}` | Already identical to Apple's ring [R15][R7] |
| Motion | `motion-safe:transition-transform motion-safe:duration-200 group-aria-expanded/accordion-trigger:rotate-180` | The primitive already gates on `motion-safe` — the fix for Apple's missing guard [R17] |

### 9.4 Data shape

No application code here; this is the contract to implement. Every user-facing string is French and comes from data, not JSX literals.

```ts
export interface LienDePiedDePage {
  readonly href: string
  readonly label: string          // français, tel qu'affiché
}

export interface SectionDePiedDePage {
  readonly id: string             // slug stable → aria-controls + clé React
  readonly titre: string          // rendu en <h3>, jamais un <p>
  readonly liens: readonly LienDePiedDePage[]
}

export interface ColonneDePiedDePage {
  readonly sections: readonly SectionDePiedDePage[]   // 1..n, empilées
}

export interface PiedDePage {
  readonly colonnes: readonly ColonneDePiedDePage[]
  readonly mentions: {
    readonly copyright: string
    readonly liens: readonly LienDePiedDePage[]
  }
}
```

Three constraints follow from the existing code:

1. **The component takes no props today and the test renders `<StorefrontFooter />` with none** [R13], so the data parameter must be **optional**, defaulting to a module-level constant — that keeps the test compiling and passing unedited.
2. **`id` must be unique and stable**: it becomes the `aria-controls` target, exactly as Apple uses `footer-directory-column-section-products` [R1][R9].
3. **`mentions.liens` is separate from `colonnes`**, so no legal document can leak into a marketing column, and no marketing link into the legal row (§4.3, §8).

### 9.5 Which `lib/site.ts` exports feed it

| Export | Feeds | Note |
|---|---|---|
| `site.name` (`"eguidar.com"`) | `mentions.copyright` | `© ${site.name}` today [R12] |
| `site.legalName` (`"Eguidar"`) | copyright / `À propos` | Unused by the footer today [R14] |
| `site.tagline` | one line above the columns, or drop it | Currently inside the logo block [R12] |
| `site.contactEmail`, `contactPhone`, `contactPhoneDigits`, `whatsappMessage` | `Aide → Contact`, or a `tel:` link in the legal band like Apple's `1-800-MY-APPLE` [R1] | `contactPhoneDigits` is already normalised for `tel:` [R14] |
| `staticPages` | split: `/faq` + `/contact` → **Aide**; `/a-propos` + `/blog` → **La maison**; `/conditions` → `mentions.liens` | Splitting it fixes finding #2 without touching `site.ts` [R12][R14] |
| `logo` | **not** the footer | Removing it frees the third column (§9.2) [R12] |

Categories are not in `lib/site.ts`. They come from the `Category` table via `lectureStructure().arbreAccueil()`, which returns `NoeudAccueil[]` — `{ id, name, slug, image, productCount, children }` [R18]. Two consequences: the footer becomes DB-backed (a query per layout render), and the labels are already French in the database [R16]. If a per-request query is unattractive, the six roots are stable enough to be a constant in the footer module — but then the footer can drift from the catalogue, so pick one and say which.

### 9.6 The disclosure trade-off, stated plainly

Apple can afford **two different markup states** — a `<span>` heading with no button above 833 px, and a `<button>` heading below it — because its footer has been shipped for years to browsers it must not break [R7]. eguidar cannot afford a JS breakpoint at this size: a `useMediaQuery` wrapper would add a client boundary around a server-rendered footer and a hydration branch for the sake of 14 links.

So the contract above renders **one** accessible tree at all widths: four `<h3>`s, four buttons, four panels, all open by default. On desktop the chevron is still visible (hiding it would leave a focusable control with no affordance); on mobile a visitor can collapse sections but is not forced to. The cost is one design deviation from Apple — mobile does not start collapsed — and the benefit is that **no link is ever hidden behind JavaScript**, no panel can desync from its `aria-expanded`, and the existing SSR test keeps exercising the real markup [R13]. If a later iteration wants Apple's collapsed mobile default, the clean way is a small client wrapper that renders the disclosure only below 768 px — budget for it explicitly rather than smuggling it into CSS.

## 10. Do-not-copy list

**Assets and type.** The Apple logo, the `\uf8ff` breadcrumb glyph [R3], the SMIL chevron path [R9], the legacy icon fonts (`../assets/ac-footer/legacy/appleicons_*.woff`) [R7], and SF Pro in any form. eguidar's `--font-sans` already starts with `-apple-system, BlinkMacSystemFont` [R15] — the licensed-clean equivalent.

**Copy.** `More ways to shop`, `Find an Apple Store`, `other retailer`, `Apple Footer`, `Apple Directory`, `Choose your country or region`, `Copyright © 2026 Apple Inc. All rights reserved.` [R1]. And any Apple legal or financial claim (Apple Card, Goldman Sachs, Apple Upgrade, the French consumer-credit notice) [R1][R2] — regulated statements, not templates.

**Layout and code.** A pixel-identical 5-column footer; the `with-5-columns` class name (inert — 0 occurrences in the CSS) [R7]; the `disabled`-then-enabled button with its dead no-JS affordance (§7.1) and two duplicated locale nodes (§2.3).

**Accessibility anti-patterns.** 12 px legal prose; 28 px mobile links and 16 px legal links; a 320 ms animation with no `prefers-reduced-motion`; an untranslated landmark label on the French site [R2].

## 11. Implementation checklist

Ordered, each step independently verifiable. Nothing here edits `footer.test.tsx`; the test is a contract.

1. **Freeze the contract.** `npm test -- components/storefront/footer.test.tsx` (the repo uses `npm` with `package-lock.json`; `test` is `vitest run` [R20]) must pass *before* any change — it asserts five hrefs and two labels [R13]. Every later step keeps it green, which means all five static routes stay in the rendered HTML.
2. **Add the data module** (§9.4 types + a `PIED_DE_PAGE` constant implementing §9.2), no JSX. *Assert:* every `href` starts with `/`; every `id` is unique; no `href` points at a route absent from `app/`.
3. **Make the prop optional** — `StorefrontFooter({ pied = PIED_DE_PAGE })`. *Assert:* `renderToReadableStream(<StorefrontFooter />)` still resolves, matching the existing signature [R13].
4. **Replace `<p>` titles with `<h3>` — exactly one heading per section, at every width.** Compose `AccordionItem` → **`AccordionTrigger`** → `AccordionContent`; `AccordionTrigger` already wraps `AccordionPrimitive.Header`, which renders the `<h3>` and then the `<button>` [R17]. There is **no `AccordionHeader` export in this repo**, and there must be no second `<span>` heading node beside the button: that duplication is what Apple's pre-2015 markup needs, not what this does [R7]. Keep **every panel open by default through the primitive's own open state** (`multiple` + `defaultValue` listing every section id), never by overriding `display` on a closed panel — a closed Base UI panel can also be `inert`/`aria-hidden` and carry inline height state, so a CSS override would desync the visual and accessibility states. *Assert:* exactly four `<h3>` elements; each contains exactly one `<button>`; four panels in the DOM and none carrying `hidden`; `La boutique` appears once, not once per breakpoint.

   *Trade-off to accept knowingly (§9.6):* with `defaultValue` covering every section, mobile visitors also land on an expanded directory and collapse what they do not need. That is a deliberate deviation from Apple's collapsed-by-default mobile state, taken so that one markup tree serves both widths and no link is ever trapped behind a closed panel.
5. **Add landmarks** — `<nav aria-label="Navigation de pied de page">` around the columns, and `aria-labelledby` on `<footer>` pointing at a visually hidden `<h2>Pied de page</h2>`, mirroring `ac-gf-label` [R1][R7]. *Assert:* the `<nav>` label is non-empty and the `<footer>` reference resolves.
6. **Wire the accordion** with `@base-ui/react/accordion` (`multiple` + `defaultValue` = every section id), overriding the primitive's `rounded-2xl border` with `rounded-none border-0` [R17]. *Assert:* each trigger renders `aria-expanded="true"` consistent with its panel, and an `aria-controls` matching an existing section id — the invariant Apple only establishes at runtime [R9].
7. **Split the legal row out of the columns.** *Assert:* `html.match(/href="\/conditions"/g)?.length === 1` — the regression test for finding #2.
8. **Apply the tokens of §9.3** (`bg-muted`, `border-hairline`, `text-xs`, `leading-[1.3333]`, `min-h-11`). *Assert:* no `border-border` left in the footer; `#6f6f6f` on `#f5f5f5` recorded as 4.61:1.
9. **Keep the pipes, from data** — every separator `<span>` carries `aria-hidden="true"`, and the legal row's accessible text contains no `|` [R12].
10. **Verify reduced motion** — every `transition-`/`duration-` class in the footer is prefixed `motion-safe:` [R17]. *Assert:* no bare `transition-transform` in the rendered markup.
11. **Manual pass (not statically verifiable):** tab through at 360 px and 1280 px; confirm Space/Enter toggles each section, that Escape is *not* required (Apple does not implement it — match, don't invent) [R9], that focus order is sane with a panel closed, and that no focus ring is clipped at the container edges.

## References

All Apple URLs retrieved **4 November 2026 (UTC)**; all sizes are decoded bytes. Bundle contents rotate without a version bump — the sibling doc recorded 63,918 B for this same footer CSS path on 12 October 2026, and it served 56,408 B on this date — so these are what was served, not a stable artefact.

| Ref | Source | URL |
|---|---|---|
| R1 | en-US home (200, 253,563 B) — **primary markup**: 5 columns, 11 sections, 64 links, 76 anchors, footer block 27,012 B | `https://www.apple.com/` |
| R2 | fr-FR home (200, 229,139 B) — 54 links, 6 legal links, energy labels, `financing-title`, footer block 27,955 B | `https://www.apple.com/fr/` |
| R3 | iPhone (200, 413,991 B) — identical 64-link directory + `nav.ac-gf-breadcrumbs` | `https://www.apple.com/iphone/` |
| R4 | iPhone fr (200, 598,949 B) — 54-link directory | `https://www.apple.com/fr/iphone/` |
| R5 | Store (200, 890,967 B) — `as-globalfooter`, 63 links | `https://www.apple.com/store` |
| R6 | Store fr (200, 683,426 B) — same `as-` component | `https://www.apple.com/fr/store/` |
| R7 | **`ac-globalfooter.built.css` en_US (200, 56,408 B, md5 `d09bfbea…`)** — **primary CSS**: tokens, 12 px root, 980/22, `flex-basis:25%`, 833 px ladder, accordion states, focus | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` |
| R8 | `ac-globalfooter.built.css` fr_FR (200, 56,420 B, md5 `580c3e9d…`) — 12 B larger, 363 rules | `https://www.apple.com/ac/globalfooter/8/fr_FR/styles/ac-globalfooter.built.css` |
| R9 | **`ac-globalfooter.built.js` (200, 9,686 B, md5 `c13b7e8f…`, identical both locales)** — `aria-expanded`/`aria-controls` lifecycle, 320 ms SMIL, viewport ladder | `https://www.apple.com/ac/globalfooter/8/en_US/scripts/ac-globalfooter.built.js` |
| R10 | Store footer CSS (200, 45,618 B) — `.as-globalfooter*`, same tokens in hex8 | `https://store.storeimages.cdn-apple.com/4982/store.apple.com/static-resources/rs-external-1.74.1-85ac2/dist/us/external.css` |
| R11 | Country picker (200, 30,337 B) — destination of the locale link | `https://www.apple.com/choose-country-region/` |
| R12 | eguidar footer — `shopLinks`, `accountLinks`, `<p>` titles, 3-column grid, legal band, duplicated `staticPages` | `components/storefront/footer.tsx` |
| R13 | eguidar footer test — renders with **no props**, asserts 5 hrefs + `À propos` + `Conditions &amp; livraison` | `components/storefront/footer.test.tsx` |
| R14 | eguidar site constants — `site.*`, `staticPages`, `logo` | `lib/site.ts` |
| R15 | eguidar tokens — `--muted`, `--muted-foreground`, `--border`, `--hairline`, `--link`, `--ring`, `html{font-size:106.25%}`, `:focus-visible` | `app/globals.css` |
| R16 | eguidar catalogue seed — the six category roots and slugs | `prisma/seed.ts` |
| R17 | eguidar accordion — `@base-ui/react/accordion`; exports `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`; `AccordionTrigger` wraps `AccordionPrimitive.Header` → `<h3>`; `motion-safe` chevron | `components/ui/accordion.tsx` |
| R18 | eguidar category tree — `NoeudAccueil`, `arbreAccueil()` | `lib/use-cases/lecture-structure.ts` |
| R19 | eguidar conditions page — free-shipping threshold shown in cart, not published | `app/(boutique)/conditions/page.tsx` |
| R20 | eguidar package manifest — `npm` + `package-lock.json`, `"test": "vitest run"` | `package.json` |

### What I could not verify

| Item | Why | What I did instead |
|---|---|---|
| Computed post-JS layout | No browser in this sandbox | Widths are declared values plus arithmetic, with the sum shown and labelled. |
| The chevron morphing | SMIL is a runtime effect | Quoted `<animate>` template, `dur`, `keySplines`, `begin="indefinite"` verbatim [R9]; the visual result is labelled an inference. |
| Whether the 300 ms panel transition is visible | `position:absolute → static` cannot interpolate | Quoted the declarations and stated the limitation (§6.1). |
| Screen-reader output | No AT session | Claims concern `display:none`/`visibility:hidden` and `aria-*` wiring, not heard output. |
| Wrapping of long labels at 834 px | Would need layout | Called out as an estimate. |
| Whether `as-globalfooter` shares a template with `ac-globalfooter` | Two bundles, two prefixes; full rule sets not diffed | Compared the observable contract and said exactly that. |
| Locales beyond en-US / fr-FR | Not fetched | The pair answers the question; other locales may drop further leaves. |
