# Apple homepage anatomy — research findings for the eguidar accueil

> **Research-only document.** Every factual claim below is traced to a primary source: the **live HTML served by apple.com** (`https://www.apple.com/` and its French locale `https://www.apple.com/fr/`), the **CSS and JavaScript bundles those pages link to**, and the **intrinsic dimensions of the image files those pages reference**. **Retrieval date for all sources: 13 October 2026 (UTC).** Everything quoted under "Evidence" is verbatim from a minified bundle; the only edits are line breaks inserted after `;` and `}` to make a rule readable, and no character inside a declaration was changed. Third-party blogs were **not** used as evidence. No application code, schema, or configuration in this checkout was modified.
>
> **Trademark and copyright caution.** This document describes Apple's *design language* for inspiration only. Never copy Apple assets, product photography, copy text, SF Pro font files, or pixel-identical layouts. Apple's font CSS carries `/* (C) 2019 Apple Inc. All rights reserved. */` [R19], and the SF Pro family is licensed for use in app UI on Apple platforms, not for redistribution as a web font (the licensing context is in the companion document's §12.3).
>
> **Companion document.** `docs/research/apple-product-page-ui.md` covers the product detail page. This document covers the **homepage**, which shares the palette and the type philosophy but has its own anatomy. §7 lists what differs from what that document records.

## Summary

- **The homepage is a stack of nine panels and one band, not a page of sections.** Verbatim: `<section class="section section-hero">`, `<section class="section section-promo">`, `<section class="section-endless-entertainment-gallery">`, then footnotes and footer. The hero is **three stacked full-width panels**; the promo is a **2-column grid of six tiles**; the gallery is a full-bleed media band. [R1]
- **Panels are separated by 12 px white gutters.** `.section{display:grid;grid-template-columns:1fr;gap:12px;text-align:center;margin-bottom:12px}` on a white `body`, with `.section-promo.section{grid-template-columns:1fr 1fr}` above 734 px. The promo section additionally insets itself by 12 px on each side. This is the single most recognisable homepage geometry, and it is **not** the product page's 20 px gallery gap. [R3]
- **Full-width vs 2-up is provable from the art.** The hero images are cut **3008 × 580** (a full-bleed banner that overscans the 2560 px `main` cap); the promo images are cut **1262 × 580**, i.e. exactly `(2560 − 12×2 − 12) / 2` — the width of one tile of the 2-up grid at the cap. [R11]
- **Panel height is a CSS constant, not an image ratio.** `--hero-content-height: 580px` / `--promo-content-height: 580px` at desktop, with per-breakpoint and per-viewport-height overrides, and the art re-cut to match: hero `_largetall` = 3008 × 692, `_medium` = 1068 × 570, `_mediumtall` = 1068 × 650, `_small` = 734 × 500; promo `_medium` = 516 × 490, `_small` = 734 × 500. [R3][R11]
- **Inside a panel the copy is top-centre, the art is bottom-anchored and centre-cropped, and the CTAs are a centred 2-column grid 17 px below the copy** (14 px on phones). The whole panel is one giant link (`.tile-link` overlay, `z-index:3`) with the CTAs above it (`z-index:4`). [R3]
- **There are two in-panel type ladders, not one.** Hero panels use the `typography-tile-*` classes (headline 56/48/32, subhead 28/24/19, callout 19/17/14); promo tiles override them to **headline 40/32, subhead 21/19, callout 14**. Weight is 600 for every emphatic line, never 700; tracking goes from −0.005em at 56 px to +0.011em at 21 px. [R3][R4]
- **Field alternation is one grey and one black.** Default tile fill `#f5f5f7`, `.theme-dark.tile-wrapper` fill `#000`; the page underneath is `#ffffff`, so the 12 px gutters read as white hairlines. Down the page: grey / **black** / grey ‖ grey, grey, grey, **black**, grey, grey ‖ grey band. [R3]
- **The homepage has no entrance animation at all.** `StaggeredFadeIn` — the component that defines the product page's motion — **does not appear anywhere in the homepage markup**; the only `data-component-list` values are `InlineMedia` (×2). There is **no tile hover scale and no `transition` declaration anywhere in the homepage tile sheet**; the only hover state is the button colour swap, which is instant. [R1][R3]
- **Motion is three things: two scroll-gated videos, lazy image swaps, and one timed carousel.** The hero video and the promo video both ship `preload="none"` and auto-play when their tile enters a scroll range (`{"start":"t - (100vh - 50h)","end":"b - 30h"}`), never loop, and hold their end frame. The gallery auto-advances at 4.16 s per slide with an 800 ms slide on `cubic-bezier(0.645, 0.045, 0.355, 1)` — and an interrupted slide switches to `cubic-bezier(0.23, 1, 0.32, 1)`, the same curve eguidar already stores as `--ease-out`. [R6][R8][R15]
- **Load priority is achieved by document order, not by hints.** The first panel's poster and fallback picture are in the initial HTML with real `srcset`s and **no** lazy marker; every other panel image is a 1 × 1 GIF placeholder plus a `<noscript>` real `<picture>`, swapped in when the tile crosses `t - 200vh`. There is **no `<link rel="preload">`, no `fetchpriority` and no `importance` attribute anywhere in the page**. [R1][R5]
- **The homepage art-directs on viewport height as well as width.** The breakpoint ladder is 734 / 1068 / 1441 px *plus* `min-height: 734px` and `min-height: 776px` qualifiers (`largetall`, `mediumtall`), and the sheets are full of them: `homepage-main.built.css` alone carries 11 blocks of `@media(min-width:1069px)and (min-height:776px)`. Under 734 px everything is one column, 500 px tall, 32/19/14 type. [R2][R3][R9]
- **The French homepage is a different, older template.** It adds a financing ribbon above the hero and an energy-rating list after the footnotes, loads a shared `tiles.built.css` that still contains the `margin-left:338px` copy-offset layout the product-page document recorded, and has no video tiles. The US homepage no longer has that rule. [R12][R13][R14]
- **eguidar's accueil is already shaped like the homepage** — full-bleed hero panel, 2-up category grid, a dark first tile, a `clamp()`-free 32/48/56 headline ladder and a chevron text link. §8 lists what to change (square corners, 12 px gutters, the two-ladder type mapping, and where a spring is *not* the answer).

## 0. Method and limits

Everything below comes from static inspection: I fetched the two homepage HTML documents, extracted every `<link rel="stylesheet">` and `<script src>`, downloaded those bundles, parsed the CSS with a small media-aware parser (so each quoted rule carries its `@media` context), and measured the intrinsic size of a sample of the referenced JPEGs by reading their SOF markers. Quotes are from the bundles as served on **13 October 2026**. [R1]–[R19]

What this method **cannot** see, and which is therefore absent or flagged:

- **Computed styles after JavaScript enhancement.** The `InlineMedia` component, the `LazyImage` swap and the gallery are all client-rendered; I read the server-rendered markup plus the JS that transforms it.
- **Rendered hover, focus and scroll behaviour.** No browser was available; every interaction value below is a *declared* value.
- **The nav theme switch.** The body is server-rendered `globalheader-light globalnav-scrim`, and the sheets contain full dark variants (`.globalheader-dark`, `#globalnav.globalnav-dark`), but no script among the bundles the homepage loads toggles that class — searched for `globalheader`, `globalnav-scrim`, `theme` and `dark` in `globalheader.umd.js`, `main.built.js`, `homepage.built.js`, `inline-media.built.js` and `head.built.js`. Either the switch happens in a bundle this page does not load, or the homepage is always light. Flagged, not claimed.
- **The video files themselves.** I read the `<video>` attributes, the JS that drives them, and the poster frames' dimensions — not the MP4s.
- **Content rotation.** The homepage tile set changes with launches; the panel *anatomy* below is the durable part, the tile list is the 13 October 2026 one.

### Sources inspected

| Page | URL | Served |
|---|---|---|
| US homepage [R1] | `https://www.apple.com/` | 200, 257,835 B, `<title>Apple</title>` |
| FR homepage [R12] | `https://www.apple.com/fr/` | 200, 226,586 B, `<title>Apple (France)</title>` |

| Bundle | URL | Size |
|---|---|---|
| Homepage main CSS [R2] | `https://www.apple.com/v/homepage/a/styles/main.built.css` | 127,847 B |
| Homepage tiles CSS [R3] | `https://www.apple.com/v/homepage/a/styles/homepage.built.css` | 32,769 B |
| Homepage inline-media CSS [R4] | `https://www.apple.com/v/homepage/a/styles/inline-media.built.css` | 12,609 B |
| Per-page override CSS [R10] | `https://www.apple.com/homepage/styles/index_1padhrru.built.css` | 3,057 B |
| Gallery CSS [R8] | `https://www.apple.com/autopush/us/fam-gallery/styles/home-gallery.built.css` | 175,999 B |
| Global header CSS [R16] | `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` | 170,263 B |
| Global footer CSS [R17] | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` | 56,408 B |
| Homepage main JS [R5] | `https://www.apple.com/v/homepage/a/scripts/main.built.js` | 90,784 B |
| Homepage inline-media JS [R6] | `https://www.apple.com/v/homepage/a/scripts/inline-media.built.js` | 8,938 B |
| Homepage page JS [R7] | `https://www.apple.com/v/homepage/a/scripts/homepage.built.js` | 2,280 B |
| Viewport/breakpoint JS [R9] | `https://www.apple.com/v/homepage/a/scripts/HpViewport-DHyTaS-L.built.js` | 983 B |
| Gallery JS [R15] | `https://www.apple.com/autopush/us/fam-gallery/scripts/endless-entertainment-gallery.built.js` | 157,299 B |
| FR shared tiles CSS [R13] | `https://www.apple.com/v/homepage/a/styles/tiles.built.css` | 57,161 B |
| FR ribbon CSS [R14] | `https://www.apple.com/fr/homepage/includes/ribbons/finance-ribbon/style.css` | 10,176 B |

Local copies were kept in `/tmp/opencode/apple-home/` for the duration of this research; they are not part of the repository.

## 1. The panel stack

### 1.1 Page skeleton, verbatim

The US homepage body is exactly this, in order (attribute noise trimmed): [R1]

```html
<body class="ac-nav-overlap globalheader-light globalnav-scrim">
  <main>
    <section class="section section-hero" data-analytics-region="hero">        <!-- 3 tiles -->
    <section class="section section-promo" data-analytics-region="promo">      <!-- 6 tiles -->
    <section class="section-endless-entertainment-gallery" …>                  <!-- 1 band -->
    <section class="ac-gf-sosumi" aria-label="Footnotes">
    <section class="ac-gf-footer">
```

The nine tiles, in order, with their width class and fill:

| # | Section | `data-tile-id` | Width | Fill | Copy block |
|---|---|---|---|---|---|
| 1 | hero | `apple-homeview` | full-bleed + video | `#f5f5f7` | logo image + subhead + callout |
| 2 | hero | `iphone-18-pro` | full-bleed | `#000` (`theme-dark`) | headline + subhead |
| 3 | hero | `iphone-duo` | full-bleed | `#f5f5f7` | headline + subhead + callout |
| 4 | promo | `apple-tv-4k` | 2-up | `#f5f5f7` | logo + subhead + callout |
| 5 | promo | `homepod-mini-2` | 2-up | `#f5f5f7` | headline + subhead + callout |
| 6 | promo | `apple-home-collection` | 2-up | `#f5f5f7` | logo + subhead + callout |
| 7 | promo | `apple-watch-series-12` | 2-up | `#000` (`theme-dark`) | logo (top) + copy/CTA (bottom, split) |
| 8 | promo | `apple-upgrade` | 2-up + video | `#f5f5f7` | logo + subhead |
| 9 | promo | `apple-card` | 2-up | `#f5f5f7` | logo + subhead |
| — | gallery | — | full-bleed band | `#f5f5f7` | centred headline + carousel |

### 1.2 The grid and the gutters

Verbatim, all from the homepage tile sheet: [R3]

```css
.section{display:grid;grid-template-columns:1fr;gap:12px;text-align:center;margin-bottom:12px}
.section-promo{box-sizing:border-box;padding-left:max(12px,env(safe-area-inset-left) - 12px);padding-right:max(12px,env(safe-area-inset-right) - 12px)}
.section-promo.section{grid-template-columns:1fr 1fr}
@media(max-width:734px){.section-promo.section{grid-template-columns:1fr}}
```

and the page frame:

```css
main,html.ac-ls-visible.ac-ls-fixed .ac-nav-overlap main,html.globalmessage-segment-visible.ac-ls-visible.ac-ls-fixed .ac-nav-overlap main{max-width:2560px;padding-top:var(--globalnav-collective-height);margin-inline:auto}
body{background-color:var(--sk-body-background-color, rgb(255, 255, 255));color:var(--sk-body-text-color, rgb(29, 29, 31))}
```

Three facts follow, and they are the ones to hold on to:

1. **The hero section is a 1-column grid, so its three panels are stacked full-width.** There is no `.section-hero.section{grid-template-columns:1fr 1fr}` anywhere in the served CSS — I searched every bundle for `grid-template-columns` and the only two-column rule on the page is the promo's. [R3][R4]
2. **The promo section is a 2-column grid, so its six tiles form three 2-up rows.** At ≤734 px it collapses to one column.
3. **Gaps are 12 px, both between rows (`gap`) and after the section (`margin-bottom`), and the promo is inset 12 px left and right** (removed at ≤734). The 2560 px `main` cap means the "full-bleed" hero is full-bleed up to 2560 px, not to an unlimited viewport.

### 1.3 Full-width vs 2-up: proof from the art

The CSS already says it, but the artwork confirms it independently. Every panel image is cut to the panel's *rendered* box at each breakpoint:

| File | Intrinsic size | What it proves |
|---|---|---|
| `hero_iphone_18_pro__fqe1motd0ymy_large.jpg` | **3008 × 580** | hero panel: full-bleed width (overscans the 2560 px cap), 580 px tall |
| `hero_iphone_18_pro__…_large_2x.jpg` | 6016 × 1160 | exactly 2× — a retina cut of the same box |
| `hero_iphone_18_pro__…_largetall.jpg` | 3008 × 692 | the tall-viewport hero variant |
| `hero_iphone_18_pro__…_medium.jpg` | 1068 × 570 | ≤1068 px: viewport-width art, 570 px tall |
| `hero_iphone_18_pro__…_mediumtall.jpg` | 1068 × 650 | 735–1068 px *and* min-height 734 px |
| `hero_iphone_18_pro__…_small.jpg` | 734 × 500 | ≤734 px: 500 px tall |
| `promo_homepod_mini_2_preorder__…_large.jpg` | **1262 × 580** | promo tile: `(2560 − 24 − 12) / 2 = 1262` px wide, 580 px tall |
| `promo_homepod_mini_2_preorder__…_large_2x.jpg` | 2524 × 1160 | 2× of the same box |
| `promo_homepod_mini_2_preorder__…_medium.jpg` | **516 × 490** | `(1068 − 24 − 12) / 2 = 516` px wide, 490 px tall |
| `promo_homepod_mini_2_preorder__…_small.jpg` | 734 × 500 | at ≤734 the promo is one column: viewport-width, 500 px tall |

The arithmetic on the promo tile is exact, which is a good check on the 12 px side padding and 12 px gap: **`(2560 − 2×12 − 12) / 2 = 1262`** and **`(1068 − 2×12 − 12) / 2 = 516`**. [R11]

### 1.4 Panel heights

Verbatim: [R3]

```css
:root{--hero-content-height: 580px;--promo-content-height: 580px}
@media(max-width:1068px){:root{--hero-content-height: 570px;--promo-content-height: 490px}}
@media(max-width:734px){:root{--hero-content-height: 500px;--promo-content-height: 500px}}
@media(min-width:1069px)and (min-height:776px){:root{--hero-content-height: 692px}}
@media(min-width:735px)and (max-width:1068px)and (min-height:734px){:root{--hero-content-height: 650px}}
.tile-wrapper{…min-height:var(--hero-content-height);…}
.section-promo .tile-wrapper{min-height:var(--promo-content-height)}
```

| | ≥1069 px | 735–1068 px | ≤734 px |
|---|---|---|---|
| hero panel | 580 (692 if viewport ≥776 tall) | 570 (650 if ≥734 tall) | 500 |
| promo tile | 580 | 490 | 500 |
| tile padding (top/bottom) | 48 / 56, or 53 / 60 in promo | 54 / 61, or 44 / 48 in promo | 39 / 43 |
| tile padding, tall viewports | 56 / 63 (hero), 61 / 69 (735–1068) | — | — |

The one exception is the hero's first tile, which is an `InlineMedia`: once JS has enhanced it, its height becomes viewport-driven: [R4]

```css
.enhanced .section-hero [data-component-list~=InlineMedia][data-enhanced]{--hero-content-height: max(min(80vh - var(--globalnav-collective-height), 1050px), 750px)}
@media(max-width:1068px){…{--hero-content-height: max(min(80vh - var(--globalnav-collective-height), 830px), 650px)}}
@media(max-width:734px){…{--hero-content-height: max(min(80vh - var(--globalnav-collective-height), 600px), 550px)}}
```

i.e. **the video hero is 750–1050 px tall on desktop**, clamped between two bounds, and the poster frame is still cut to the standard 580 px box. [R4][R11]

### 1.5 Inside a panel: copy, art, CTAs

Verbatim: [R3]

```css
.tile-wrapper{display:flex;justify-content:center;position:relative;width:100%;min-height:var(--hero-content-height);box-sizing:border-box;background-color:#f5f5f7;overflow:clip;padding:48px 0 56px}
.tile-content{display:flex;flex-direction:column;position:relative;align-items:center}
.tile-content-split{justify-content:space-between}
.tile-copy-wrapper{position:relative;pointer-events:none;z-index:2}
.tile-link{position:absolute;top:0;inset-inline-start:0;width:100%;height:100%;z-index:3;text-decoration:none}
.tile-image-wrapper{position:absolute;bottom:0;width:100%;height:var(--hero-content-height)}
.tile-image-wrapper img{inset-inline-start:50%;transform:translate(-50%)}
.tile-image-wrapper img{position:absolute;bottom:0;width:auto;height:100%}
.tile-ctas{display:grid;justify-content:center;column-gap:17px;margin-top:17px;z-index:3}
.tile-ctas:has(:nth-child(2)){grid-template-columns:min-content min-content}
.button{z-index:4}
```

Read together:

- `.tile-wrapper` is `display:flex` (row) with default `align-items:stretch`, so `.tile-content` stretches to the panel's inner height. As a column with no `justify-content`, it packs its children **at the top**: the copy block sits at the top of the panel, horizontally centred.
- The art is **taken out of flow** (`position:absolute;bottom:0`) and sized by height (`height:100%;width:auto`), then centred horizontally with `inset-inline-start:50%;transform:translate(-50%)` and clipped by `overflow:clip` on the wrapper. It is a bottom-anchored, centre-cropped backdrop.
- `.tile-content-split` is the variant used by the Apple Watch tile: logo at the top, copy + CTAs pushed to the bottom (`justify-content:space-between` on the stretched column).
- **CTAs sit under the copy**: a centred grid, `margin-top:17px` (16 px ≤1068, 11 px ≤734), `column-gap:17px` (14 px ≤734; in promo `column-gap:14px` and `margin-top:12px` above 735 px). One CTA → one centred column; two → `min-content min-content`.
- **The whole panel is a link.** `.tile-link` is an absolutely-positioned, full-size `<a>` at `z-index:3`; the real CTA buttons are `z-index:4`. The overlay link carries `aria-hidden="true" tabindex="-1"`, so the keyboard only reaches the named CTAs.

### 1.6 A panel's markup, verbatim

Abridged from the iPhone 18 Pro hero tile (long `alt` shortened, whitespace inserted): [R1]

```html
<div class="tile-wrapper theme-dark" data-tile-id="iphone-18-pro" …>
  <a class="tile-link" href="/iphone-18-pro/" aria-hidden="true" tabindex="-1"></a>
  <div class="tile-content">
    <div class="tile-copy-wrapper">
      <h2 class="tile-headline typography-tile-headline">iPhone 18 Pro</h2>
      <p class="tile-subhead typography-tile-subhead">Pro further.</p>
    </div>
    <div class="tile-ctas">
      <a class="button" href="/iphone-18-pro/" aria-label="Learn more, iPhone 18 Pro">Learn more</a>
      <a class="button button-secondary" href="/us/shop/goto/buy_iphone/iphone_18_pro" aria-label="Buy, iPhone 18 Pro">Buy</a>
    </div>
  </div>
  <div class="tile-image-wrapper">
    <picture class="static" data-anim-lazy-image>
      <source data-empty srcset="data:image/gif;base64,R0lGODlhAQABAHAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" media="(min-width:0px)" />
      <img src="/v/homepage/images/iphone-18-pro/a/hero_iphone_18_pro__fqe1motd0ymy_large.jpg" alt="iPhone 18 Pro, burgundy color …" />
    </picture>
    <noscript><picture class="static">… five <source> cuts …</picture></noscript>
  </div>
</div>
```

Two details worth copying:

- **Logo tiles hide the wordmark from the accessibility tree, not from the layout.** The `h2.tile-headline.logo-image` contains a `<picture>` plus `<span class="visuallyhidden">Apple HomeView</span>`, and `.tile-headline:has(.visuallyhidden:only-child){height:49px}` (41 px ≤1068) reserves the logo's height so the copy block does not jump between tiles with and without a wordmark. [R3]
- **The copy block is `pointer-events:none`** (`.tile-copy-wrapper`) so the underlying `.tile-link` overlay stays clickable while the CTAs above it take their own clicks.

## 2. The in-panel type ladder

### 2.1 Two ladders, one page

The hero panels carry `typography-tile-headline` / `typography-tile-subhead` / `typography-tile-callout` (defined in the shared sheet); the promo tiles carry the same classes but the `.section-promo` scope **overrides every size**. So the homepage has a "large panel" ladder and a "small tile" ladder. Verbatim: [R2][R3]

```css
/* shared (used by hero panels) */
.typography-tile-headline{font-size:56px;line-height:1.0714285714;font-weight:600;letter-spacing:-.005em;font-family:SF Pro Display,…}
@media(max-width:1068px){.typography-tile-headline{font-size:48px;line-height:1.0834933333;font-weight:600;letter-spacing:-.002em;…}}
@media(max-width:734px){.typography-tile-headline{font-size:32px;line-height:1.125;font-weight:600;letter-spacing:.002em;…}}
.typography-tile-subhead{font-size:28px;line-height:1.1428571429;font-weight:400;letter-spacing:.007em;…}
@media(max-width:1068px){.typography-tile-subhead{font-size:24px;line-height:1.1666666667;font-weight:400;letter-spacing:.009em;…}}
@media(max-width:734px){.typography-tile-subhead{font-size:19px;line-height:1.2105263158;font-weight:400;letter-spacing:.012em;…}}
.typography-tile-callout{font-size:19px;line-height:1.2105263158;font-weight:400;letter-spacing:.012em;…}
@media(max-width:1068px){.typography-tile-callout{font-size:17px;line-height:1.2353641176;font-weight:400;letter-spacing:-.022em;…}}
@media(max-width:734px){.typography-tile-callout{font-size:14px;line-height:1.2857742857;font-weight:400;letter-spacing:-.016em;…}}

/* promo scope overrides */
.section-promo .tile-headline{font-size:40px;line-height:1.1;font-weight:600;letter-spacing:0em;…}
@media(max-width:1068px){.section-promo .tile-headline{font-size:32px;line-height:1.125;font-weight:600;letter-spacing:.002em;…}}
.section-promo .tile-subhead{font-size:21px;line-height:1.1904761905;font-weight:400;letter-spacing:.011em;…}
@media(max-width:1068px){.section-promo .tile-subhead{font-size:19px;line-height:1.2105263158;font-weight:400;letter-spacing:.012em;…}}
.section-promo .tile-callout{font-size:14px;line-height:1.2857742857;font-weight:400;letter-spacing:-.016em;…}
```

### 2.2 The ladder as a table

| Line | Hero panels ≥1069 | 735–1068 | ≤734 | Promo tiles ≥1069 | 735–1068 | ≤734 |
|---|---|---|---|---|---|---|
| Headline (`h2`) | 56 / 1.0714 / 600 / −0.005em | 48 / 1.0835 / 600 / −0.002em | 32 / 1.125 / 600 / +0.002em | **40 / 1.1 / 600 / 0em** | **32 / 1.125 / 600 / +0.002em** | 32 / 1.125 / 600 / +0.002em |
| Subhead | 28 / 1.1429 / 400 / +0.007em | 24 / 1.1667 / 400 / +0.009em | 19 / 1.2105 / 400 / +0.012em | **21 / 1.1905 / 400 / +0.011em** | **19 / 1.2105 / 400 / +0.012em** | 19 / 1.2105 / 400 / +0.012em |
| Callout | 19 / 1.2105 / 400 / +0.012em | 17 / 1.2354 / 400 / −0.022em | 14 / 1.2858 / 400 / −0.016em | **14 / 1.2858 / 400 / −0.016em** | 14 / 1.2858 / 400 / −0.016em | 14 / 1.2858 / 400 / −0.016em |
| CTA button | 17 / 1.1765 / 400 / −0.022em, padding 22 × 12 | 17 px | 14 / 1.2858 / 400 / −0.016em | 14 / 1.2858 / 400 / −0.016em | 14 px | 14 px |

Callout colour is the only place the panel fill changes the text token: `.tile-callout{color:#6e6e73}` on grey, `.theme-dark .tile-callout{color:#86868b}` on black; body copy on black is `#f5f5f7` (`.theme-dark .tile-copy-wrapper`). [R3]

Three principles carried over verbatim from the product page, now confirmed on the homepage:

1. **600 is the heaviest weight used for headlines.** Every headline, subhead, callout and CTA style above is `font-weight:600` or `400`. The only `font-weight:500` declarations in the homepage sheets are the "Apple Intelligence" annotation styles (`.typography-apple-intelligence` 21/14 px, `.section-promo .tile-apple-intelligence` 14 px), and `font-weight:700` appears exactly once, on the gallery's genre label (`.media-gallery-genre`). [R2][R3][R8]
2. **Tracking is hand-tuned per size, and flips sign.** Negative at display sizes (−0.005em at 56 px), positive at 19–40 px (+0.002em … +0.012em), negative again at body/callout sizes (−0.016em, −0.022em). This is *not* a fluid scale. [R2][R3]
3. **No `clamp()` anywhere.** The five homepage sheets contain **zero** `clamp()` declarations — not for type, not for layout (searched all of them; unlike the product page, whose hero uses `clamp()` for height). [R2][R3][R4][R8][R10]

One base-size detail that explains the `rem`-free design: `html{font-size:106.25%}` — i.e. **the root font size is 17 px**, Apple's body size, so any `rem` in the sheets is 17-based. [R2]

### 2.3 Buttons

Verbatim from the homepage sheet: [R3]

```css
.button{--sk-button-border-radius:980px;--sk-button-padding-horizontal:16px;--sk-button-padding-vertical:9px;font-size:14px;line-height:1.2857742857;font-weight:400;letter-spacing:-.016em;…}
.button{--sk-button-background: rgb(0, 113, 227);--sk-button-background-hover:#0076DF;--sk-button-background-active:#006EDB}
.button-secondary{--sk-button-background:transparent;--sk-button-background-hover:#0076DF;--sk-button-background-active:#006EDB;--sk-button-color:rgb(0, 102, 204);--sk-button-color-hover:rgb(255, 255, 255);--sk-button-border-color:rgb(0, 102, 204)}
.button:hover{background:var(--sk-button-background-hover, var(--sk-button-background));color:var(--sk-button-color-hover, var(--sk-button-color));text-decoration:none;border-color:transparent}
.button:focus-visible{outline:2px solid var(--sk-focus-color, #0071e3);outline-offset:var(--sk-focus-offset-container, 3px)}
@media(min-width:735px){.section-hero .button{--sk-button-padding-horizontal: 22px;--sk-button-padding-vertical: 12px;--sk-button-min-width-basis: 70px;font-size:17px;line-height:1.1764805882;…}}
```

So: **a 980 px pill**, 14 px text by default, **17 px in hero panels above 735 px**, blue fill `#0071e3` → hover `#0076DF` (brighten, not darken), secondary = transparent with a `#0066cc` border and text that fills blue on hover. There is **no transition on the hover colour** — the state change is immediate. The focus ring is the same 2 px `#0071e3` at 3 px offset as the product page.

### 2.4 How it differs from the product-page ladder

| Role | Product page (`apple-product-page-ui.md` §2.2) | Homepage hero panel | Homepage promo tile |
|---|---|---|---|
| Page/hero title | `typography-headline-super` 80/64/48 | — (logo art, or 56/48/32) | — |
| Section header | `typography-section-header-headline` 56/48/28 | — | — |
| Panel headline | `typography-product-tile-headline` 28/24/21 | **56/48/32** | **40/32** |
| Positioning line | `typography-product-tile-positioning` 17/14/14 | 28/24/19 | 21/19 |
| Price / subheading | `typography-product-tile-subheading` 17/14/14 | 19/17/14 (callout) | 14 |
| CTA | 17/14 (`typography-product-tile-ctas`) | 17/14 | 14 |

In one line: **the homepage ladder is one to two steps larger than the product page's tile ladder, and it is split in two by panel width**; the product page's `section-header-headline` has no homepage equivalent because the homepage has no section headers between panels — only one centred headline, above the gallery band.

## 3. Field alternation

The page background is `#ffffff`; every panel paints itself. Verbatim: [R3]

```css
.tile-wrapper{…background-color:#f5f5f7;…}
.theme-dark.tile-wrapper{background-color:#000}
```

The rhythm down the page (9 panels + 1 band):

```
hero     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   grey      (#f5f5f7)
         ░░░░ 12 px white gutter ░░░░
hero     ████████████████████████   black     (#000)
         ░░░░ 12 px white gutter ░░░░
hero     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   grey
         ░░░░ 12 px white gutter ░░░░
promo    ▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓   grey │ grey      (12 px side padding, 12 px gap)
         ░░░░ 12 px white gutter ░░░░
promo    ▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓   grey │ grey
         ░░░░ 12 px white gutter ░░░░
promo    ▓▓▓▓▓▓▓▓▓│██████████████   grey │ black
         ░░░░ 12 px white gutter ░░░░
promo    ▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓   grey │ grey
         ░░░░ 12 px white gutter ░░░░
band     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   grey      (gallery, no side padding)
```

Three observations:

1. **Black is a spice, not a theme.** Two of nine panels are `#000`: the second hero panel and the fourth promo tile (second row, right). Everything else is the single light grey. No panel has a gradient, a shadow or a border. (The one shadowed, rounded thing on the page is a piece of *art* inside the gallery — `.fam-media-gallery .media-gallery-bg.media-gallery-bg-music{border-radius:8px;box-shadow:3px 5px 30px rgba(0,0,0,.22)}` — the Apple Music card, which is a product screenshot, not a container.) [R1][R3][R8]
2. **The white gutter is the only page-level ornament.** The 12 px of `body` background showing between panels is what makes a wall of panels read as separate objects without a single border. [R3]
3. **The gallery band is not a panel.** It has no `.section` class, so it does not get the grid, the gap or the `margin-bottom`; it paints its own `#f5f5f7` and adds its own top padding: `.endless-entertainment{background-color:#f5f5f7;padding-top:53px}` (36 px ≤1068). Inside it the cards are dark (`.media-gallery-item.theme-dark`), on art with a black `radial-gradient` scrim for legibility. [R8][R10]

## 4. Motion

### 4.1 What the markup declares — and what it does not

Searching the served homepage for animation hooks returns exactly this: [R1]

| Hook | Count | Meaning |
|---|---|---|
| `data-component-list="InlineMedia"` | 2 | the two scroll-gated videos |
| `data-anim-lazy-image` | 14 | lazy panel images (implicit component, no attribute needed) |
| `data-lazy` | 36 | gallery backgrounds and logos (gallery module) |
| `data-anim-keyframe`, `data-anim-scroll-group`, `data-staggered-item` | 0 | — |

**`StaggeredFadeIn` is not on the homepage.** The product-page document's §9.2 (items fade 0→1 over 0.9 s and rise 30 px over 0.7 s, staggered 0.15 s, triggered at `t − 85vh`, on `easeInOutQuad`) describes a component that the homepage does not use at all. **Panels appear immediately; nothing fades in.** [R1][R3]

Equally: **there is no `transition` declaration anywhere in `homepage.built.css`** (`grep -o 'transition[^;}]*'` returns nothing), no `transform` on `.tile-image-wrapper`, and no `:hover` rule on a tile other than `.tile-link:hover{text-decoration:none}`. The product page's tile hover (`scale(1.0161)` over `0.3s cubic-bezier(0,0,0.5,1)`) has **no homepage counterpart**. [R3]

### 4.2 The two videos (InlineMedia)

Verbatim markup: [R1]

```html
<video id="apple-homeview" muted preload="none" playsinline
       data-inline-media-basepath="/105/media/us/homepage/2026/5f2d3dbd-…/anim/hero/"
       data-inline-media-ipad-retina="true"
       data-inline-media-play-kf='{"start":"t - (100vh - 50h)","end":"b - 30h"}' aria-hidden="true"></video>
<video id="apple-upgrade" muted preload="none" playsinline
       data-inline-media-basepath="/105/media/us/homepage/2026/abb2ec52-…/anim/promo/"
       data-inline-media-play-kf='{"start":"t - (100vh - 50h)","end":"b"}' aria-hidden="true"></video>
```

and the driver, verbatim from `inline-media.built.js`: [R6]

```js
const e=this.videoElement.dataset.inlineMediaLoadKf,
      t=e?JSON.parse(e):{start:"t - 200vh",end:"b + 100vh"};
Object.assign(t,{event:"Load Inline Media",onEnterOnce:()=>{this.setupVideoEvents(),this.videoElement?.load()}})

const e=this.videoElement.dataset.inlineMediaPlayKf,
      t=e?JSON.parse(e):{start:"t - (100vh - prop(offsetHeight) * 0.3)",end:"b"};
Object.assign(t,{event:"Play Inline Media",
  onEnter:()=>{… this.videoElement.readyState>=HTMLMediaElement.HAVE_FUTURE_DATA?e():…, …play()…},
  onExit:()=>{this.inPlayRange=!1,… this.videoElement.loop && … && this.videoElement.pause()}})

this.PLAY_TIMEOUT=4e3   // if playback has not started 4 s after entering range, the component destroys itself
```

Behaviour, as evidenced:

- **Download is gated**: the video file is only `load()`ed when the tile comes within 200 vh of the viewport (the default `Load Inline Media` range), and `preload="none"` means nothing is fetched before that.
- **Playback is scroll-gated**: the hero video starts once **half the tile's height has entered the viewport** (`start: "t - (100vh - 50h)"` puts the tile's top half a tile below the viewport top), and it leaves its range when the tile has scrolled up so that only its bottom 30 % is still visible at the top of the viewport (`end: "b - 30h"`). The promo video's range ends at its bottom (`end: "b"`), i.e. when the tile has fully passed the top edge.
- **Neither video loops.** `onExit` only pauses when `loop` is set; these play once, and when finished the component restores the end frame (`restoreEndFrame` sets `currentTime = duration`) rather than rewinding. A user pause (`isUserPaused`) is remembered and survives scroll; returning to the tab (`visibilitychange`, `pageshow`) resumes only what should resume.
- **There is a visible control**: `.play-pause-button`, 36 × 36, `border-radius:50%`, top-right at 16 px, `opacity:0` until loaded, `transition:opacity .1s linear,transform .2s ease`, background `#d2d2d7a3` (`#424245b8` on dark), whose icon swaps play/pause/replay and whose `aria-label` is swapped from `data-aria-play|pause|replay`.
- **A spinner covers the gap**: while loading, the button shows a masked SVG with `animation:inline-media-spin .85s steps(8,end) infinite` — an 8-step, 0.85 s tick, not a smooth rotation.
- **No-JS parity**: `html.no-js [data-component-list~=InlineMedia] .inline-media-wrapper,html.no-enhanced … {display:none}` and the sibling `picture.static` is shown instead; `[data-component-list~=InlineMedia] .inline-media-wrapper+.static{display:none}` when enhanced. [R4]

