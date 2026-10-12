# Apple product-page UI — research findings for the eguidar catalogue

> **Research-only document.** Every factual claim below is traced to a primary source: the **live HTML served by apple.com** (markup of the pages listed under *Sources inspected*), the **CSS and JavaScript bundles those pages link to**, the **web-font CSS served by Apple's `/wss/fonts` endpoint**, and first-party Apple developer documentation. **Retrieval date for all sources: 12 October 2026 (UTC).** Archived or JS-only sources are labelled as such. Everything quoted under "Evidence" is verbatim from a minified bundle; line breaks were inserted by me inside a quoted rule only where noted, and no character was changed. Third-party blogs were **not** used as evidence. No application code, schema, or configuration in this checkout was modified.
>
> **Trademark and copyright caution.** This document describes Apple's *design language* for inspiration only. Never copy Apple assets, product photography, copy text, SF Pro font files, or pixel-identical layouts. Apple's font CSS carries `/* (C) 2019 Apple Inc. All rights reserved. */` [R16], and the SF Pro family is licensed for use in app UI on Apple platforms, not for redistribution as a web font [R25].

## Summary

- **There is no "Apple card".** The visual signature of an Apple product page is not a bordered box; it is *full-bleed imagery on large flat colour fields*, with text sitting directly on the background. Product tiles in the iPhone lineup are **borderless, shadowless and transparent** — the only fill is the page underneath. [R1][R5]
- **The palette is a flat two-theme system**: `#1d1d1f` text on `#ffffff`, with `#f5f5f7` for alternating sections; dark sections are pure `#000` with `#f5f5f7` text. The single button blue is `#0071e3` (hover `#0076DF`, active `#006EDB`); the single link blue is `#0066cc` (dark theme `#2997ff`). There are **no gradients, no shadows, no glass on content cards**. [R4][R5][R8]
- **Type is a discrete 2–3 step ladder, not fluid.** SF Pro Display for headlines, SF Pro Text for body; every size/leading/tracking pair is declared per breakpoint with hand-tuned `letter-spacing` (negative for large sizes, positive for small ones). `clamp()` appears only in a handful of layout rules, never for type. [R3][R5][R6]
- **The grid is 12 logical columns of a 1260 px container** (`--global-content-max-width`), with a permanent breakpoint ladder of **734 px / 1068 px / 1441 px** (plus 420 px and 480 px on some templates). Section rhythm is `--global-section-padding` — 144 px desktop → 120 px tablet → 112 px phone on the flagship page. [R5][R6][R12]
- **Navigation is two stacked translucent bars**: a 44 px global nav (`saturate(180%) blur(20px)` over `rgba(250,250,252,.8)`) and a 48 px product local nav that reveals on scroll with a product-name label and two pill CTAs (Explore / Buy). [R3][R10][R13]
- **Product tiles show colour swatches, not filters.** The lineup tile carries a `colorindicator` — 12 px circular finish swatches with a conic-gradient hairline — while **selection** (capacity/colour/carrier) belongs to the buy flow, rendered as bordered rows in a fallback and as a sticky in-page selector in the enhanced React flow. There is **no sidebar filter, no sort control, and no pagination** anywhere on the pages inspected; navigation is scroll-gallery or an index list. [R1][R19][R21]
- **Motion is restrained and scroll-triggered**: a `StaggeredFadeIn` component fades items in over 0.9 s with a 0.7 s 30 px rise, `easeInOutQuad`, staggered 0.15 s apart, played when the anchor crosses `t - 85vh`. Interactive media pauses out of view and does not autoplay under `prefers-reduced-motion` unless explicitly opted in. Hover on a tile image is a `scale(1.0161)` over 0.3 s. [R5][R7][R15]
- **Focus is explicit and visible**: a 2 px `#0071e3` outline at 1 px offset (3 px on container-like controls). Secondary text `#6e6e73` measures **4.66:1** on `#f5f5f7` and **5.07:1** on white; link blue measures **5.57:1** on white. [R5][R8]
- **Verified contrast pairs** (computed from the quoted hex values): body `#1d1d1f`/white **16.83:1**, body on `#f5f5f7` **15.46:1**, secondary `#6e6e73`/white **5.07:1**, link `#0066cc`/white **5.57:1**, dark-theme body `#f5f5f7`/black **19.29:1**, dark-theme link `#2997ff`/black **6.96:1**, white on button blue **4.70:1**. [R4][R5]
- **eguidar is already close in three places** — `--font-sans` already begins `-apple-system, BlinkMacSystemFont`, `globals.css` sets `letter-spacing: -0.022em` on body, and `voile-depoli` already replicates Apple's `saturate(180%) blur(20px)` veil. The restyle is therefore mostly a *removal* exercise (borders, shadows, radii, colour noise) plus a type/spacing ladder. See §12.

## 0. Method and limits

Everything below comes from static inspection: I fetched each page's HTML, extracted every `<link rel="stylesheet">` and `<script src>`, downloaded those bundles, and read the rules and the JS. Quotes are from the bundles as served on 12 October 2026. [R1]–[R24]

