# The "hero style" of apple.com — research findings

> Research-only document. Every claim is traced to a primary source (Apple's own HTML/CSS/JS served on apple.com, or Apple's developer/design pages). Retrieval date for all live sources: **17 Aug 2026** (fetched via HTTP GET / webfetch). Wayback snapshot used where noted. See [Sources](#sources) for the full URL list.

## Summary

Apple's current homepage "hero" is not one giant billboard — it is a **full-bleed vertical stack of full-width "tiles"** (`section-hero`), each tile being an absolutely-positioned, edge-to-edge image (or scroll-scrubbed inline video) with **centered copy** overlaid near the top: a bold SF Pro Display headline (weight 600), a lighter subheadline (weight 400), and one or two **pill-shaped CTA buttons** (blue filled `button`, or blue-outlined `button-secondary`). Above it all sits Apple's fixed global nav; tiles sit on a `#f5f5f7` (light grey) or `#000` (black) background, separated by a 12px gutter. Below the hero, a **two-column promo-tile grid** (`section-promo`) repeats the same tile anatomy at a smaller scale. Everything is responsive at Apple's canonical breakpoints of **734px / 1068px / 1069px+** (with height variants at 734px/776px), and all motion is driven by a scroll-position engine ("motion"/`AnimSystemModel`) that only runs when the browser passes an autoplay/"enhanced" capability test. Typography is **SF Pro** (served from `apple.com/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3`): headlines use SF Pro Display, body/buttons use SF Pro Text, with negative letter-spacing at display sizes.

---

## 1. Anatomy / structure of the Apple.com hero

### 1.1 The page shell (homepage)

The homepage body is `<body class="ac-nav-overlap globalnav-scrim globalheader-light">` with a screen-reader-only `<h1 class="visuallyhidden">Apple</h1>`, then a fixed `#globalnav` and a `<main class="main">` containing the hero and promo sections.

Primary source: raw HTML of `https://www.apple.com/` (fetched 17 Aug 2026).

### 1.2 The hero section — a stack of "tiles"

```html
<main class="main" role="main">
  <section class="section section-hero" data-analytics-region="hero">
    <div class="tile-wrapper" data-tile-id="bts-2026" data-component-list="InlineMedia BTS2026">
      <a class="tile-link" href="/us/shop/goto/edu_store" aria-hidden="true" tabindex="-1"></a>
      <div class="tile-content">
        <div class="tile-copy-wrapper">
          <h2 class="tile-headline typography-tile-headline">College, sorted.</h2>
          <p class="tile-subhead typography-tile-subhead">Get a gift card …</p>
        </div>
        <div class="tile-ctas">
          <a class="button" href="…">Shop</a>
        </div>
      </div>
      <div class="tile-image-wrapper">
        <picture class="start-frame">…</picture>
        <video … data-inline-media-play-kf='{"start":"t - (100vh - 70h)","end":"b"}'></video>
      </div>
    </div>
    <div class="tile-wrapper" data-tile-id="iphone-family">…</div>
    <div class="tile-wrapper" data-tile-id="macbook-air-m5">…</div>
  </section>
```

Key structural facts (from the same homepage HTML):

- The hero is `<section class="section section-hero" data-analytics-region="hero">` containing **multiple** `<div class="tile-wrapper" data-tile-id="…">` units, stacked vertically. There is no carousel of big banners anymore — it is a scroll-stack of full-width tiles.
- Each tile is a full-bleed box (no width constraint). Its parts:
  - `.tile-link` — an invisible stretched anchor (`aria-hidden="true" tabindex="-1"`) making the whole tile clickable.
  - `.tile-content` — the centered copy block: `.tile-copy-wrapper` (headline `h2` + subhead `p`) and `.tile-ctas` (one or two `.button` links).
  - `.tile-image-wrapper` — the background visual: a `<picture class="static">` (responsive JPEG/PNG with `data-anim-lazy-image`), or an inline `<video>` for scroll-driven hero animation (`data-component-list="InlineMedia …"`).
- Headline markup pattern: `<h2 class="tile-headline typography-tile-headline">` and `<p class="tile-subhead typography-tile-subhead">`; on promo tiles the headline is an `<h3>` and may be a product **logo image** instead of text (`<h3 class="tile-headline logo-image"><picture class="headline">…<span class="visuallyhidden">iPad Air</span></h3>`).
- Dark tiles are flagged with a class on the tile itself: `<div class="tile-wrapper theme-dark" …>`.
- Hero background visuals are selected per breakpoint via `<source media="…">`, e.g. from the BTS hero picture: `(max-width:734px)`, `(max-width:1068px) and (min-height:734px)`, `(max-width:1068px) and (max-height:733px)`, `(min-width:0px) and (min-height:776px)`, `(min-width:0px) and (max-height:775px)`, each with a `_2x` retina variant.

### 1.3 The "promo" grid below the hero

`<section class="section section-promo" data-analytics-region="promo">` holds the secondary product tiles. Same tile anatomy, but laid out in a responsive grid:

- `.section.section-promo` → `display:grid; grid-template-columns:1fr 1fr;` (2 columns) on desktop, collapsing to `1fr` at `max-width:734px`.
- The gutter between tiles is `gap:12px`; the section has `padding-left/right:max(12px, env(safe-area-inset-left) - 12px)` (0 at ≤734px).

Primary source: homepage HTML (17 Aug 2026) + `https://www.apple.com/v/home/a/styles/home.built.css` (`.section`, `.section-promo`, `.section-promo.section` rules).

### 1.4 How it stacks on mobile

At `max-width:734px`: hero tiles remain full-width and stack one per row (`.section { grid-template-columns:1fr }`, `gap:12px`); `.section-promo` also becomes 1 column; hero copy/padding scale down (see §2, §5). Product-promo images switch to `small`/1x assets. `--hero-content-height` drops to 500px.

Primary source: `home.built.css` media rules (17 Aug 2026).

### 1.5 Product-page hero variant (e.g. `/iphone/`)

Product pages use a related but distinct hero: `<section class="section section-hero no-pad-bottom" data-anim-scroll-group="Hero" data-component-list="StaggeredFadeIn">` with a `<header class="page-header row">` whose title is a huge `<h1 class="page-header-title typography-page-header-title">` (80px → 64px → 48px, see §2.3) and a sticky `nav#chapternav` (chapter links to product variants). Text content sits inside `.viewport-content` (87.5% wide, `max-width:var(--global-content-max-width)`).

Primary source: HTML of `https://www.apple.com/iphone/` + `https://www.apple.com/v/iphone/home/cj/built/styles/overview.built.css` (17 Aug 2026).

---

## 2. Typography

### 2.1 Fonts

- Fonts are loaded as web fonts from Apple's own endpoint: `<link rel="stylesheet" href="/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3" />` on both the homepage and `/iphone/` (homepage HTML, iphone HTML).
- Headlines use **SF Pro Display**; body copy and buttons use **SF Pro Text**; icons/chevrons come from **SF Pro Icons** (e.g. `.icon-chevronright` glyphs rendered from the font via `::before/::after`, with `content:"?"` placeholders replaced by font glyphs). Confirmed in every headline/body/button `font-family` declaration below.
- Fallback stacks: `SF Pro Display, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif` (headlines) and `SF Pro Text, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif` (body/buttons), with per-language overrides (`:lang(ja)`, `:lang(ko)`, `:lang(zh-*)`, …).
- Apple's developer page on fonts states SF Pro is the Apple-designed system font with **nine weights**, variable optical sizes, four widths, and a rounded variant; SF Pro Display and SF Pro Text are part of the SF Pro family (secondary-but-official source: `https://developer.apple.com/fonts/`).

### 2.2 Hero tile headline & subhead (current homepage)

From `main.built.css` (`/v/home/a/styles/main.built.css`) — the "typography" size classes Apple applies to hero copy:

| Class | Desktop | ≤1068px | ≤734px |
|---|---|---|---|
| `.typography-tile-headline` | 56px / lh 1.0714285714 / w 600 / ls −0.005em | 48px / 1.0834933333 / 600 / −0.002em | 32px / 1.125 / 600 / +0.002em |
| `.typography-tile-subhead` | 28px / lh 1.1428571429 / w 400 / ls +0.007em | 24px / 1.1666666667 / 400 / +0.009em | 19px / 1.2105263158 / 400 / +0.012em |

From `home.built.css` (`/v/home/a/styles/home.built.css`) — the layout classes applied to the *same* elements (both `tile-headline typography-tile-headline` are on the same `<h2>`), which **override** the sizes above because `home.built.css` is linked *after* `main.built.css`:

| Class | Desktop | ≤1068px |
|---|---|---|
| `.tile-headline` | 40px / lh 1.1 / w 600 / ls 0em | 32px / 1.125 / 600 / +0.002em |
| `.tile-subhead` | 21px / lh 1.1904761905 / w 400 / ls +0.011em | 19px / 1.2105263158 / 400 / +0.012em |

Practical reading: the **rendered homepage hero headline is ~40px (desktop) / 32px (≤1068px)** and the subhead is **~21px / 19px**, weight 600/400, SF Pro Display. The 56px/28px "typography" values are Apple's design-system defaults for the same classes and are what the identical classes produce on pages where `home.built.css` doesn't override them. `.tile-subhead` uses `margin-top:6px` (4px at ≤1068px); `.tile-ctas` sits `margin-top:17px` (16px at ≤1068px, 11px at ≤734px).

### 2.3 Other hero-relevant sizes

- `body`: **17px / lh 1.4705882353 / w 400 / ls −0.022em**, SF Pro Text (`main.built.css`).
- `.section-hero .button` (hero CTA): **17px / lh 1.1764805882 / w 400 / ls −0.022em**, SF Pro Text (`home.built.css`); base `.button` is **14px / 1.2857742857 / −0.016em** (`main.built.css`).
- Product-page hero `<h1>` `.typography-page-header-title`: **80px / lh 1.05 / w 600 / ls −0.015em** → 64px / 1.0625 / −0.009em (≤1068px) → 48px / 1.0834933333 / −0.003em (≤734px) (`iphone-overview.built.css`).
- "Endless entertainment" gallery headline `.media-gallery-headline`: 56px / 1.0714285714 / 600 / −0.005em → 32px (≤1068px) (`home-gallery.built.css`).
- Localnav product title `.ac-ln-title`: 21px / 1.1428571429 / 600 / +0.011em → 19px / 1.2631578947 / 600 (≤833px) (`ac-localnav.built.css`).

Pattern: Apple's hero/display headlines are **weight 600, negative letter-spacing that grows more negative at larger sizes** (display sizes compress tracking: −0.005em at 56px, −0.002em at 48px, +0.002em at 32px), and **subheadlines are weight 400 with slightly positive tracking** (+0.007…+0.012em).

### 2.4 HIG typography page (limitation)

Apple's HIG "Typography" page (`https://developer.apple.com/design/human-interface-guidelines/typography`) is a JavaScript-rendered app; the live page returns "This page requires JavaScript" and a Wayback snapshot (captured 25 Jul 2026, `https://web.archive.org/web/20260725092856/…`) is the same JS shell, so its full body content could **not** be retrieved. The only typography evidence available from that snapshot is the page's own `noscript` fallback styling, which corroborates Apple's scale: headline 48px/600/−0.003em (desktop), 40px (≤1068px), 32px (≤734px). All concrete font values in this document therefore come from the shipped apple.com CSS (primary evidence) and `https://developer.apple.com/fonts/` rather than HIG.

---

## 3. Colors

### 3.1 Page / tile surfaces

| Token | Value | Where |
|---|---|---|
| Tile background (light) | `#f5f5f7` (`rgb(245,245,247)`) | `.tile-wrapper{background-color:#f5f5f7}` — `home.built.css` |
| Tile background (dark) | `#000` | `.tile-wrapper{background-color:#000}` — `home.built.css` |
| Body background | `rgb(255,255,255)` | `--sk-body-background-color` — `main.built.css` |
| Body / headline text | `rgb(29,29,31)` (#1d1d1f) | `--sk-body-text-color`, `--sk-headline-text-color` — `main.built.css` |
| Tile copy color | `#f5f5f7` | `.tile-copy-wrapper{color:#f5f5f7}` — `home.built.css` |
| Callout / small print | `#6e6e73` (light), `#86868b` (dark) | `.tile-callout`, `.theme-dark .tile-callout` — `home.built.css` |

### 3.2 The accent blue and CTA buttons

- Canonical accent / focus blue: `#0071e3` (`:root{--sk-focus-color:#0071e3}`; focus ring `outline:2px solid var(--sk-focus-color, #0071e3)`; primary button background `rgb(0,113,227)` = `#0071e3`) — `main.built.css`.
- Primary filled button `.button`: background `#0071e3`, hover `#0076DF`, active `#006EDB`, text `rgb(255,255,255)`, border transparent — `main.built.css`.
- Secondary/outline button `.button-secondary` (light theme): transparent background, **1px border + text `rgb(0,102,204)` (#06c)**, hover fills `#0076DF` with white text, active `#006EDB` — `main.built.css`.
- Dark-theme secondary button: border + text **`rgb(41,151,255)` (#2997ff)** — `main.built.css` (and confirmed as the text-link accent `color:#2997ff` under `.theme-dark` in `iphone-overview.built.css`).
- Classic text-link accent on light backgrounds is `#06c` (e.g. `.play-pause-button{color:#06c}` in `iphone-overview.built.css`); this matches the secondary-button blue. So the "Learn more ›" text-link look = `#06c` on light, `#2997ff` on dark.

### 3.3 Button shape (pill buttons)

Base `.button` (`main.built.css`): `border-radius:980px` (a full pill), `border:1px solid`, `box-sizing:content-box`, `padding-inline:16px`, `padding-block:9px`, `min-width:calc(60px - 2*16px)`; `min-width:60px` basis; `white-space:nowrap; text-align:center`. Hover/active swap background via `--sk-button-background-hover/-active`.

The hero-scale button (`.section-hero .button`): `padding-inline:22px; padding-block:12px; min-width-basis:70px; font-size:17px`. The same recipe exists as named tokens `.button-elevated` (22/12, 17px) and the larger `.button-super` (31/18, 17px); the compact `.button-reduced` is 11/4 at 12px. `.button-block` (full-width, radius 8px) is the mobile/full-width variant.

Primary sources: `main.built.css`, `home.built.css`, `iphone-overview.built.css` (17 Aug 2026).

---

## 4. Motion / interactions (what apple.com actually ships)

### 4.1 The scroll engine ("motion" / AnimSystemModel)

Apple's homepage ships a scroll-position animation engine in `AnimSystemModel-CyyfEbM8.built.js` (imported by `main.built.js`, `home.built.js`, `inline-media.built.js`, `bts2026.built.js`). Its key design points:

- **Breakpoints (authoritative):** `S = only screen and (max-width: 734px)`, `M = only screen and (max-width: 1068px)`, `L = only screen and (min-width: 1069px)`.
- **Scroll "groups" and keyframes:** components register elements on a scroll group and animate based on the element's **top (`t`) and bottom (`b`)** relative to the viewport (`h` = viewport height, `vh` = viewport height in px). Examples shipped in the markup/scripts:
  - `data-inline-media-play-kf='{"start":"t - (100vh - 70h)","end":"b"}'` — hero inline-video playback window (homepage hero HTML).
  - Lazy-load images fire when `{start:"t - 200vh", end:"b + 100vh"}` (i.e. image enters ~2 viewport-heights below the fold) — `main.built.js` (LazyImage).
  - Keyframe reserved words: `event, cssClass, style, anchors, start, end, epsilon, easeFunction, ease, breakpointMask, disabledWhen`; keyframe types include interpolation, CSS-class toggles, and events — `AnimSystemModel-CyyfEbM8.built.js`.

### 4.2 Fade-in-on-scroll

- Product-page hero uses `data-component-list="StaggeredFadeIn"` with `data-staggered-item` attributes on the hero `<h1>` and `#chapternav` (iphone HTML). The homepage's equivalent is the tile image reveal: `<picture class="static" data-anim-lazy-image>` elements swap in their real `<source>` images only when scrolled near the viewport (`main.built.js`), which produces the "appears as you scroll" behavior without CSS keyframes.

### 4.3 Scroll-scrubbed inline video (hero)

- The main hero unit (BTS 2026) is a `<video>` whose playback is driven by scroll position: attributes `data-inline-media-basepath`, `data-inline-media-type="webm"`, `data-inline-media-play-kf` (see §4.1). `inline-media.built.js` (InlineMedia component) builds the `src` per breakpoint (`${basepath}${viewport}${retina?"_2x":""}.${type}`, webm→mov on Safari) and creates a scroll group (`this.anim.createScrollGroup`). The hero shows a static **start-frame image** first and fades it out once the video is loaded (`.inline-media-wrapper.loaded .start-frame{display:block;opacity:0}` in `home_4fknv6cw.built.css`).
- `bts2026.built.js` additionally layers "solo" videos positioned with CSS `translate:calc(-50% - 293px) 0` (varied per breakpoint) that play on hover / after the hero video ends — desktop/pointer devices only.

### 4.4 Capability gating — `enhanced` / `reduced-motion`

All animation components check `document.documentElement.classList.contains("enhanced")` before running (`bts2026.built.js`, `inline-media.built.js`). `head.built.js` decides these flags on page load:

- `enhanced` — set only if the browser can autoplay a muted video (it plays a tiny silent test video; on `NotAllowedError` it removes `enhanced` and adds `no-enhanced`).
- `reduced-motion`, `desktop`, `retina` (`devicePixelRatio >= 1.5`), `tablet`, `touch`, and OS/browser classes (`safari`, `chrome`, `firefox`, `edge`, `iphone`, `ipad`, `windows`, `android`) are added to `<html>`.

Reusable lesson: implement motion as progressive enhancement and honor `prefers-reduced-motion`; treat `retina`/device classes as first-class concerns (all images ship `_2x` variants; JS picks them via the `retina` class).

### 4.5 Nav behavior

- **Global nav** (`#globalnav`, homepage): `position:fixed`, height `--r-globalnav-height:44px` (48px at `max-width:833px`), text 17px. On the homepage it uses a "scrim": when scrolled over content it gets `backdrop-filter: saturate(180%) blur(20px)` with background `rgba(250,250,252,.8)` (light) or `rgba(22,22,23,.8)` (dark), via the `globalnav-scrim` class. (`globalheader.css`.)
- **Local nav** (`#ac-localnav .ac-ln-*`, product pages): sticky, height `--r-localnav-height: 52px` (48px at ≤833px; stacked 66px/63px), content column `max-width:980px` centered, product title 21px/19px, and a stuck-state scrim `rgba(250,250,252,0.8)` + `blur(20px)`. Breakpoint model: large ≥1024px, medium 834–1023px, small 320–833px. (`ac-localnav.built.css`.)

### 4.6 Other interactions

- "Endless entertainment" gallery uses a dot-nav (`media-gallery-dotnav`), autoplaying tab panels with a play/pause icon control and per-item duration attributes (`data-ac-gallery-item-duration`) — `home-gallery.built.css` + `endless-entertainment-gallery.built.js`.
- `home.built.js` dispatches a `homepage:breakpointchange` event when any of the viewport queries change, which the hero components listen to in order to re-resolve image/video sources.

Primary sources: `AnimSystemModel-CyyfEbM8.built.js`, `HpViewport-DHyTaS-L.built.js`, `main.built.js`, `home.built.js`, `inline-media.built.js`, `bts2026.built.js`, `head.built.js`, `home_4fknv6cw.built.css`, `globalheader.css`, `ac-localnav.built.css` (17 Aug 2026).

---

## 5. Layout: containers, grid, spacing

### 5.1 The tile boxes

- `.tile-wrapper` (hero): `display:flex; justify-content:center; position:relative; width:100%; min-height:var(--hero-content-height); box-sizing:border-box; background-color:#f5f5f7; overflow:clip; padding:48px 0 56px`. Padding changes by breakpoint: 54/61 (≤1068px), 39/43 (≤734px), 56/63 (≥1069px & ≥776px tall), 61/69 (735–1068px & ≥734px tall) — `home.built.css`.
- `.tile-content`: `display:flex; flex-direction:column; position:relative; align-items:center` (centered stack). `.tile-copy-wrapper`: `position:relative; pointer-events:none; z-index:2`.
- `.tile-image-wrapper`: `position:absolute; bottom:0; width:100%; height:var(--hero-content-height)`; inner `img`: `position:absolute; bottom:0; width:auto; height:100%; inset-inline-start:50%; transform:translate(-50%)`.
- `.tile-ctas`: `display:grid; justify-content:center; column-gap:17px; margin-top:17px; z-index:3`; with 2 CTAs it becomes `grid-template-columns:min-content min-content` (column-gap 14px at ≤734px).
- Hero unit heights via custom properties on `:root` (`home.built.css`):

| Breakpoint | `--hero-content-height` | `--promo-content-height` |
|---|---|---|
| default (desktop) | 580px | 580px |
| `max-width:1068px` | 570px | 490px |
| `max-width:734px` | 500px | 500px |
| `min-width:1069px` and `min-height:776px` | 692px | — |
| `min-width:735px` and `max-width:1068px` and `min-height:734px` | 650px | — |

### 5.2 Grid of tiles

- `.section` (base): `display:grid; grid-template-columns:1fr; gap:12px; text-align:center; margin-bottom:12px`.
- `.section-promo`: gutters via `padding-left/right:max(12px, env(safe-area-inset-left) - 12px)` (0 at ≤734px); `.section-promo.section`: `grid-template-columns:1fr 1fr` (1fr at ≤734px). So promo tiles sit side-by-side two-up with a 12px gutter on desktop.

### 5.3 Max-width constraints

- The hero/promo tiles themselves are **full-bleed (no max-width)** — the background art and section span the whole viewport.
- Content-bearing wrappers on product pages: `.viewport-content{margin-inline:auto; width:87.5%; max-width:var(--global-content-max-width)}` with `--global-content-max-width:1260px` (`:root`, iphone CSS) / `420px` at ≤734px; hero-width token `--global-content-max-width-hero:1680px`.
- Localnav content column: `max-width:980px`, `padding:0 22px` (16px at ≤833px) — the classic Apple content column width still in use for the nav title bar.

Primary sources: `home.built.css`, `main.built.css`, `iphone-overview.built.css`, `ac-localnav.built.css` (17 Aug 2026).

---

## 6. Reusable for a Next.js implementation

Concrete values an engineer can lift directly:

**Breakpoints (canonical, from `AnimSystemModel`/`HpViewport` + CSS):**
- `max-width:734px` / `min-width:735px` — small ("S")
- `max-width:1068px` / `min-width:1069px` — medium ("M") / large ("L")
- Height variants: `min-height:734px` (medium-tall), `min-height:776px` (large-tall)
- `min-width:1441px` — x-large
- Nav: `max-width:833px` / `min-width:834px`; localnav large `min-width:1024px`

**Custom properties pattern (mirror Apple's):**
```css
:root {
  --hero-content-height: 580px;  /* 570 ≤1068px · 500 ≤734px · 692 tall · 650 medium-tall */
  --promo-content-height: 580px; /* 490 ≤1068px · 500 ≤734px */
  --sk-focus-color: #0071e3;
  --sk-body-text-color: rgb(29,29,31);
  --sk-body-background-color: rgb(255,255,255);
  --sk-button-border-radius: 980px;
  --sk-button-background: rgb(0,113,227);       /* #0071e3 */
  --sk-button-background-hover: #0076DF;
  --sk-button-background-active: #006EDB;
}
```

**Typography scale (SF Pro; fall back to a close sans like Inter if SF Pro isn't licensed):**
- Hero headline: 40px/600/0em → 32px/600/+0.002em (≤1068px); display-scale default 56px/600/−0.005em
- Hero subhead: 21px/400/+0.011em → 19px/400/+0.012em
- Body: 17px/400/−0.022em, SF Pro Text
- CTA button: 17px/400/−0.022em, padding 22/12, radius 980px (pill), white text on #0071e3; outline variant: transparent bg, 1px #06c border/text (dark: #2997ff)
- Product-page mega headline: 80px/600/−0.015em → 64 → 48px

**Colors:** surfaces `#f5f5f7` / `#000` tiles on `#fff` page; text `#1d1d1f`; accent `#0071e3` (hover `#0076DF`, active `#006EDB`); text-link blue `#06c` (dark `#2997ff`); muted `#6e6e73`/`#86868b`.

**Layout:** full-bleed hero sections; centered flex/column copy; `gap:12px` between tiles; 2-col promo grid (1-col ≤734px); hero/promo unit heights via the `--*-content-height` tokens above; image art sent per breakpoint with `_2x` retina variants.

**Motion (progressive enhancement):**
- Gate all animation behind a capability flag (Apple's `enhanced` = can autoplay muted video) and respect `prefers-reduced-motion`.
- Scroll-driven effects via element top/bottom vs viewport: e.g. lazy-load when `top - 200vh` to `bottom + 100vh`; play hero inline-video during `top - (100vh - 70vh)` → `bottom`.
- On hover-capable, non-touch viewports only, add secondary micro-interactions (Apple's "solo" hover clips).
- Nav: fixed/sticky bar at 44–52px with `backdrop-filter: saturate(180%) blur(20px)` scrim once scrolled; content column 980px (or 87.5% / 1260px on product pages).

**Markup skeleton to reproduce:**
```html
<section class="section section-hero" data-anim-scroll-group="Hero">
  <div class="tile-wrapper">
    <a class="tile-link" href="/product" aria-hidden="true" tabindex="-1"></a>
    <div class="tile-content">
      <div class="tile-copy-wrapper">
        <h2 class="tile-headline typography-tile-headline">Product name</h2>
        <p class="tile-subhead typography-tile-subhead">Tagline.</p>
      </div>
      <div class="tile-ctas">
        <a class="button" href="/product">Learn more</a>
        <a class="button button-secondary" href="/buy">Buy</a>
      </div>
    </div>
    <div class="tile-image-wrapper">
      <picture class="static" data-anim-lazy-image>
        <!-- source per breakpoint: (max-width:734px) / (max-width:1068px) / (min-width:0px) + _2x -->
        <img src="/hero_large.jpg" alt="" />
      </picture>
    </div>
  </div>
</section>
```

---

## Sources

All live sources were retrieved on **17 Aug 2026** by direct HTTP GET (CSS/JS via PowerShell `Invoke-WebRequest`) or web-fetch (HTML).

Apple's own pages / assets (primary):
1. `https://www.apple.com/` — homepage HTML (hero + promo tile markup, head assets, inline-media video keyframe attr). Retrieved via webfetch (raw HTML), 17 Aug 2026.
2. `https://www.apple.com/v/home/a/styles/main.built.css` — body/base typography, `:root` color & focus tokens, `.button`/`.button-secondary`/`.button-*`, `.typography-tile-headline`/`.typography-tile-subhead`.
3. `https://www.apple.com/v/home/a/styles/home.built.css` — `.tile-wrapper`/`.tile-headline`/`.tile-subhead`/`.tile-ctas`/`.tile-link`/`.tile-copy-wrapper`/`.tile-image-wrapper`, `.section`/`.section-promo` grids, `--hero-content-height`/`--promo-content-height` custom properties and their media queries.
4. `https://www.apple.com/home/built/styles/home_4fknv6cw.built.css` — BTS2026 hero inline-media/solo-video animation CSS (hashed per-deploy build).
5. `https://www.apple.com/v/home/a/built/styles/home-gallery.built.css` — `.media-gallery-headline` (56/32px), dotnav.
6. `https://www.apple.com/v/home/a/styles/inline-media.built.css` — inline-media component styles.
7. `https://www.apple.com/ac/localnav/9/styles/ac-localnav.built.css` — `--r-localnav-height` (52/48/66/63px), `.ac-ln-content` (980px), `.ac-ln-title` (21/19px), breakpoints 833/1023/1044.
8. `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` — `--r-globalnav-height` (44/48px), scrim `saturate(180%) blur(20px)`, backgrounds rgba(250,250,252,.8)/(22,22,23,.8).
9. `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` — loaded asset (footer, not detailed in this doc).
10. `https://www.apple.com/v/home/a/scripts/head.built.js` — `enhanced`/`reduced-motion`/`retina`/device class gating.
11. `https://www.apple.com/v/home/a/scripts/main.built.js` — LazyImage scroll-group keyframes (`t - 200vh` / `b + 100vh`).
12. `https://www.apple.com/v/home/a/scripts/home.built.js` — breakpoint-change dispatch.
13. `https://www.apple.com/v/home/a/scripts/inline-media.built.js` — InlineMedia scroll-scrub video component.
14. `https://www.apple.com/v/home/a/scripts/bts2026.built.js` — BTS hero hover/solo video component.
15. `https://www.apple.com/v/home/a/scripts/AnimSystemModel-CyyfEbM8.built.js` — motion engine: S/M/L breakpoints, keyframe model.
16. `https://www.apple.com/v/home/a/scripts/HpViewport-DHyTaS-L.built.js` — viewport names: small/medium/large/largetall/mediumtall/xlarge(+tall).
17. `https://www.apple.com/v/home/a/scripts/inlineMediaSource-9OnjO25M.built.js` — per-breakpoint video `src` building (webm→mov on Safari).
18. `https://www.apple.com/v/home/a/scripts/ComponentMap-thvKzGgL.built.js` — component registration/event bus.
19. `https://www.apple.com/iphone/` — product-page hero markup (`StaggeredFadeIn`, `typography-page-header-title`, `#chapternav`, `ac-ln` localnav usage).
20. `https://www.apple.com/v/iphone/home/cj/built/styles/overview.built.css` — `typography-page-header-title` (80/64/48px), `--global-content-max-width` (1260/420px) & hero (1680px), `.viewport-content` (87.5%), accent `#06c`/`#2997ff`.
21. `https://developer.apple.com/fonts/` — SF Pro family description (nine weights, variable optical sizes, rounded variant); SF Pro is the system font.

Apple documentation / archives (secondary corroboration):
22. `https://developer.apple.com/design/human-interface-guidelines/typography` — **unavailable**: JS-rendered; returns "This page requires JavaScript". Wayback snapshot `https://web.archive.org/web/20260725092856/https://developer.apple.com/design/human-interface-guidelines/typography` (captured 25 Jul 2026) is the same JS shell; only its `noscript` fallback typography (48px/600/−0.003em headline at 980px) could be read and is used only as corroboration.
23. `https://web.archive.org/web/20260725092856id_/https://developer.apple.com/design/human-interface-guidelines/typography` — raw snapshot HTML inspected (JS shell + noscript styles).

Not used (could not be retrieved / not applicable): HIG typography full body content; apple.com hero screenshot renders (visuals inferred strictly from CSS/markup, not screenshots).