### 4.3 The entertainment gallery

The band is a "TV + services" carousel: one 9-slide TV gallery (`.tv-media-gallery`, one 1250 × 668 card), one 9-card services gallery (`.fam-media-gallery`, which keeps **three cards visible at once** — `data-gallery-wrap-by="3"` in the markup, `slideAmount` and `wrapSlideItems()` in the JS), one **shared** 9-dot timed dotnav (`.dotnav-timed`) whose clicks stop both galleries, and one play/pause icon control that plays or pauses all of them (`_playAllGalleries` / `_pauseAllGalleries`). Verbatim from the gallery module: [R1][R15]

```js
this.autoPlay={paused:this.model.PrefersReducedMotion||this.model.AutoPlay.startPaused, …}
_getDurationFromItem(e){const t=parseFloat(e.el.getAttribute("data-ac-gallery-item-duration"));return"number"==typeof t&&t>0?t:this.autoPlay.duration}
// AutoPlay default: {useGlobalDuration:!0,startPaused:!1,duration:4,…}
let s="cubic-bezier(0.645, 0.045, 0.355, 1)";
this.clip&&this.clip._isPlaying&&(this.clip.destroy(),s="cubic-bezier(0.23, 1, 0.32, 1)");
const h=this.model.PrefersReducedMotion?.001:this.duration;
playGallery(){this.isUserAction||this.galleryInstance.model.PrefersReducedMotion||!this.inView||document.hidden||…}
```