What this method **cannot** see, and is therefore absent or explicitly flagged: computed styles after JavaScript enhancement (the buy flow's selectors are rendered client-side by React — I read the CSS and the server-rendered fallback markup instead [R19][R21]), hover/focus behaviour in a running browser (only the CSS declarations), the visual result of scroll triggering, and the wording of `developer.apple.com/design/human-interface-guidelines/typography`, which is a JS-only SPA shell whose documentation JSON endpoint could not be located from the served bundle (see §13). [R25][R26]

### Sources inspected

| Page | URL | Served |
|---|---|---|
| iPhone lineup [R1] | `https://www.apple.com/iphone/` | 200, 690,605 B, `<title>iPhone - Apple</title>` |
| Mac lineup [R2] | `https://www.apple.com/mac/` | 200, 1,057,392 B |
| Store [R4] | `https://www.apple.com/store` | 200, 844,099 B |
| Accessories (redirects) [R9] | `https://www.apple.com/accessories/` → `https://www.apple.com/shop/accessories/all` | 200, 966,277 B |
| Flagship product detail [R15] | `https://www.apple.com/iphone-18-pro/` | 200, 867,994 B |
| Second product detail [R17] | `https://www.apple.com/macbook-air/` | 200, 465,049 B |
| Buy flow — iPhone [R19] | `https://www.apple.com/shop/buy-iphone/iphone-18-pro` | 200, 1,767,897 B |
| Buy flow — Mac [R24] | `https://www.apple.com/shop/buy-mac/macbook-air` | 200, 608,828 B |
| French locale home [R18] | `https://www.apple.com/fr/` | 200, 224,386 B |
| French locale product [R27] | `https://www.apple.com/fr/iphone-18-pro/` | 200, 761,183 B |
| French locale buy [R22] | `https://www.apple.com/fr/shop/buy-iphone/iphone-18-pro` | 200, 728,682 B |

Notably, **`/accessories/` now 302-redirects into the Store** (`/shop/accessories/all`), which is why the accessory surface is treated below as a Store-family page rather than a marcom page. [R4][R9] `web.archive.org` was not needed — every source above served 200 directly.

## 1. Page anatomy and section rhythm

### 1.1 The iPhone lineup page

The live iPhone page is a sequence of named `section` elements, each of which may flip the theme or the background. Verbatim markup (attribute noise trimmed): [R1]

```html
<section class="ribbon ribbon-upgrade-2026 static-light" …>
<section class="section section-hero no-pad-bottom">
<section id="priority-router" class="section section-priority-router">
<section class="section section-consider-alt" data-deep-link='switch'>
<section class="section section-select background-alt no-pad-bottom">
<section class="section section-incentive background-alt" …>
<section class="section section-upgrade no-pad-bottom">
<section class="section section-consider no-pad-bottom" data-deep-link='get-to-know'>
<section class="section section-essentials no-pad-bottom">
<section class="section section-image-accordion">
<section class="section section-index" …>
<section class="ac-gf-sosumi" data-nosnippet aria-label="Footnotes">
<section class="ac-gf-footer">
```

The rhythm is therefore: **hero → priority router → incentive ribbons → "get to know" feature cards → lineup (`section-select`) → essentials → accordion gallery → index/footer**. The two structural classes that matter are:

- `background-alt` — the alternating field. Evidence: `.section.background-alt{background-color:var(--global-section-background-color-alt)}` with `--global-section-background-color-alt:rgb(245,245,247)` and its dark counterpart `--global-section-background-color-alt-dark:rgb(29,29,31)`. [R5]
- `no-pad-bottom` / `preserve-pad-bottom` / `no-pad-top` — per-section overrides of the vertical rhythm. [R1]

### 1.2 The flagship product page

`/iphone-18-pro/` shows the canonical detail-page shape: a **mostly dark page** with two light interruptions. Verbatim section list: [R6]

```html
<section class="section section-media-hero section-media-hero no-pad  media-layout-background ribbon-full-width" …>
<section id="highlights" class="section section-highlights theme-dark background-alt" …>
<section class="section section-aio no-pad-bottom theme-dark" …>
<section id="design" class="section section-product-viewer theme-dark background-alt" …>
<section id="cameras" class="section section-pro-camera section-product-story theme-dark no-pad-bottom" …>
<section id="pro-video" class="section section-pro-video section-product-story theme-dark no-pad-bottom" …>
<section id="battery" class="section section-battery section-product-story preserve-pad-bottom theme-dark" …>
<section id="performance" class="section section-performance no-pad-top preserve-pad-bottom theme-dark" …>
<section id="upgrader" class="section section-upgrader preserve-pad-bottom theme-dark" …>
<section id="shared-features" class="section section-intro section-family theme-dark background-alt" …>
<section id="accessories" class="section section-accessories theme-dark no-pad-bottom" …>
<section class="section section-incentive background-alt" …>
<section class="section section-contrast background-alt no-pad-top" data-deep-link='compare' …>
<section class="section section-environment background-alt no-pad-top" …>
<section class="section section-values background-alt no-pad-top" …>
<section class="section section-index" …>
<section class="ac-gf-sosumi" data-nosnippet aria-label="Footnotes">
<section class="ac-gf-footer">
```

Three things to mirror: (a) **story sections alternate between `theme-dark` on `#000` and `background-alt` on `#f5f5f7`**; (b) the story sequence ends with `section-index`, followed by a footnotes block and the global footer; (c) **each story section is a full-bleed media field with a headline and 1–2 utility links**, e.g. the compare section:

```html
<section class="section section-contrast background-alt no-pad-top" data-anim-scroll-group="Contrast"
         data-component-list="StaggeredFadeIn" data-ric-section>
  <div class="viewport-content">
    <header class="section-header row">
      <h2 class="section-header-headline typography-section-header-headline" data-staggered-item
          id="contrast-section-header">Keep exploring iPhone.</h2>
      <div class="section-header-cta-list-wrapper">
        <ul class="section-header-cta-list typography-section-header-link column">
          <li class="section-header-cta-item" data-staggered-item>
            <a href="/iphone/" class="action-handler icon-wrapper section-header-cta-link">
              <span class="icon-copy">Explore all iPhone</span>
              <span class="icon icon-after more" aria-hidden="true"></span>
            </a>
```

— a **headline on the left, a secondary link row on the right, both fade-staggered**, then the card/tile container. [R6]

### 1.3 Section padding

The vertical rhythm is one variable, overridden per breakpoint. From the iPhone 18 Pro bundle, verbatim: [R6]

```css
:root{…--global-section-background-color-alt:rgb(245,245,247);--global-section-background-color-alt-dark:rgb(29,29,31);--global-section-padding:144px}
@media(max-width:1068px){:root{--global-section-padding:120px}}
@media(max-width:734px){:root{--global-section-padding:112px}}
```

The same variable on the iPhone overview page is set to 112/96/56 px and on the MacBook Air page to 128/160 px, i.e. **the ladder is per-template, but always a single number repeated at the three breakpoints**. Rule of thumb: **~112–144 px above/below each story section on desktop, ~56–64 px on phones**, i.e. section padding is roughly a *type-size multiple* rather than a fixed token. [R5][R6][R11]

Section headers get their own scale: `.section-header{padding-bottom:80px;grid-row-gap:20px;column-gap:120px}` with `@media(max-width:1068px)` → `padding-bottom:64px`, `@media(max-width:734px)` → `padding-bottom:48px` and switching to `flex-direction:column;gap:16px` (headline above links). [R5]

## 2. Typography

### 2.1 Font stack actually served

Static CSS declares a family chain that assumes the OS fonts, and Apple's own web-font endpoint supplies the branded faces. Verbatim: [R5]

```css
font-family:SF Pro Display,SF Pro Icons,Helvetica Neue,Helvetica,Arial,sans-serif   /* headlines */
font-family:SF Pro Text,SF Pro Icons,Helvetica Neue,Helvetica,Arial,sans-serif      /* body/copy */
```

with localized overrides selected by `:lang()` (e.g. `:lang(ja)` → `SF Pro JP,SF Pro Display,SF Pro Icons,Hiragino Kaku Gothic Pro,…`, `:lang(zh-CN)` → `SF Pro SC,…`). [R5]

`https://www.apple.com/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3` returns `200 text/css` with `@font-face` blocks for **`SF Pro Display`, `SF Pro Text`, `SF Pro Icons`** in weights 100–900, `src` in `woff2`/`woff`/`ttf`, each file carrying the comment `/* (C) 2019 Apple Inc. All rights reserved. */`. Example verbatim: [R16]

```css
@font-face {
	font-family:'SF Pro Display';
	font-style:normal;
	font-weight:100;
	src:url('/wss/fonts/SF-Pro-Display/v3/sf-pro-display_ultralight.woff2') format('woff2'), …;
	/* (C) 2019 Apple Inc. All rights reserved. */
}
```

No `font-display` descriptor is present in the served CSS. **Practical consequence for eguidar: do not self-host SF Pro.** The free, system-resolved equivalent is `-apple-system`/`system-ui`, which `globals.css` already lists first (see §12).

### 2.2 The type ladder (verbatim values)

Every named style declares its font-size, line-height (unitless), weight, letter-spacing and family in one rule, repeated verbatim inside `@media(max-width:1068px)` and `@media(max-width:734px)`. From the iPhone overview bundle: [R5]

| Style | ≥1069 px | 735–1068 px | ≤734 px |
|---|---|---|---|
| `typography-headline-super` / `typography-page-header-title` | 80 / 1.05 / 600 / **−0.015em** | 64 / 1.0625 / 600 / −0.009em | 48 / 1.0835 / 600 / −0.003em |
| `typography-modal-header-headline` | 56 / 1.0714 / 600 / −0.005em | 48 / 1.0835 / 600 / −0.003em | 32 / 1.125 / 600 / +0.004em |
| `typography-section-header-headline` | 56 / 1.0714 / 600 / −0.005em | 48 / 1.0835 / 600 / −0.003em | 28 / 1.1429 / 600 / +0.007em |
| `typography-product-tile-headline` | 28 / 1.1429 / 600 / +0.007em | 24 / 1.1667 / 600 / +0.009em | 21 / 1.1905 / 600 / +0.011em |
| `typography-product-tile-positioning` | 17 / 1.4706 / 400 / −0.022em | 14 / 1.4286 / 400 / −0.016em | 14 / 1.4286 / 400 / −0.016em |
| `typography-product-tile-subheading` (price) | 17 / 1.4706 / 600 / −0.022em | 14 / 1.4286 / 600 / −0.016em | 14 / 1.4286 / 600 / −0.016em |
| `typography-product-tile-ctas` | 17 / 1.1765 / 400 / −0.022em | 14 / 1.2858 / 400 / −0.016em | 14 / 1.2858 / 400 / −0.016em |
| `typography-body` | 17 / 1.4706 / 400 / −0.022em | — | — |
| `typography-caption` / `typography-product-tile-caption` | 12 / 1.3334 / 400 / −0.01em | — | — |
| `typography-tout` | 19 / 1.2105 / 600 / +0.012em | — | — |
| `typography-eyebrow` | 24 / 1.1667 / 600 / +0.009em | 21 / 1.1905 / 600 / +0.011em | — |

Verbatim samples: [R5]

```css
.typography-headline-super{font-size:80px;line-height:1.05;font-weight:600;letter-spacing:-0.015em;font-family:SF Pro Display,…}
.typography-section-header-headline{font-size:56px;line-height:1.0714285714;font-weight:600;letter-spacing:-0.005em;font-family:SF Pro Display,…}
.typography-product-tile-headline{font-size:28px;line-height:1.1428571429;font-weight:600;letter-spacing:.007em;font-family:SF Pro Display,…}
.typography-product-tile-positioning{font-size:17px;line-height:1.4705882353;font-weight:400;letter-spacing:-0.022em;font-family:SF Pro Text,…}
.typography-body{font-size:17px;line-height:1.4705882353;font-weight:400;letter-spacing:-0.022em;font-family:SF Pro Text,…}
```

The homepage tile scale is slightly different and worth noting as the "marketing tile" ladder: [R8]

```css
.typography-tile-headline{font-size:56px;line-height:1.0714285714;font-weight:600;letter-spacing:-.005em;font-family:SF Pro Display,…}
@media(max-width:1068px){.typography-tile-headline{font-size:48px;line-height:1.0834933333;letter-spacing:-.002em;…}}
@media(max-width:734px){.typography-tile-headline{font-size:32px;line-height:1.125;letter-spacing:.002em;…}}
.typography-tile-subhead{font-size:28px;line-height:1.1428571429;font-weight:400;letter-spacing:.007em;…}
```

Three transferable principles:

1. **Headlines are weight 600, never 700+.** Every headline style above is `font-weight:600`; body is always `400`; price/tagline lines are `600`. No style uses 500 or 700.
2. **Tracking is size-dependent and hand-tuned**: strongly negative at 56–80 px, mildly negative at 17 px body (`−0.022em`), and *positive* at small display sizes (28 px tile headline is `+0.007em`). [R5]
3. **Type does not fluidly interpolate.** No `clamp()` is used for any font-size on the pages inspected; `clamp()` appears only in layout rules (e.g. `--h-padding:clamp(0px,6.25vw,120px)`, and the hero height `height:clamp(var(--min-height),var(--fluid-height),min(100vw,var(--p-width)))`). [R5][R6]

### 2.3 Headline colours

Headlines and body share the same text colour token; the theme decides it. Verbatim: [R5][R6]

```css
:root{--sk-body-text-color:rgb(29,29,31);--sk-headline-text-color:rgb(29,29,31);--sk-body-background-color:rgb(255,255,255);…}
.section.theme-dark{background-color:var(--sk-body-background-color,rgb(0,0,0));color:var(--sk-body-text-color,rgb(245,245,247))}
```

So: **light theme → `#1d1d1f` on `#ffffff`; dark theme → `#f5f5f7` on `#000000`.** There is no separate headline hue.

## 3. Colour palette

All values below are verbatim from the bundles; the "where" column names the selector context from which the value was read. [R4][R5][R6][R8]

| Token | Light | Dark | Where |
|---|---|---|---|
| Page background | `rgb(255,255,255)` `#ffffff` | `rgb(0,0,0)` `#000000` | `--sk-body-background-color` |
| Alternating section field | `#f5f5f7` | `#1d1d1f` (`rgb(29,29,31)`) | `--global-section-background-color-alt` / `-alt-dark` |
| Primary text / headline | `#1d1d1f` (`rgb(29,29,31)`) | `#f5f5f7` (`rgb(245,245,247)`) | `--sk-body-text-color`, `--sk-headline-text-color` |
| Secondary / muted text | `#6e6e73` (`rgb(110,110,115)`) | `#86868b` (`rgb(134,134,139)`) | `--sk-glyph-gray-secondary` |
| Link | `#0066cc` (`rgb(0,102,204)`) | `#2997ff` (`rgb(41,151,255)`) | `--sk-body-link-color` |
| Button fill blue | `#0071e3` (`rgb(0,113,227)`) | same | `--sk-fill-blue` |
| Button hover / active | `#0076DF` / `#006EDB` | same | `.button{--sk-button-background-hover/-active}` |
| Neutral (dark) button | `#1d1d1f` bg, hover `#272729`, active `#18181A` | — | `.button-neutral` |
| Secondary button (outline) | transparent bg, `rgb(0,102,204)` text+border, hover fills `#0076DF` | text+border `rgb(41,151,255)` | `.button-secondary` |
| Hairline / border | `#d2d2d7` | — | `.selection-buttons .item>a{border:1px solid #d2d2d7}` |
| Focus ring | `#0071e3` | — | `--sk-focus-color:#0071e3` |
| Deep black card field | — | `#161617` | `.section:has(.index){background-color:#161617}` |

Verbatim evidence for the key pairs: [R5][R6]

```css
:root{--sk-body-link-color:rgb(0,102,204);--sk-link-disabled-opacity:0.42}
:root{--sk-focus-color:#0071e3;--sk-focus-color-alt:rgb(0,0,0);--sk-focus-offset:1px;--sk-focus-offset-container:3px}
.button{…--sk-button-background:rgb(0,113,227);--sk-button-background-hover:#0076DF;--sk-button-background-active:#006EDB}
.button-secondary{--sk-button-background:transparent;--sk-button-background-hover:#0076DF;--sk-button-background-active:#006EDB;--sk-button-color:rgb(0,102,204);--sk-button-color-hover:rgb(255,255,255);--sk-button-border-color:rgb(0,102,204)}
```

Two observations that matter for eguidar's storefront: (1) the hover blue is a *lighter* blue than the resting button blue (`#0076DF` > `#0071e3`), i.e. **hover brightens**; (2) the alternating field is **one single light grey**, never a gradient, and it is the *only* structural background variation on a page. [R5]

## 4. Product tiles (the "lineup card")

### 4.1 Composition

The canonical lineup tile, verbatim from `/iphone/` (long `alt` text abbreviated, whitespace inserted between tags for readability — markup otherwise unchanged): [R1]

```html
<li class="product-tile product-tile-iphone-duo gallery-item grid-item" role="listitem" data-staggered-item>
  <h3 class="product-tile-product-id product-tile-padding">
    <span class="badge badge-reduced badge-no-scrim product-tile-badge">New</span>
    <span class="product-tile-headline-group">
      <span class="visuallyhidden">iPhone Duo </span>
      <span aria-hidden="true" class="product-tile-headline typography-product-tile-headline">iPhone Duo</span>
    </span>
  </h3>
  <a href="/iphone-duo/" class="product-tile-image-link" data-analytics-title="learn more - iphone duo - image">
    <picture id="overview-select-iphone-duo-1" class="overview-select-iphone-duo product-tile-image" data-lazy>
      <source data-empty srcset="data:image/gif;base64,…" media="(min-width:0px)" />
      <img src="/v/iphone/home/ck/images/overview/select/iphone_duo__hefmlegzwbmi_large.jpg" onload="window.__lp?.(event)" alt="iPhone Duo, Star White color, …" >
    </picture>
    <noscript><picture class="… product-tile-image">…<source srcset="…_small.jpg, …_small_2x.jpg 2x" media="(max-width:734px)" /><source srcset="…_medium.jpg, …_medium_2x.jpg 2x" media="(max-width:1068px)" /><source srcset="…_large.jpg, …_large_2x.jpg 2x" media="(min-width:0px)" />…</picture></noscript>
  </a>
  <div class="colorindicator">
    <ul class="colorindicator-items" role="list" aria-label="Available colors">
      <li class="colorindicator-item colorindicator-swatch finish-iphoneduo-star-white"><span class="visuallyhidden">Star White</span></li>
      <li class="colorindicator-item colorindicator-swatch finish-iphoneduo-night-sky"><span class="visuallyhidden">Night Sky</span></li>
    </ul>
  </div>
  <p class="product-tile-positioning typography-product-tile-positioning product-tile-padding">The largest display of any iPhone. Foldable. Posable. And durable.</p>
  <p class="product-tile-price product-tile-padding typography-product-tile-subheading"><span>…</span></p>
  <div class="product-tile-ctas product-tile-ctas-inline product-tile-ctas-primary typography-product-tile-ctas" data-ctas>
    <a href="/iphone-duo/" class="action-handler button product-tile-button" aria-label="Learn more, iPhone Duo"><span class="icon-copy">Learn more</span></a>
    <a href="/us/shop/goto/buy_iphone/iphone_duo" class="action-handler icon-wrapper product-tile-link" aria-label="View pricing, iPhone Duo"><span class="icon-copy">View pricing</span><span class="icon icon-after more" aria-hidden="true"></span></a>
  </div>
</li>
```

The ordered anatomy is exactly:

1. **product name + badge** (`h3`, badge = "New"),
2. **the image** — a single `<a>` wrapping a `<picture>` with **three responsive crops** (`_small` ≤734 px, `_medium` ≤1068 px, `_large` above) each with a 2× variant, `data-lazy` and a base64 transparent placeholder, plus a `<noscript>` duplicate so the page works without JS,
3. **colour swatches** (`colorindicator`),
4. **one-sentence positioning line**,
5. **price line** ("From $X / or $Y/mo for N mo."),
6. **two CTAs**: a **filled blue pill** ("Learn more") and a **text link with a chevron** ("View pricing").

### 4.2 Geometry, border, hover

Verbatim: [R5]

```css
.product-tile{--sk-paragraph-plus-element-margin:0px;--sk-headline-plus-first-element-margin:0px;--product-tile-width:372px;--product-tile-padding:28px;width:var(--product-tile-width);list-style-type:none}
/* @media(max-width:1068px): */
.product-tile{--product-tile-width:344px;--product-tile-padding:24px}
.product-tile-image-link{color:inherit;text-decoration:none;margin:0 0 40px}
.product-tile-image-link .product-tile-image{transition:transform .3s cubic-bezier(0,0,0.5,1)}
.product-tile-image-link:hover .product-tile-image{transform:scale(1.0161)}
.product-tile-image{margin:0 auto}
```

Key facts, all quoted above: **there is no `border`, no `box-shadow`, no `background`, and no `border-radius` declared on `.product-tile`.** The tile is transparent and the image sits on the page's field. **The hover affordance is the image growing to 1.0161× over 300 ms**, plus the copy-link underlining (`icon-wrapper:hover .icon-copy{text-decoration:underline}`). [R5]

The **rounded card variant** exists but belongs to marketing *card sets*, not the lineup: `--sk-tile-border-radius:28px` (with `large` = the base value and `small`/`medium`/`xlarge` all falling back to it), applied through `.card.tile-rounded .card-control::after{border-radius:var(--sk-tile-border-radius)}` on a neutral fill (`--card-bg-color`, e.g. `rgb(245,245,247)` light / `rgb(29,29,31)` dark). [R5][R6]

Tile-set container and gaps: [R5]

```css
.item-container{margin:0 auto;display:grid;grid-gap:20px;grid-auto-flow:column;width:fit-content;padding:0 var(--shared-media-gallery-padding);list-style-type:none}
.gallery-item{scroll-snap-align:start}
.scroll-snap-type:x mandatory                                        /* the gallery scroller */
```

So: **20 px gap**, and the tile row is a **scroll-snapping horizontal gallery** on the pages where it is a `scroll-gallery`; on the iPhone page the same `product-tile-set` markup renders inside a centred `item-container` grid. Both are borderless. [R5]

### 4.3 Colour swatches on the tile

Verbatim: [R5]

```css
--sk-colorindicator-swatch-size:12px
--sk-colorindicator-item-margin:3px
--sk-colorindicator-border-width:1px
--sk-colorindicator-swatch-border-color:conic-gradient(from 270deg,rgba(0,0,0,0.08) 0deg,rgba(0,0,0,0.48) 64.8deg,rgba(0,0,0,0.48) 115.2deg,rgba(0,0,0,0.08) 180deg,rgba(0,0,0,0) 208.8deg,rgba(0,0,0,0) 331.2deg,rgba(0,0,0,0.08) 360deg)
--sk-colorindicator-label-color:rgb(110,110,115)
```

**12 px circles, 3 px apart, with a conic-gradient "edge light" instead of a flat border**, labels visually hidden but present for assistive tech. The swatches are **display-only on the lineup tile** — they are not the filter control.

## 5. Buttons and links

### 5.1 The pill button

Verbatim: [R5]

```css
.button{--sk-button-border-radius:980px;--sk-button-margin-horizontal:14px;--sk-button-margin-vertical:14px;--sk-button-min-width-basis:60px;--sk-button-padding-horizontal:16px;--sk-button-padding-vertical:9px;--sk-button-border-width:1px;font-size:14px;line-height:1.2857742857;font-weight:400;letter-spacing:-0.016em;font-family:SF Pro Text,…;background:var(--sk-button-background);color:var(--sk-button-color);padding-block:calc(var(--sk-button-padding-vertical) - var(--sk-button-border-width));padding-inline:calc(var(--sk-button-padding-horizontal) - var(--sk-button-border-width));border-radius:var(--sk-button-border-radius);border:var(--sk-button-border-width) solid var(--sk-button-border-color);…white-space:nowrap}
.button:hover{background:var(--sk-button-background-hover,var(--sk-button-background));color:var(--sk-button-color-hover,var(--sk-button-color));text-decoration:none;border-color:rgba(0,0,0,0)}
.button:active{background:var(--sk-button-background-active,var(--sk-button-background));color:var(--sk-button-color-active,var(--sk-button-color));outline:none}
.button-super{--sk-button-padding-horizontal:31px;--sk-button-padding-vertical:18px;font-size:17px;…}
.button-elevated{--sk-button-padding-horizontal:22px;--sk-button-padding-vertical:12px;font-size:17px;…}
.button-reduced{--sk-button-padding-horizontal:11px;--sk-button-padding-vertical:4px;font-size:12px;…}
.button-block{--sk-button-box-sizing:border-box;--sk-button-width:100%;--sk-button-display:block;--sk-button-border-radius:8px;…}
```

i.e. **a true pill**: `border-radius:980px`, ~16 × 9 px padding at the 14 px default size, scaling to 31 × 18 px at 17 px (`super`); when it must be full-width (`button-block`) the radius **becomes 8 px** rather than staying a pill. Copy is never uppercase. [R5]

### 5.2 The chevron text link

Verbatim: [R5]

```css
.icon-after::after,.more::after{padding-inline-start:.24em;top:0}
.icon-wrapper{text-decoration:none}
.icon-wrapper:hover .icon-copy{text-decoration:underline}
```

A text link with a `›` glyph appended, **underline only on the text (not the glyph), on hover**. The link colour is the `#0066cc` link token; in the local nav the same widget appears as a white-on-blue pill. [R5][R6]

### 5.3 Focus states

Verbatim: [R5]

```css
:focus-visible{outline:2px solid var(--sk-focus-color,#0071e3);outline-offset:var(--sk-focus-offset,1px)}
.button:focus-visible{outline:2px solid var(--sk-focus-color,#0071e3);outline-offset:var(--sk-focus-offset-container,3px)}
```

with `--sk-focus-offset:1px` and `--sk-focus-offset-container:3px`. Nested controls that cannot take an outline directly are faked with a `::before` overlay carrying the same 2 px outline (`outline:2px solid #0071e3;outline-offset:3px`), and on very dark media the ring is doubled (`box-shadow:0 0 0 3px #000,0 0 0 5px #0071e3`). [R5]

## 6. Navigation

### 6.1 Global nav (44 px, translucent)

Verbatim: [R10][R13]

```css
--r-globalnav-height:44px        /* desktop; 48px below the mobile breakpoint */
#globalnav{--r-globalnav-color: rgba(0, 0, 0, .8);--r-globalnav-color-secondary: #333336;--r-globalnav-color-hover: #000000}
.globalnav-content{display:flex;padding:0;position:absolute;top:0;width:100%;height:100%;background:var(--globalnav-background);transition:background … cubic-bezier(.4,0,.6,1) 80ms;backdrop-filter:var(--globalnav-backdrop-filter)}
@supports (backdrop-filter: initial){
  #globalnav.globalnav-scrim,.globalnav-scrim #globalnav{
    --globalnav-backdrop-filter: saturate(180%) blur(20px);
    --globalnav-background: rgba(250, 250, 252, .8)
  }
}
```

and when the flyout is open the bar becomes opaque: `--globalnav-background: rgba(250, 250, 252, .92)`; the dark variant uses `rgba(22, 22, 23, .8 / .92)`. Text colour is `rgba(0,0,0,.8)` on light, `rgba(255,255,255,.8)` on dark, brightening to full black/white on hover. [R13]

The nav markup is a `<nav id="globalnav">` containing a `<ul id="globalnav-list">` of `globalnav-item`s, the first being the Apple glyph as inline `<svg>`, plus `globalnav-menu`, search and bag items. A mobile menu-back button (`globalnav-menuback-button`) exists in the same markup and is switched on by CSS/JS. [R1][R3]

### 6.2 Local nav (product subnav, 48 px)

Verbatim markup on `/iphone-18-pro/`: [R6]

```html
<nav … class="localnav-container theme-dark theme-reveal-on-scroll" data-reveal=".section-media-hero .marquee-detail" data-reveal-keyframe="a0b" data-toggle-theme=".section-incentive" data-toggle-theme-alt=".section-incentive-alt" data-component-list="LocalNav">
  <div class="localnav-wrap">
    <div class="content-collapsed-wrap" data-analytics-activitymap-region-id="local nav">
      <a href="/iphone-18-pro/" class="product-name typography-localnav-product-name">iPhone 18 Pro</a>
      <ul class="cta-buttons">
        <li><button class="typography-caption cta explore" aria-label="Explore iPhone 18 Pro">…Explore…</button></li>
        <li><a href="/us/shop/goto/buy_iphone/iphone_18_pro" class="typography-caption cta buy" aria-label="Buy, iPhone 18 Pro">Buy</a></li>
      </ul>
    </div>
    …
```

Verbatim CSS: [R6][R13]

```css
--localnav-min-height:52px; --localnav-height:calc(48px * var(--r-localnav-text-zoom-factor)); --localnav-total-height:calc(var(--localnav-min-height) + var(--localnav-…))
--localnav-background: rgba(250, 250, 252, 0.8)        /* light theme, scrolled */
--localnav-background: rgba(22, 22, 23, 0.8)           /* dark theme, scrolled */
--localnav-background-stuck, rgba(250, 250, 252, 0.92) /* fully stuck, light */
--localnav-background-stuck, rgba(22, 22, 23, 0.88)    /* fully stuck, dark */
--localnav-anim-duration:0.4s; --localnav-anim-fn:ease-out
.localnav-container.theme-reveal-on-scroll .localnav-wrap{transform:translateY(calc(var(--localnav-total-height)*-1))}
.localnav-container+.localnav-overlay-background{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9997;opacity:0;pointer-events:none;backdrop-filter:blur(20px);transition:opacity var(--localnav-anim-duration) var(--localnav-anim-fn)}
.localnav-container .cta{background-color:var(--sk-fill-blue);color:var(--sk-fill);border-radius:10em;padding:var(--cta-padding-block) var(--cta-padding-inline);…}
.localnav-container .content-collapsed-wrap .cta-buttons{--cta-gap:10px;display:flex;align-items:center;…;gap:var(--cta-gap)}
.typography-localnav-product-name{font-size:19px;line-height:1.2105263158;font-weight:600;letter-spacing:.012em;font-family:SF Pro Display,…}
```

Behaviour, as evidenced: the bar is **hidden by translating itself up by its own total height** and slides in when the hero's scroll anchor passes (`theme-reveal-on-scroll`, `data-reveal=".section-media-hero .marquee-detail"`). Its left slot is the **product name** (19 px/600), its right slot is **two pills 10 px apart**: `Explore` (opens a full product picker panel) and `Buy` (blue pill, `border-radius:10em`, hover `#0076df`). The expanded panel is a **horizontal scroll-snap product list** (`overflow-x:scroll;scroll-snap-type:inline`) with 80 px product images and badges. [R6]

### 6.3 Footer

Verbatim: `.ac-gf-footer{border-top:1px solid var(--footer-section-border-color);padding:17px 0 11px;padding-bottom:calc(11px + env(safe-area-inset-bottom))}` — a **single hairline separator** above the footer, on `--footer-background: rgb(245, 245, 247)` (dark: `rgb(29, 29, 31)`) with `--footer-border-color: rgba(0, 0, 0, 0.16)`, directory links in `rgba(0, 0, 0, 0.72)`, the shop block separated by its own 1 px border, and the mini-shop link in the link blue `rgb(0, 102, 204)` (`rgb(41, 151, 255)` dark). [R14]

## 7. Grid, containers and spacing

Verbatim: [R5][R6]

```css
:root{--global-content-max-width-hero:1680px;--global-content-max-width:1260px}
--responsive-content-clamped-width:min(var(--responsive-content-max-width),var(--responsive-content-width))
--responsive-content-max-width:var(--global-content-max-width)
--responsive-content-width:min(var(--global-content-max-width),87.5%)
--responsive-gutter-width:calc(50% - var(--responsive-content-clamped-width)/2)
```

So the **content container is 1260 px wide or 87.5 % of the viewport, whichever is smaller**, with the hero media allowed to run to 1680 px; the gutter is derived arithmetically rather than declared. A 420 px cap exists for the mobile size, and on product pages content is subdivided on a **12-column basis** (`var(--global-content-max-width)/12 * N` rules are present for every N). [R5][R6]

The breakpoint ladder across the pages inspected (media-query counts, iPhone 18 Pro bundle): **`max-width:734px` (360 occurrences), `max-width:1068px` (205), `min-width:735px` (38), `min-width:1441px` (38), `min-width:1069px` (35), `max-width:480px` (23), `min-width:1069px and max-width:1440px` (6), `max-width:420px` (4)**. The Store-family bundles add `734 / 833 / 1023 / 1068 / 1440 / 1441`. [R6][R9]

The grid primitive is the `ric` 12-column system: [R5]

```css
.ric-grid-wrap,body .ric-large-3.ric-grid-wrap{grid-template-columns:repeat(3,1fr)}
.ric-grid-wrap.children-ric-large-3>*{grid-column:auto/span 3}
/* @media(max-width:734px) → the ric-small-N column definitions */
body .ric-grid-wrap.ric-bento-gap{grid-gap:20px;gap:20px}
```

with **20 px gaps** as the recurring value (also the gallery gap in §4.2).

Practically, for a store grid the translatable rule from Apple is: **container ≤1260 px, one 20 px gap unit, and a hard breakpoint switch of column count rather than a fluid squeeze.**

## 8. Responsive behaviour of tiles and hero

- **Tiles**: 372 px wide with 28 px inner padding above 1068 px; 344 px with 24 px below it, inside a scroll-snapping row; images re-cut at each breakpoint (`_small` ≤734, `_medium` ≤1068, `_large` above). [R1][R5]
- **Hero**: height is fluid between two per-breakpoint bounds and finally capped by the artwork's own width, verbatim `height:clamp(var(--min-height),var(--fluid-height),min(100vw,var(--p-width)))` (with `--section-height-default:clamp(var(--section-height-min),100svh,var(--section-height-max))` alongside it); the hero's bounds themselves step: `--section-height-min:840px;--section-height-max:1692px` (desktop) → `475px/800px` (phone). [R6]
- **Section headers** collapse from a two-column header (headline | links) at desktop to a stacked column at ≤734 px with `gap:16px` and `padding-bottom:48px`. [R5]
- **Homepage tiles** are a fixed-content grid whose copy block is pushed right by a fixed margin at desktop (`margin-left:338px`/`311px` variants) and stacked on small screens. [R8]

## 9. Motion

### 9.1 What the markup declares

Component names, read from `data-component-list` attributes on `/iphone-18-pro/`: `StaggeredFadeIn` (30×), `Card WillChange` (22×), `Modal` (15×), `CaptionTileGallery` (5×), `InlineMediaDefault` (3×), `DropDown` (3×), `VideoScrub` (2×), `ScrollGallery WillChange` (2×), `ProductViewer*` (5×), `MediaBlockGallery` (2×), `InlineCompare` (2×), `Upgrader`, `TextOverMedia`, `TextIconControl`, `MediaCardGallery`, `LocalNav`. [R6]

### 9.2 StaggeredFadeIn, verbatim

```css
[data-component-list*=StaggeredFadeIn]{--staggered-delay:0.15;--staggered-opacity-duration:0.9;--staggered-translate-y:30px;--staggered-translate-y-duration:0.7}
[data-component-list*=StaggeredFadeIn].pre-animation{visibility:hidden;opacity:0}
[data-component-list*=StaggeredFadeIn][data-staggered-item-no-translate]{--staggered-translate-y:0}
```

and the driver, verbatim from the bundle's staggered-fade class: [R5][R7]

```js
this.OPACITY_DURATION=Number(t.getPropertyValue("--staggered-opacity-duration"))
this.TRANSLATE_Y=t.getPropertyValue("--staggered-translate-y")
this.staggeredPlayScrollGroup.addEvent(this.staggeredAnchor,{start:"t - 85vh",event:"staggered-play",onEvent:()=>{this.timeGroup.play()}})
… this.timeGroup.addKeyframe(e,{el:e,start:"0 + "+t*this.DELAY,end:`${this.TRANSLATEY_DURATION} + ${t*this.DELAY}`,y:[this.TRANSLATE_Y,0],easeFunction:"easeInOutQuad",anchors:[this.staggeredAnchor]})
… this.timeGroup.addKeyframe(e,{el:e,start:"0 + "+t*this.DELAY,end:`${this.OPACITY_DURATION} + ${t*this.DELAY}`,opacity:[0,1],easeFunction:"easeInOutQuad",anchors:[this.staggeredAnchor]})
```

**Meaning: items are invisible until the trigger line reaches 85 % of the viewport height; then each item fades 0→1 over 0.9 s and rises 30 px over 0.7 s, offset by 0.15 s per index, all on the custom "easeInOutQuad" curve.** [R5][R7]

Notably, **`IntersectionObserver` does not appear in this bundle** — the scroll system is Apple's own keyframe engine driving scroll groups anchored to element positions (`"t - 85vh"`, `"a0t - 100vh"`). So a faithful re-implementation on eguidar is free to use `IntersectionObserver`, which achieves the same observable result. [R7]

### 9.3 Other timings found

| Behaviour | Declaration | Source |
|---|---|---|
| Tile image hover zoom | `transition:transform .3s cubic-bezier(0,0,0.5,1)` + `scale(1.0161)` | [R5] |
| Local nav slide/background | `--localnav-anim-duration:0.4s`, `--localnav-anim-fn:ease-out` | [R6] |
| Global nav background | `cubic-bezier(.4,0,.6,1)` with 80 ms delay (flyout rate variable resolves to `0s`) | [R13] |
| Buy-bar slide | `transform .5s ease-in-out` on `.rf-bfe-stickybar-content` | [R21] |
| Buy-flow price swap | `transition:opacity .5s ease-out,transform .5s ease-out` | [R21] |
| Modal scrim | `.ric-modal{--modal-scrim-blur:20px}` applied via `backdrop-filter:blur(var(--modal-scrim-blur))`; scrim fade `transition:opacity 320ms cubic-bezier(0.4, 0, 0.6, 1) 240ms` | [R5][R6][R13] |
| Progress/ribbon animations | `@keyframes ribbon-drop`, `ribbon-animate-*`, `fade-in`, `link-in`, `aap-animate-progress` | [R5] |

`will-change` is used sparingly and switched off again (`will-change:transform`, `will-change:opacity,transform`, and `will-change:unset` in 5 rules). **No CSS `scroll-timeline`/`animation-timeline`/`view-timeline` declarations exist in any bundle inspected.** [R5][R6]

### 9.4 Reduced motion and out-of-view media

Verbatim: [R6][R7]

```css
@media(prefers-reduced-motion){.ribbon-drop-wrapper{animation:none}}
@media(prefers-reduced-motion){.ribbon-animate-color .ribbon-content{color:var(--ribbon-text-color);animation:none}}
```

```js
if(!this._autoPlayWithReducedMotion && l.prefersReducedMotion) return;
// _autoPlayWithReducedMotion default: (0,a.default)(e,this.options,"autoPlayWithReducedMotion",!1)
if(!this._inFrame && …) …this.media.play()   // play only when the media is in frame
```

i.e. **media does not autoplay when the user prefers reduced motion unless the component explicitly opts in, and playback is tied to being in frame.** `StaggeredFadeIn` also removes its `pre-animation` class after playing, so the hidden state is temporary, not a permanent barrier. [R7]

## 10. Accessibility practices worth mirroring

- **Focus**: 2 px `#0071e3` ring, 1 px offset (3 px for container controls); a doubled ring on dark media. [R5]
- **Visually-hidden helper**: `clip:rect(1px,1px,1px,1px);clip-path:inset(0 0 99.9% 99.9%);overflow:hidden;height:1px;width:1px;padding:0;border:0` — used for swatch labels, image links and "Footnote" prefixes, so the visible UI can stay clean while the accessible tree stays complete. [R5]
- **Links name their destination**: every product-tile action carries `aria-label="Learn more, iPhone Duo"` / `"View pricing, iPhone Duo"`; images carry long descriptive `alt` (colour, orientation, camera detail). [R1]
- **Contrast pairs** (computed): `#1d1d1f`/white 16.83:1; `#1d1d1f`/`#f5f5f7` 15.46:1; `#6e6e73`/white 5.07:1; `#6e6e73`/`#f5f5f7` 4.66:1; `#0066cc`/white 5.57:1; `#f5f5f7`/black 19.29:1; `#2997ff`/black 6.96:1; white/`#0071e3` 4.70:1. **Every pair clears WCAG AA for its use**; the secondary grey on the alt field is the tightest at 4.66:1 and still clears 4.5:1. [R4][R5]
- **No-JS parity**: every enhanced component ships a `<noscript>` fallback (the picture sources, the buy-flow selection rows), and `no-js` body classes switch layouts to static. [R1][R19]
- **Semantics**: product rows are `<ul role="list">`/`<li role="listitem">` labelled with `aria-labelledby`; sections carry `aria-label`; footnotes are a real `<section class="ac-gf-sosumi" aria-label="Footnotes">`. [R1]

## 11. Filtering and selection — the parallel to eguidar's sidebar

The iPhone/Mac/store pages inspected have **no filter sidebar, no brand/price facets, no sort control and no pagination**. The patterns Apple uses instead, with evidence:

1. **Selection lives on the tile**: colour swatches (`colorindicator`, 12 px circles) are informational; there is no interactive filter UI on the lineup page. [R1]
2. **Navigation replaces filtering**: a `section-header` with a "Compare all models" / "Explore all iPhone" `icon-wrapper` link; and an `index` section at the page end that lists every model (`typography-index-headline` + `product-tile-set`). [R1][R6]
3. **A horizontal scroll-snapping gallery** substitutes for dense grids of many SKUs (`scroll-snap-type:x mandatory`, `grid-gap:20px`). [R5]
4. **On the buy flow, selection is a decision tree, not a filter**: the server-rendered fallback is a list of variant links, each a bordered row — `.selection-buttons .item>a{border:1px solid #d2d2d7;border-radius:4px;display:block;padding:10px 30px}` — labelled with capacity / colour / carrier in 17 px SF Pro Text, with `.nojs .selection-buttons .item .details>span{line-height:22px}`; the enhanced flow renders "dimension" pickers (`rf-bfe-dimension`, colour nav swatches, price points) under component classes `rf-bfe-dimension-header`, `rf-bfe-product-dimension-colornav-header` (`font-weight:600`), etc. [R19][R20][R23]
5. **The buy flow's anchors are sticky**: `.rf-bfe-stickybar{position:fixed;top:0;width:100%;z-index:9999}` with `.rf-bfe-stickybar-content{background-color:#fff;position:sticky;top:0;transform:translateY(-100%);transition:transform .5s ease-in-out}` and a `.rf-bfe-stickybar-content-visible{transform:translateY(0)}` state; the bottom variant sits on `#f5f5f7` and slides up from below. Prices in this bar are full-size text (`17px / 1.4705882353`) that cross-fades in and out with a 0.5 s `ease-out` `translateY(±100%)`. [R21]
6. **Store pages use card grids, not filters**: the `/store` homepage is a tile hub, and `/shop/accessories/all` presents a **curated card grid with a centred index/chapter nav instead of a filter rail**. Verbatim CSS for its grid: [R4][R9]

```css
.rf-accessory-curated-grid-wrapper{box-sizing:border-box;display:grid;gap:20px;grid-auto-flow:dense;grid-template-columns:repeat(4,1fr);margin-block-start:40px;max-width:1260px}
/* @media → */ .rf-accessory-curated-grid-wrapper{grid-template-columns:repeat(3,1fr)}
/* @media → */ .rf-accessory-curated-grid-wrapper{gap:11px;grid-template-columns:repeat(2,1fr);margin-block-start:24px}
.re-productcard-content{padding:20px}
.re-productcard-content-img img{display:block;flex-shrink:0;height:100%;max-width:none;object-fit:contain;object-position:center;width:100%}
.re-productcard-content:hover{box-shadow:0 8px 16px #00000014;transform:scale(1.02);z-index:1}
.re-productcard-content .colorindicator{inset-inline-start:0;padding-block:0 .7058823529rem;position:absolute;text-align:center;top:16px;width:100%}
```

Note the deliberate difference from the marcom lineup: **these Store cards do carry a hover shadow and a ~1.01–1.02 scale lift**, and their images are `object-fit:contain` on a square canvas, with the `colorindicator` centred under the card rather than left-aligned. The **4/3/2 column ladder with a single 20 px gap** is the same value seen everywhere else. [R9]

**Implication for eguidar**: a borderless tile grid + a *sticky criteria bar* (active chips + a compact sort) is the most Apple-consistent way to keep a real catalogue usable without the sidebar dominating. If the sidebar is kept, it should read as a *plain list of text labels with counts*, not a boxed panel — Apple never draws a container around a control group on these pages.

## 12. Application notes for eguidar `/produits`

Concrete observations about the current code, then recommendations. **No code changes are proposed as edits here; this section is analysis for the implementer.** File references are to this checkout.

### 12.1 What already matches Apple

- `app/globals.css:55-57` already defines `--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif` — the same intent as Apple's `SF Pro Text, SF Pro Icons, Helvetica Neue, …`.
- `app/globals.css:128` sets `letter-spacing: -0.022em` on `body` — **verbatim Apple's body tracking** (`typography-body`). Keeping it as the base and only loosening it for display sizes reproduces Apple's size-dependent tracking policy.
- `app/globals.css:165-172` `.voile-depoli` already implements `saturate(180%) blur(20px)` over a colour-mix — the same recipe as Apple's global/local nav. `components/storefront/global-nav-bar.tsx:49-55` applies it on a sticky `top-0` bar at `h-11` (44 px) — **exactly Apple's 44 px global nav height**.
- `components/storefront/product-card.tsx:46` clamps the title to two lines, which matches Apple's one-sentence positioning line brevity (`product-tile-positioning`).
- `components/storefront/search-filters.tsx:147-157` already places the filter panel in a `sticky top-16` card on `md+` and behind a `MobileFilterDrawer` below — structurally the same responsive split Apple uses (inline list at desktop, drawer/sheet on phone).

### 12.2 Recommended changes, by file

**`components/storefront/product-card.tsx` — make the card disappear.**

| Current | Recommendation (Apple-derived) |
|---|---|
| `className="group flex flex-col gap-2 rounded-2xl border p-3 transition-colors hover:border-ring"` (line 15) | Drop `border`, `rounded-2xl` box and the `hover:border-ring` colour change. Apple's tile has **no border, no shadow, no radius, no background** (§4.2). If a hover affordance is wanted, use the image scale already present in this file rather than a border colour. |
| `rounded-xl` on the image wrapper (line 17) | Apple's lineup imagery is **unrounded, on the page field**; its rounded variant is reserved for `card tile-rounded` marketing cards at **28 px** (§4.2). Either 0 (lineup style) or a single 28 px token — not the current mixed `rounded-2xl`/`rounded-xl` pair (28 px via `--radius * 1.8`, and ~22 px via `1.4`). |
| `bg-muted` behind the image (line 17) | Apple shows product imagery on **`#ffffff` or `#f5f5f7`**, never on a mid-grey; the poster frame is white/`#f5f5f7` (§3). `--muted` here is `oklch(97.1% 0 none)` ≈ `#f6f6f6`, which is close — the mismatch is that it is *inside* a bordered card; with the border gone the effect becomes Apple-like. |
| `group-hover:scale-105` (line 24) | Apple's exact value is **`scale(1.0161)` over `0.3 s cubic-bezier(0,0,0.5,1)`** (§4.2). 1.05 is visually much stronger than Apple's restrained zoom. |
| `gap-2` between image and text (line 15) | Apple puts `40px` between image link and text block (desktop) — i.e. **the image block and the copy block are generous, separate units**, not a tight card stack. If the tile must stay compact, ~24–32 px is closer to Apple than 8 px. |
| `text-xs` brand line, `text-sm` title, `text-base font-bold` price, `text-xs` stock (lines 45–56) | Apple's mapping: brand/tagline ≈ **14 px/400**, product name ≈ **21–28 px/600** with `+0.007em` tracking (tile headline), price ≈ **14–17 px/600**, captions **12 px** (§2.2). In practice: raise the product name one step and **never use `font-bold`** — Apple uses weight **600** for everything emphatic (§2.1). |
| `text-emerald-600` / `text-destructive` stock label (lines 52–54) | Apple does **not** colour-code availability inside the tile; availability is stated in the buy flow and in a footnote. A neutral secondary line, or Apple's muted `#6e6e73`, is more consistent than ad-hoc green/red. |

**`components/storefront/search-results.tsx` — the grid and the page frame.**

- Grid (line 90): `grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4`. Apple's equivalent ladder is a **20 px gap** and discrete column switches at 734/1068 px (§7), with tiles at **372 px desktop / 344 px tablet** (§4.2). Concretely: `gap-5` (20 px) and consider 3 columns at `lg` and 4 only at `xl`, since four columns inside a 1260 px minus sidebar container produces tiles narrower than Apple's 344 px.
- Page frame (`app/(boutique)/produits/page.tsx:25`): `mx-auto max-w-7xl px-4 py-6`. Apple's container is **1260 px (≈ `max-w-[79rem]`) with `py` of 112–144 px between sections** on desktop (§1.3, §7). Even a fraction of that rhythm — e.g. `py-12 md:py-20` — would move the page away from "admin table" spacing.
- Heading (line 67): `text-2xl font-bold`. Apple's section header is `56/48/28 px` at weight 600 with `-0.005em`/`-0.003em`/`+0.007em` tracking (§2.2). A storefront catalogue heading of `text-3xl md:text-4xl font-semibold tracking-tight` would match the intent without literally copying the scale.
- The `{data.totalHits} produits` line (line 68) is already Apple-like (secondary, small); aligning it to the secondary token `#6e6e73` (§3) rather than the theme's `--muted-foreground` (`oklch(54% 0 none)` ≈ `#71717a`) would match Apple's exact secondary grey.
- Pagination (lines 152–235) is a numbered pager with `bg-muted` current page. Apple's long pages end in an **index section** that lists all models, and gallery rows use scroll-snap rather than page numbers (§11). If pagination stays (it must, for a real catalogue), Apple-consistent styling is **plain text in the link blue, without the filled `bg-muted` selected pill**.

**`components/storefront/search-filters.tsx` — the sidebar.**

- `Card className="sticky top-16 gap-0 py-0"` (line 150): Apple draws **no border/shadow around control groups**; its filter-equivalent surfaces are bare lists on the page field (§11). Consider dropping the `Card` chrome and letting the facets sit directly in the grid column, with the existing `FieldGroup` separators doing the work.
- `top-16` (64 px) is a reasonable sticky offset; Apple's stacking rule is **global nav 44 px + local nav 48 px = 92 px** (§6). If the storefront ever adds a product-local nav, the offset must account for both.
- `ActiveFilters` (line 210 onward) renders removable `Badge variant="secondary"` chips — this is **the single most Apple-aligned element on the page** and should be emphasised, not reduced: Apple routes selection through chip/swatch rows in the buy flow and through a centred chapter-nav plus card grid on the Store accessory pages (§11).

**`components/storefront/search-sort.tsx`.** Apple's pages carry no sort control at all (§11); a compact `Select` is therefore an inherently non-Apple element. Keep it small and secondary — a text-style trigger rather than a bordered input — so it reads like Apple's `icon-wrapper` text link hierarchy.

**`app/globals.css` — token-level alignment (only if the restyle is scoped to the storefront).**

- `--foreground: oklch(23.2% 0 none)` ≈ `#1d1d1f` in L only; Apple's exact value is `#1d1d1f` (§3). The two are visually equal; no change needed unless exactness matters.
- `--muted-foreground: oklch(54% 0 none)` ≈ `#71717a` versus Apple's `#6e6e73` (§3) — a negligible perceptual difference, again only relevant if aiming for exactness.
- `--link: oklch(52.2% 0.177 256)` ≈ `#0a63cc` versus Apple's `#0066cc` (§3).
- `--primary: oklch(56.3% 0.193 256)` ≈ `#0b6ae0` versus Apple's button `#0071e3` and hover `#0076DF` (§3).
- `--radius: 0.45rem` (7.2 px); in Tailwind v4 `rounded-xl` = `--radius * 1.4` ≈ 10 px and `rounded-2xl` = `--radius * 1.8` ≈ 13 px. Apple's only content radii on these pages are **28 px (marketing cards)**, **980 px (pills)**, **8 px** (full-width block buttons) and **4 px** (buy-flow variant rows) (§4.2, §5.1). A consistent restyle would collapse the ladder to those values rather than keep five interpolated steps. (The Store product cards are the one exception: their radius comes from the shared store stylesheet, not from these tokens.)
- Add a **reduced-motion override** if any reveal animation is introduced: Apple disables ribbon/scrim animations outright under `prefers-reduced-motion` (§9.4).

### 12.3 What *not* to do

- **Do not import SF Pro.** Apple's own font CSS is copyrighted (© 2019 Apple Inc.) and the family is licensed for app-UI use on Apple platforms, not web redistribution. `-apple-system`/`system-ui` first in the stack is the legitimate way to get the look on Apple devices; everything else falls back to the current Helvetica/Arial chain. [R16][R25]
- **Do not reproduce Apple's copy** — taglines, "Learn more / View pricing", "Get the highlights", "Keep exploring iPhone" are Apple's text. Use the *structure* (short positioning line, price line, two actions) with eguidar's own French copy and existing French CTA labels.
- **Do not strip the sidebar and pagination wholesale.** Apple's lineup has 6 products; eguidar's catalogue does not. The transferable parts are the *visual language* (borderless tiles, flat fields, restrained type) — not the absence of catalogue infrastructure. Apple itself falls back to an `index` section when a range grows (§11).
- **Do not copy the tile image crops** (`_small`/`_medium`/`_large` naming, aspect ratios) beyond the general principle of art-directing per breakpoint; that principle is free, the assets are not.

## 13. Sources that could not be used

| Source | Problem | What was done instead |
|---|---|---|
| `developer.apple.com/design/human-interface-guidelines/typography` | Served as a 17,824 B JS-only SPA shell ("This page requires JavaScript"), no embedded payload; four candidate documentation-JSON endpoints returned 404 | Replaced by the **live `@font-face` CSS Apple serves** [R16] and the **Design Resources page** [R25], both of which are primary. Four endpoint patterns were tried before giving up. |
| `web.archive.org` snapshots | Not needed — every apple.com URL served 200 directly on 12 Oct 2026 | — |
| Computed styles / rendered hover & focus states | No browser available in this environment; only static CSS could be read | Every visual claim is quoted from a CSS or HTML source; hover/focus values are the *declared* values. Where JS enhancement hides markup (buy flow), the server-rendered fallback + the CSS were read instead. |
| French price string shape | Prices are injected by JS via `data-pricing-product` templates on the pages inspected; the FR home HTML contains only the empty template | Verified on the **FR buy page**, which is server-rendered: prices appear as `979,00 €`, `879,00 €`, i.e. **comma decimals, space-grouped, trailing `€`**. [R22] |
| Apple Store's `store.apple.com` selection React bundle CSS class-to-DOM mapping | The client-rendered selector DOM was not available statically | Read the server-rendered `.selection-buttons` markup and its CSS, plus the `rf-bfe-*` class names extracted from `step1evolution.js`. [R19][R20][R21] |

## References

All URLs retrieved **12 October 2026 (UTC)**. Bundle filenames are hashed/versioned and rotate; the quoted text is what was served on that date.

| Ref | Source | URL |
|---|---|---|
| R1 | iPhone lineup page HTML (`<title>iPhone - Apple</title>`, 200) | `https://www.apple.com/iphone/` |
| R2 | Mac lineup page HTML (200) | `https://www.apple.com/mac/` |
| R3 | Global header CSS bundle (170,263 B) | `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` |
| R4 | Store homepage HTML (200) | `https://www.apple.com/store` |
| R5 | iPhone overview CSS bundle (663,379 B) — the main evidence for tiles, buttons, type, grid, colour tokens | `https://www.apple.com/v/iphone/home/ck/built/styles/overview.built.css` |
| R6 | iPhone 18 Pro overview CSS bundle (1,617,365 B) — section anatomy, section padding, local nav, dark theme, staggers | `https://www.apple.com/v/iphone-18-pro/c/built/styles/overview.built.css` |
| R7 | iPhone overview main JS bundle (456,434 B) — `StaggeredFadeIn`, scroll groups, reduced-motion/media gating | `https://www.apple.com/v/iphone/home/ck/built/scripts/overview/main.built.js` |
| R8 | French homepage CSS bundles — `typography-tile-headline/subhead` ladder | `https://www.apple.com/v/homepage/a/styles/main.built.css` and `…/homepage.built.css` and `…/tiles.built.css` |
| R9 | Accessories catalogue page HTML (200, after `/accessories/` → `/shop/accessories/all` redirect) and its CSS (`accessories-responsive.css`, `dd/merch/accessories.css`) | `https://www.apple.com/shop/accessories/all` |
| R10 | Global nav CSS (third-party-style CDN copy used by Store pages) | `https://store.storeimages.cdn-apple.com/4982/store.apple.com/static-resources/rs-globalelements-2.25.0-4bbf8/dist/ac-globalnav.css` |
| R11 | MacBook Air overview CSS (482,931 B) — per-template section padding variant | `https://www.apple.com/v/macbook-air/z/built/styles/overview.built.css` |
| R12 | iPhone overview head JS (73,760 B) — breakpoint media strings (`max-width: 734px` etc.) | `https://www.apple.com/v/iphone/home/ck/built/scripts/overview/head.built.js` |
| R13 | Local nav CSS bundle (80,984 B) — `--localnav-*` tokens | `https://www.apple.com/ac/localnav/9/styles/ac-localnav.built.css` |
| R14 | Global footer CSS bundle (63,918 B) — `.ac-gf-footer` | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` |
| R15 | iPhone 18 Pro product-page HTML (867,994 B) — section list, hero, local nav markup, `data-component-list` inventory | `https://www.apple.com/iphone-18-pro/` |
| R16 | Apple web-font CSS (`@font-face` for SF Pro Display/Text/Icons, weights 100–900, © 2019 Apple Inc.) | `https://www.apple.com/wss/fonts?families=SF+Pro,v3\|SF+Pro+Icons,v3` |
| R17 | MacBook Air product-page HTML (465,049 B) | `https://www.apple.com/macbook-air/` |
| R18 | French locale home HTML (`xml:lang="fr-FR"`, `En savoir plus` / `Acheter` buttons) | `https://www.apple.com/fr/` |
| R19 | iPhone buy-flow HTML, server-rendered fallback markup (1,767,897 B) | `https://www.apple.com/shop/buy-iphone/iphone-18-pro` |
| R20 | Buy-flow iPhone CSS (`iphone.css`, 1,035,543 B) — `.selection-buttons`, `.dimensionCapacity`, `.dimensionColor` | `https://store.storeimages.cdn-apple.com/4982/store.apple.com/shop/Catalog/global/css/dd/buy-flow/iphone.css` |
| R21 | Buy-flow step-1 evolution CSS (1,122,283 B) — `.rf-bfe-stickybar*`, `.rf-bfe-dimension*`, `.rf-bfe-header-price*` | `https://store.storeimages.cdn-apple.com/4982/store.apple.com/static-resources/rs-iphone-2.40.4-e8156/dist/step1evolution.css` |
| R22 | French buy-flow HTML — server-rendered prices `979,00 €` etc. | `https://www.apple.com/fr/shop/buy-iphone/iphone-18-pro` |
| R23 | Buy-flow step-1 evolution JS (693,408 B) — Reactised class names (`rf-bfe-product-dimension-*`, `rf-bfe-stickybar-content-withdimensionselected`) | `https://store.storeimages.cdn-apple.com/4982/store.apple.com/static-resources/rs-iphone-2.40.4-e8156/dist/step1evolution.js` |
| R24 | Buy-flow Mac HTML (608,828 B) | `https://www.apple.com/shop/buy-mac/macbook-air` |
| R25 | Apple Design Resources (first-party) — SF Pro download, UI kits, licensing context | `https://developer.apple.com/design/resources/` |
| R26 | Apple HIG Typography page (**could not be read** — JS-only shell, see §13) | `https://developer.apple.com/design/human-interface-guidelines/typography` |
| R27 | French product page HTML (761,183 B) | `https://www.apple.com/fr/iphone-18-pro/` |

Local copies of every fetched file were kept in `/tmp/opencode/apple/` (`src/*.html`, `css/*.css`, `js/*.js`) for the duration of this research; they are not part of the repository.