and from the CSS: [R8]

```css
:root{--media-gallery-tile-gap: 13px;--media-gallery-tile-width: 930px;--media-gallery-tile-height: 523px;--media-gallery-slide-duration: 800ms;--media-gallery-bottom-copy-duration: 600ms;--media-gallery-dotnav-gap: 12px}
@media(min-width: 1441px){:root{--media-gallery-tile-width: 1250px;--media-gallery-tile-height: 668px}}
@media(max-width: 1068px){:root{--media-gallery-tile-width: 688px;--media-gallery-tile-height: 367px}}
@media(max-width: 734px){:root{--media-gallery-tile-width: 275px;--media-gallery-tile-height: 496px}}
```

| Behaviour | Value | Source |
|---|---|---|
| Slide duration | 800 ms (`--media-gallery-slide-duration`) | [R8] |
| Slide easing | `cubic-bezier(0.645, 0.045, 0.355, 1)` | [R15] |
| Slide easing, interrupted | `cubic-bezier(0.23, 1, 0.32, 1)` | [R15] |
| Slide duration under reduced motion | **0.001 s** | [R15] |
| Auto-advance interval | per item `data-ac-gallery-item-duration="4.16"` (s); 4 s fallback | [R1][R15] |
| Copy cross-fade | 600 ms (`--media-gallery-bottom-copy-duration`) | [R8] |
| Dotnav dot shrink/expand | 250 ms `ease-in`; track 32 px | [R8] |
| Scrim bar | 56 px tall, `saturate(180%) blur(20px)` backdrop, `rgba(210,210,215,.64)` light / `rgba(66,66,69,.72)` dark | [R8] |
| Pauses | on user key/click (`AUTO_PLAY_ACTION_STOP`), on hidden tab, on window blur, out of view | [R15] |

Notably, the gallery is **the one place the homepage uses an `IntersectionObserver`** (for in-view gating) — the panel stack uses Apple's own scroll-keyframe engine instead. [R5][R15]

### 4.4 Hover and press

| Element | Behaviour | Source |
|---|---|---|
| Panel image | **nothing** — no scale, no shadow, no transition | [R3] |
| Panel (`.tile-link`) | `text-decoration:none` on hover (the whole panel is a link with no visible hover state) | [R3] |
| Primary button | fill `#0071e3` → `#0076DF`, instant, border goes transparent | [R3] |
| Secondary button | text/border `#0066cc` → white text on `#0076DF`, instant | [R3] |
| Focus | `outline:2px solid #0071e3; outline-offset:3px` (container offset) | [R3] |
| Play/pause button | opacity 0→1 `.1s linear`; background lightens on hover | [R4] |
| Gallery dots | colour lightens on hover, but only under `@media(hover: hover)` | [R8] |

**The homepage's hover language is "the button changes colour; nothing else moves."** This is a meaningful contrast with the product page, where the tile image zooms on hover — and with most e-commerce homepages, which lift cards.

### 4.5 Reduced motion and text zoom

- **No `prefers-reduced-motion` blocks exist in any of the five CSS sheets the US homepage loads** (zero matches). The only such block in any bundle fetched is in the FR/shared `tiles.built.css`, and it disables the four ribbon animations (`@media(prefers-reduced-motion){.ribbon-drop-wrapper{animation:none}}` etc.). [R3][R4][R8][R13]
- Reduced motion is handled in JS instead: the gallery's autoplay starts **paused** (`paused: PrefersReducedMotion || startPaused`) and its slide duration collapses to 0.001 s; the InlineMedia component has no reduced-motion branch at all, so **the two videos still play under reduced motion** (they are muted, non-looping, and user-pausable — Apple treats that as acceptable here, unlike the product page where the ribbon and scrim animations are disabled outright).
- Two further states the homepage declares: `@media(inverted-colors){.no-inversion{filter:invert(1)}}` (an opt-out class for art that must not be inverted by the OS accessibility setting) and, in the gallery, `@media(hover: hover)` around the dot hover colour so touch devices do not get sticky hover states. [R2][R8]
- **Text zoom is a first-class state.** A hidden span is measured with a `ResizeObserver`; if the computed font-size grows, `html.text-zoom` is added and a `resize:text-zoom` event fires: [R5]

```js
this.currentSize=parseFloat(window.getComputedStyle(this.span)["font-size"]),
this.originalSize<this.currentSize?document.documentElement.classList.add("text-zoom"):document.documentElement.classList.remove("text-zoom"),
window.dispatchEvent(new CustomEvent("resize:text-zoom",{detail:this}))
```

```css
html.text-zoom .tile-wrapper{min-height:calc(var(--hero-content-height) + 250px)}
html.text-zoom .section-promo .tile-headline,html.text-zoom .section-hero .tile-headline,html.text-zoom .section-hero .tile-subhead{max-width:unset}
```

i.e. when the user has enlarged text, **the panels grow 250 px taller and the copy stops being width-clamped** — the layout yields to the type instead of clipping it.

## 5. Load behaviour

| Aspect | What the homepage does | Evidence |
|---|---|---|
| First panel image | **not lazy**: the `start-frame` poster and the `static` fallback both ship real `srcset`s in the initial HTML | [R1] |
| Other panel images | 1 × 1 transparent GIF (`data:image/gif;base64,R0lGODlhAQABAHAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==`) in `srcset` + `data-anim-lazy-image` + a `<noscript>` copy of the real `<picture>` | [R1][R5] |
| Lazy trigger | `start:"t - 200vh"` — the picture is swapped when its parent's top is within **two viewport heights** of the viewport top | [R5] |
| Lazy mechanism | `loadPicture()` finds the sibling `<noscript>`, parses it into a `<template>`, and replaces the placeholder picture with the real one | [R5] |
| Priority hints | **none**: no `<link rel="preload">`, no `fetchpriority`, no `importance` in the document | [R1] |
| Video | `preload="none"`; `load()` on the `t - 200vh` range (default `Load Inline Media` keyframe) | [R1][R6] |
| Gallery images | `data-lazy` + a transparent placeholder; handled by the gallery module | [R1][R15] |
| No-JS | every enhanced tile ships a `<noscript>` picture; `html.no-js`/`html.no-enhanced` hide the video wrapper and show the static picture | [R1][R4] |

What is worth copying, and what is not:

- **Copy**: "the first panel is in the document, everything else waits behind a cheap placeholder with a generous look-ahead." The 200 vh margin is what makes the page feel like it has no lazy-loading at all while still keeping the initial HTML light. Also copy the *no-JS parity* — the real picture is always in the markup, so a failed script degrades to a static page, not to empty boxes.
- **Skip**: the 1 × 1 GIF + `<noscript>` swap is Apple's own plumbing (it exists because the art is served from a static CDN without a framework). In Next.js, `next/image` already emits `srcset`/`sizes` and does intersection-based lazy loading; what to reproduce is the *ordering* rule — **first panel `priority`, everything else default** — not the mechanism.

## 6. Responsive behaviour

### 6.1 The breakpoint ladder, and the height qualifiers

The homepage uses the familiar width ladder **734 / 1068 / 1441 px** plus a height axis, because the panels are viewport-height-driven. The page's own viewport model, verbatim: [R9]

```js
const m="(min-height: 734px)", l="(min-height: 776px)", r="(min-width: 1441px)",
n={small:i("S"), medium:i("M"), large:i("L"),
   largetall:`(min-width: 1069px) and ${l}`,
   mediumtall:`(min-width: 735px) and (max-width: 1068px) and ${m}`,
   xlarge:r, xlargetall:`${r} and ${l}`}
```

with `BREAKPOINTS: [{name:"S",mediaQuery:"only screen and (max-width: 734px)"},{name:"M",mediaQuery:"only screen and (max-width: 1068px)"},{name:"L",mediaQuery:"only screen and (min-width: 1069px)"}]` [R15] and a `homepage:breakpointchange` event dispatched for every name on change. [R7]

The sheets are full of the height-qualified variants — `homepage-main.built.css` alone: [R2]

| Media condition | Blocks |
|---|---|
| `(max-width:1068px)` | 20 |
| `(max-width:734px)` | 20 |
| `(min-width:1441px)` | 12 |
| `(min-width:1069px)and (min-height:776px)` | 11 |
| `(min-width:1441px)and (min-height:776px)` | 11 |
| `(min-width:735px)and (max-width:1068px)and (min-height:734px)` | 11 |

This is the single biggest structural difference from the product page: **the homepage art-directs on viewport height as well as width**, because a panel that is "580 px of art below a 48 px copy block" only works when the viewport is tall enough to show it.

### 6.2 What happens at each breakpoint

| | ≥1441 px | 1069–1440 px | 735–1068 px | ≤734 px |
|---|---|---|---|---|
| Hero columns | 1 (full-bleed) | 1 | 1 | 1 |
| Promo columns | 2 | 2 | 2 | **1** |
| Promo side padding | 12 px | 12 px | 12 px | **0** |
| Panel gap / section margin | 12 px | 12 px | 12 px | 12 px |
| Hero panel height | 580 (692 tall) | 580 (692 tall) | 570 (650 tall) | 500 |
| Promo tile height | 580 | 580 | 490 | 500 |
| Hero headline | 56 | 56 | 48 | 32 |
| Promo headline | 40 | 40 | 32 | 32 |
| Subhead (hero / promo) | 28 / 21 | 28 / 21 | 24 / 19 | 19 / 19 |
| CTA font | 17 (hero) / 14 (promo) | same | same | 14 |
| Panel art | `_large` (3008 wide) / `_largetall` | `_large` | `_medium` / `_mediumtall` | `_small` (734 wide) |
| Promo tile art | `_large` (1262) | `_large` | `_medium` (516) | `_small` (734) |
| Gallery tile | 1250 × 668 | 930 × 523 | 688 × 367 | 275 × 496 |

The art-direction conditions, verbatim from the `<source>` elements: [R1]

```html
<source srcset="…_small.jpg, …_small_2x.jpg 2x" media="(max-width:734px)" />
<source srcset="…_mediumtall.jpg, …_mediumtall_2x.jpg 2x" media="(max-width:1068px) and (min-height:734px)" />
<source srcset="…_medium.jpg, …_medium_2x.jpg 2x" media="(max-width:1068px) and (max-height:733px)" />
<source srcset="…_largetall.jpg, …_largetall_2x.jpg 2x" media="(min-width:0px) and (min-height:776px)" />
<source srcset="…_large.jpg, …_large_2x.jpg 2x" media="(min-width:0px) and (max-height:775px)" />
```

### 6.3 Under 734 px

Everything becomes one column of full-width panels:

- the promo grid collapses to `grid-template-columns:1fr` and its 12 px side padding is dropped (`.section-promo{padding:0}`), so a promo tile is exactly viewport-wide — confirmed by its 734 px-wide `_small` art;
- panels are 500 px tall (both hero and promo) and the padding tightens to 39 / 43 px;
- type drops to the 32 / 19 / 14 ladder and hero buttons drop from 17 px to 14 px;
- the gallery switches to portrait cards (275 × 496) and its dotnav gap shrinks from 12 px to 10 px;
- the phone-only crop of the hero video's poster is 734 × 500 as well.

## 7. What changed 2024–2026 versus `apple-product-page-ui.md`

The product-page document already recorded a few homepage facts (its [R8] and §8). Checked against the live page:

| Claim in `apple-product-page-ui.md` | Status today | Evidence |
|---|---|---|
| "Homepage tiles are a fixed-content grid whose copy block is pushed right by a fixed margin at desktop (`margin-left:338px`/`311px` variants) and stacked on small screens." (§8) | **No longer true on the US homepage.** Its copy block is centred (`.tile-content{…align-items:center}`), and no `margin-left:338px` exists in any sheet the US page loads. The rule survives in the FR/shared `tiles.built.css`, scoped to a tile that is not on the page any more: `.section-hero [data-tile-id=ipad] .tile-content{margin-left:338px}`. | [R3][R13] |
| `typography-tile-headline` 56 / 48 / 32 and `typography-tile-subhead` 28 (the "marketing tile" ladder, [R8]) | **Unchanged**, and still used by hero panels. What the document did not record: the `.section-promo` overrides to 40 / 32 and 21 / 19. | [R2][R3] |
| "the recurring value … **20 px gaps**" (§7) | **The homepage uses 12 px**, not 20 px — for the panel gap, the section margin, the promo's side padding and (as `--media-gallery-tile-gap: 13px`) the gallery. | [R3][R8] |
| Product tiles hover `scale(1.0161)` over `0.3 s` (§4.2) | **Not on the homepage.** No transition or transform on panel art; the only hover is the button colour swap. | [R3] |
| `StaggeredFadeIn` fades/rises items in on scroll (§9.2) | **Not on the homepage.** No `data-staggered-item`, no `StaggeredFadeIn` component; panels are static. | [R1] |
| Container `--global-content-max-width:1260px`, 12-column grid (§7) | **Not on the homepage.** `main{max-width:2560px}` and panels are full-bleed to that cap; the string `1260px` appears nowhere in the homepage sheets. | [R2][R3] |
| — (not recorded) | **New: video panels.** `InlineMedia` (hero + promo) with `preload="none"`, scroll-gated load and play, no loop, end-frame restore, and a 36 px play/pause control. | [R1][R6] |
| — (not recorded) | **New: the `endless-entertainment` band.** A shared TV/services carousel (`/autopush/us/fam-gallery/`) with a timed dotnav, 800 ms slides and reduced-motion-gated autoplay. | [R8][R15] |
| — (not recorded) | **New: height-qualified breakpoints** (`largetall`, `mediumtall`, `xlargetall`) and the `text-zoom` state. | [R2][R9] |
| — (not recorded) | **New: lazy-image swap** behind a 1 × 1 GIF with a 200 vh look-ahead, and `preload="none"` video. | [R1][R5] |

The FR locale is a useful fossil: it loads `/v/homepage/a/styles/tiles.built.css` **in addition to** `homepage.built.css`, and that shared sheet still carries the older per-tile layout vocabulary (`.tile-content{margin-left:338px}`, `margin-top:-35px` on a subhead, `[data-component-list~=BTS2026]` video positioning, plus a ribbon `@keyframes ribbon-drop`). The FR page also has two sections the US page does not: a financing ribbon above the hero (`<section class="section-ribbon">`, `#f5f5f7`, 14 px text, a `#0066cc` underlined link) and an energy-rating list after the footnotes (`<section class="energy-flag-wrapper">`, A–G flags with modal buttons). [R12][R13][R14]

## 8. Application notes for eguidar

Concrete observations about this checkout, then recommendations. **No code changes are proposed as edits here; this section is analysis for the implementer.** File references are to this repository.

The constraints that shape everything below: **one light-only theme** (`app/globals.css` sets `color-scheme: light`), **existing catalogue images only** (`cdn.eguidar.com` is the single remote pattern in `next.config.ts`), **6 categories with 1–2 products each** (`prisma/seed.ts`: 6 categories, 10 products — Smartphones 2, Ordinateurs & Tablettes 2, Audio & Hi-Fi 2, TV & Home Cinema 2, Gaming 1, Accessoires 1), **no motion dependency** (CSS + `IntersectionObserver` + `lib/spring.ts`), **French copy**.

### 8.1 What the accueil already gets right

- `app/(boutique)/page.tsx:33-57` — a full-bleed hero panel (`bg-muted`) with a centred copy block and two CTAs, i.e. the same shape as hero panels 1/3 on apple.com.
- `page.tsx:35` — the headline ladder `text-[32px] sm:text-[48px] lg:text-[56px]` with `tracking-[-0.005em]` **is** Apple's `typography-tile-headline` ladder, transcribed. Same for `page.tsx:38` (`19/24/28` with `+0.007em`), which is `typography-tile-subhead` verbatim.
- `page.tsx:62-70` — a first tile that flips to dark (`bg-foreground text-background`) with the `#2997ff` link colour on dark: the `.theme-dark` panel, translated into the light-only system.
- `page.tsx:107-109` — `Découvrir ›` is the Apple chevron text link, and the › is a real character rather than an icon font.
- `components/storefront/carte-produit.tsx:20-35` — borderless card, image on a `bg-muted` field, hover `scale-[1.02]` over 300 ms (Apple's product-page tile value, 1.0161, rounded up).
- `app/globals.css` already stores the two curves this research found in the gallery: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` is *exactly* Apple's interrupted-slide curve, and `--radius-carte: 28px` is Apple's marketing-card radius.

### 8.2 What to change, by file

**`app/(boutique)/page.tsx` — make the panel stack read as panels.**

| Current | Recommendation (Apple-derived) |
|---|---|
| Hero panel `bg-muted` with no gutter to the next section (`page.tsx:33-59`) | Apple separates panels with **12 px of page background**, not with borders: wrap the page in a `flex flex-col gap-3` (12 px) or give each section `mb-3`, and let the white `--background` show through. The current page has no gutter at all between the hero and the category grid. |
| Category tiles in `grid gap-4 sm:gap-5` (`page.tsx:60`) | The homepage gap is **12 px** (`gap-3`), and the promo grid is 2-up from 735 px up — which is what `sm:grid-cols-2` already does. Consider dropping the 20 px gap to 12 px so the tiles read as one wall. |
| `rounded-2xl` on category tiles (`page.tsx:68`) | **Apple's homepage panels are square-cornered** (radius 0); its 28 px radius belongs to product *cards* (which `--radius-carte` already models). Pick one language: square panels for the accueil, 28 px for `CarteProduit`. Mixing both is the tell of a template. |
| `aspect-[16/10]` image (`page.tsx:73`) | The homepage's height is a **CSS constant per breakpoint** (580/570/500), not an image ratio — the art is cut to the panel. With `cdn.eguidar.com` art of unknown ratios, an aspect box is the right adaptation; what to copy is the *stability* (one box for every tile in a row) and the bottom-anchored crop: `object-cover object-bottom`. |
| The dark tile is always `index === 0` (`page.tsx:62`) | Apple's black panels are **spread** (2nd of 3 in the hero, 4th of 6 in the promo). With 6 categories, a black tile in position 2 and another in position 5 reads more like Apple than one black tile in the corner. (Positions, not counts, are the point — two black tiles out of six.) |
| `text-sm` product count (`page.tsx:91`) | The homepage's subhead is **19 px on phones, 21 px in a promo tile** (`text-[19px] sm:text-[21px]`, `tracking-[0.011em]`). The count line is the tile's second voice and is currently the smallest thing in the tile. |
| `text-titre-carte` (a `clamp()`, `globals.css:101`) for the category name | Apple never `clamp()`s type; the homepage steps it 32 → 40 (promo) or 32 → 48 → 56 (hero). `text-[32px] sm:text-[40px]` with `font-semibold` and `tracking-[0.002em]` is the exact promo-tile ladder. |
| `mt-2 text-body text-link` `Découvrir ›` (`page.tsx:102-109`) | Correct idiom. Add the hover rule Apple uses — underline on the text only, never the chevron (`.icon-wrapper:hover .icon-copy{text-decoration:underline}`) — and consider `aria-hidden` on the › itself. |

**`components/storefront/carte-produit.tsx` — the featured row.**

- `scale-[1.02]` on hover (line 28) is fine, but note that on the homepage Apple **does not zoom panel art at all**; the zoom is a product-page tile idiom. Either is defensible; what is *not* Apple is a shadow or a border appearing on hover.
- `text-sm font-semibold` price and `text-xs` stock line (lines 41-54) sit below Apple's ladder (price/subheading 17 px in a product tile, 14 px in a promo tile). The homepage equivalent of this row is a *panel*, not a card — if the "coups de cœur" row stays a compact card row, it is a product-page pattern and the product-page document's §12.2 table applies instead.

**Panel entrance — the honest answer is "none".**

- Apple's homepage has no entrance animation (no `StaggeredFadeIn`, no opacity keyframes). If the accueil wants one, the house pattern already exists: `components/storefront/blog-reveal.tsx` uses an `IntersectionObserver` with `rootMargin: "200px"`, a 0.8 s `cubic-bezier(.4,0,.25,1)` opacity+translate, and a `prefers-reduced-motion` early return — that is the right *component* to reuse.
- But the most Apple-faithful choice is to **not animate the panels**: Apple's own homepage shows everything immediately, and its only "entrance" motion is a video starting and an image swapping in. If motion is wanted, use it on **one** element (e.g. the featured row) rather than on every tile.
- `lib/spring.ts` is for gestures, not entrances. Apple's homepage uses no springs; the only two curves it declares are the carousel's `cubic-bezier(.645,.045,.355,1)` (slide) and `cubic-bezier(.23,1,.32,1)` (interrupted slide). If a category rail becomes swipeable later, `creerEntraineur` + `RESSORT_RETOUR` (`components/storefront/entraineur-ressort.ts:10`) is the tool — the same code path as the cart-swipe.

**Images and loading.**

- Keep `next/image` with `sizes` (already present at `page.tsx:78`); Apple's per-breakpoint art direction (`_small`/`_medium`/`_largetall`) is not available from `cdn.eguidar.com` and should not be faked.
- Give the hero image `priority` if it is above the fold; leave the rest default. Apple's equivalent rule is "first panel in the document, never lazy; everything else behind a placeholder with a 200 vh look-ahead" — Next's default lazy loading is a stricter version of the same idea, and the 200 vh look-ahead is not worth reproducing.

**Field alternation and colour.**

- With a light-only theme, the homepage's two fills map to `--background` (white) and `--muted` (≈`#f6f6f6`), plus one `bg-foreground` panel for the black tile. That is exactly the vocabulary the page already uses; the change is the **rhythm** (12 px gutters, black tiles spread through the stack) rather than the tokens.
- The homepage's secondary grey is `#6e6e73` on grey and `#86868b` on black (callout) — eguidar's `--muted-foreground` (`oklch(54% 0 none)` ≈ `#71717a`) is a hair darker; if exactness matters, this is a one-token change, not a redesign.

**French copy.**

- The FR homepage's CTA pair is `En savoir plus` (blue pill) + `Acheter` (secondary pill); its hero subheads are short sentences with a full stop ("Plus que Pro."). eguidar's existing labels are already in this register: `Tous nos produits` (pill) + `Nos coups de cœur ›` (chevron link). Keep the two-CTA maximum per panel, and keep the sentence-final period on the subhead — Apple's FR copy does.
- The FR homepage's ribbon (`Payez votre achat sur plusieurs mois…`) is the closest Apple precedent for a financing line, if eguidar ever wants one: a 14 px `#f5f5f7` band above the hero with one underlined link.

**Accessibility.**

- The homepage's panel is a link with `aria-hidden="true" tabindex="-1"` plus named CTAs (`aria-label="Learn more, iPhone 18 Pro"`). eguidar's category tile is a single `<Link>` wrapping the whole card, which is *better* than Apple's overlay trick for keyboard users — keep it, and keep the accessible name on the link itself rather than relying on the visible heading.
- Keep the `prefers-reduced-motion` early return if any reveal is added; the homepage itself only respects it for the carousel.

### 8.3 What *not* to do

- **Do not copy the art direction.** 3008 × 580 banners and 1262 × 580 promo cuts are Apple's own geometry; eguidar has catalogue photos, not campaign art. The transferable rule is "one box per panel per breakpoint, art cropped to it", not the numbers.
- **Do not reproduce the copy** ("Learn more / Buy", "Pro further.", "Endless entertainment."). Use the structure: a short positioning line, an optional callout, one or two actions, eguidar's own French text.
- **Do not add a timed carousel to the accueil.** Apple's gallery exists to merchandise services with 9 pieces of art and a dotnav; a 6-category grid does not need autoplay, and autoplay is the one homepage motion that costs accessibility. If a carousel is ever added, copy the gating (`inView`, `document.hidden`, user action, reduced motion), not the timing.
- **Do not import SF Pro** — same caution as the product-page document; `-apple-system`/`system-ui` first in the stack is the legitimate route, and `globals.css:62-64` already does it.
- **Do not port the video panels.** Two scroll-gated MP4s with `preload="none"` are a production pipeline, not a CSS trick; there is no such asset in this repo, and the `InlineMedia` component's real cost is in the media encoding, not the 9 KB of JS.

## 9. Sources that could not be used

| Source | Problem | What was done instead |
|---|---|---|
| The nav theme switch (`globalheader-dark`) | The body is served as `globalheader-light globalnav-scrim`, and no bundle the homepage loads contains code that toggles the class (searched for `globalheader`, `globalnav-scrim`, `dark`, `theme` in `globalheader.umd.js` [R18], `main.built.js`, `homepage.built.js`, `inline-media.built.js` and `head.built.js`). | Quoted the declared light and dark scrim tokens from the homepage sheet and the global header sheet, and flagged the switch as unverified. |
| Rendered/computed styles, hover and scroll behaviour | No browser in this environment. | Every interaction claim is a declared value from CSS or JS; the JS driver for the videos and the carousel is quoted verbatim. |
| The video binaries | Only the `<video>` attributes, the driving JS and the poster frames were read. | Poster intrinsic sizes measured (3008 × 580 etc.); playback ranges quoted from the data attributes. |
| `home-gallery.css` as a whole | The sheet is shared with other pages (it also styles `more-from-apple-gallery`), so some rules belong to templates not on the homepage. | Only rules whose selectors are used by the homepage markup (`.media-gallery-*`, `.tv-media-gallery`, `.fam-media-gallery`, `.dotnav*`) were quoted. |
| `index_1padhrru.built.css` | A generated per-page override sheet with a build hash in the name; its rules change with the tile set. | Treated as the US counterpart of the shared `tiles.built.css`; only its `.endless-entertainment` and per-tile `height`/`max-width` rules were used. |
| `web.archive.org` | Not needed — both apple.com URLs served 200 directly on 13 Oct 2026. | — |

## References

All URLs retrieved **13 October 2026 (UTC)**. Bundle filenames are hashed/versioned and rotate; the quoted text is what was served on that date.

| Ref | Source | URL |
|---|---|---|
| R1 | US homepage HTML (`<title>Apple</title>`, 200, 257,835 B) — panel list, tile markup, video attributes, `data-*` inventory | `https://www.apple.com/` |
| R2 | Homepage main CSS (127,847 B) — type ladder, base font size, breakpoint blocks | `https://www.apple.com/v/homepage/a/styles/main.built.css` |
| R3 | Homepage tiles CSS (32,769 B) — grid, gaps, tile geometry, fills, buttons, promo type overrides | `https://www.apple.com/v/homepage/a/styles/homepage.built.css` |
| R4 | Homepage inline-media CSS (12,609 B) — play/pause button, spinner, `.static` fallback rules | `https://www.apple.com/v/homepage/a/styles/inline-media.built.css` |
| R5 | Homepage main JS (90,784 B) — `LazyImage`, `text-zoom` detector | `https://www.apple.com/v/homepage/a/scripts/main.built.js` |
| R6 | Homepage inline-media JS (8,938 B) — `InlineMedia` load/play keyframes, end-frame restore | `https://www.apple.com/v/homepage/a/scripts/inline-media.built.js` |
| R7 | Homepage page JS (2,280 B) — `homepage:breakpointchange` dispatch | `https://www.apple.com/v/homepage/a/scripts/homepage.built.js` |
| R8 | Gallery CSS (175,999 B) — gallery geometry, dotnav tokens, slide/copy durations | `https://www.apple.com/autopush/us/fam-gallery/styles/home-gallery.built.css` |
| R9 | Viewport/breakpoint JS (983 B) — `largetall`/`mediumtall`/`xlarge` queries | `https://www.apple.com/v/homepage/a/scripts/HpViewport-DHyTaS-L.built.js` |
| R10 | Per-page override CSS (3,057 B) — `.endless-entertainment` padding, per-tile heights | `https://www.apple.com/homepage/styles/index_1padhrru.built.css` |
| R11 | Image files (JPEG intrinsic dimensions measured from SOF markers): hero/promo/start-frame cuts, e.g. `…/images/iphone-18-pro/a/hero_iphone_18_pro__fqe1motd0ymy_{large,large_2x,largetall,medium,mediumtall,small}.jpg`, `…/images/homepod-mini-2/a/promo_homepod_mini_2_preorder__emihici4p1si_{large,large_2x,medium,small}.jpg`, `…/images/apple-homeview/a/hero_apple_homeview_animated_preorder_startframe__cdfuymvo70pe_{large,largetall,medium,mediumtall,small}.jpg` | `https://www.apple.com/v/homepage/images/…` |
| R12 | FR homepage HTML (226,586 B) — ribbon, tile set, energy flags, FR CTA labels | `https://www.apple.com/fr/` |
| R13 | FR/shared tiles CSS (57,161 B) — legacy `margin-left:338px`, per-tile overrides, ribbon keyframes | `https://www.apple.com/v/homepage/a/styles/tiles.built.css` |
| R14 | FR financing ribbon CSS (10,176 B) | `https://www.apple.com/fr/homepage/includes/ribbons/finance-ribbon/style.css` |
| R15 | Gallery JS (157,299 B) — autoplay gating, per-item duration, slide easings, reduced-motion | `https://www.apple.com/autopush/us/fam-gallery/scripts/endless-entertainment-gallery.built.js` |
| R16 | Global header CSS (170,263 B) — `--r-globalnav-height`, scrim backdrop-filter and fills | `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` |
| R17 | Global footer CSS (56,408 B) — `.ac-gf-sosumi` | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` |
| R18 | Global header JS (166,301 B) — checked for, and found not to contain, the theme switch | `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.umd.js` |
| R19 | Apple web-font CSS (© 2019 Apple Inc.; cited for the do-not-self-host caution, unchanged from the product-page document) | `https://www.apple.com/wss/fonts?families=SF+Pro,v3\|SF+Pro+Icons,v3` |
