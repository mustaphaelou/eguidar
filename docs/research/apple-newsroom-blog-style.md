# Apple Newsroom blog style — research findings

> Research-only document. Every claim is traced to a primary source (Apple's own HTML/CSS served on apple.com, or Apple's developer pages). Retrieval date for all live sources: **3 Sep 2026** (fetched via HTTP GET / webfetch). See [Sources](#sources) for the full URL list. Anything that could not be retrieved is listed under [Not retrieved](#not-retrieved) — no values are guessed.

## Summary

Apple Newsroom (`apple.com/newsroom/`) is Apple's press-release/blog surface and the closest Apple equivalent to an editorial blog. Its style is distinct from the apple.com marketing hero (see `apple-com-hero.md`): pages are **light, airy, and card-driven** rather than full-bleed billboards. The anatomy is: a slim sticky localnav ("Newsroom" + section links + search) under the fixed global nav → a **pinned hero card** (16:9 image, 32px radius, black gradient scrim, white 48px/700 headline overlaid bottom-left) on a `#f5f5f7` band → an **"everyday feed" card grid** (1up hero / 2up / 3up tiles, same gradient-card anatomy at 40/24/21px headline sizes) → topic modules → an **archive** (month-grouped list with topic/year/month filters + pagination). **Article pages** are narrow-column editorial: kicker + date, 48px/700 H1, grey dek, large rounded hero image, 19px body in a 653px column, H2 section headers, captioned images with download links, share/media blocks, press-contact accordion, footnotes. Typography is **SF Pro Display for headlines (weight 700)** + SF Pro Text/Display for body, with the canonical Apple breakpoints **734px / 1068px / 1069px+ (xlarge 1441px)** verified in this page's own CSS. Motion is restrained: fade-and-rise on scroll (0.8s, `cubic-bezier(.4,0,.25,1)`), image zoom on hover, everything gated behind `prefers-reduced-motion` and hover capability.

---

## 1. Anatomy

### 1.1 Page shell (landing)

`<body class="page-landing">` (article pages: `<body class="page-article">`), `<html class="no-js globalheader-dark">`. Head links, in order: globalheader CSS, `ac-localnav` CSS, `ac-globalfooter` CSS, `/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3`, then page CSS: `site.built.css`, `global.built.css`, `landing-modules.built.css`, `pinned-hero-landing.built.css`, `takeover.built.css`, `everyday-feed.built.css`, `in-the-loop-landing.built.css`, `apple-stories-module.built.css`, `more-from-apple-newsroom.built.css`. Article pages link only `site.built.css` + `articlev2.built.css`. Rendered landing content is client-mounted React "islands" (`IntersectionObserver`, `rootMargin: 200px`); SSR HTML carries only nav, H1 "Newsroom", tagline "Stay up to date with the latest articles from Apple Newsroom.", and footer. An RSS feed is advertised (`/newsroom/rss-feed.rss`).

Primary source: raw HTML head + rendered markdown of `https://www.apple.com/newsroom/` (3 Sep 2026).

### 1.2 Localnav (blog header bar)

Sticky `#ac-localnav` with title link "Newsroom", section links "Apple Services" / "Apple Stories", and an expanding search tray (4-column quicklink grid → 1 column ≤734px). Token `--localnav-height: 3.0588235294rem` (≈52px) → `2.8235294118rem` (≈48px) at ≤767px. Search input 21px/600 → 24px ≤734px. Open-search scrim: `saturate(180%) blur(20px)` on `rgba(255,255,255,.9)`.

Primary source: newsroom HTML + `site.built.css`.

### 1.3 Pinned hero (featured article card)

```html
<div class="pinned-hero">
  <a class="tile-pinned-hero tile-1up tile-hero-highlight ...">
    <div class="viewport-picture">…16:9 image…</div>
    <div class="tile__gradient"></div>
    <div class="tile__description">
      <div class="tile__category">PRESS RELEASE</div>
      <h2 class="tile__headline">…</h2>
      <div class="description-info"><span class="tile__timestamp">…</span>…</div>
    </div>
  </a>
</div>
```

(Class names reconstructed from the CSS selectors that style them; landing body is client-rendered so raw SSR markup for tiles was not retrievable.) Verified rules from `pinned-hero-landing.built.css`:

- `.pinned-hero{background-color:#f5f5f7; --corner-radius:16px (12px ≤734px)}` — full-width grey band centering the card.
- `.tile-pinned-hero{aspect-ratio:16/9; border-radius:32px; max-width:1722px; width:calc(100% - 90px); margin:40px auto 80px}` → ≤1068px: `max-width:980px; width:calc(100% - 40px); margin-bottom:52px` → ≤734px: `aspect-ratio:unset; max-width:366px; width:87.5%; margin:24px auto 40px`.
- Readability scrim: `.tile__gradient::before` multi-stop black gradient (`hsla(0,0%,0%,.8)` → transparent over 250% height); alternate `.tile__gradient-image-cover::before` (172% height, transparent → `rgba(0,0,0,.8)`).
- `.tile__description{max-width:1052px; padding:0 36px 36px}` (≤1068px: 794px / 24px). Category `margin-bottom:12px` (8px ≤1068px), timestamp `margin-top:12px` (8px ≤1068px).
- Hover (hover-capable only): card link copy gets `text-decoration:underline`.

### 1.4 Everyday feed (card grid)

`.everydayfeed{background-color:#f5f5f7; padding:52px 0 80px}` → ≤1068px: `40px/64px` → ≤734px: `32px/40px`. Same tile anatomy as the hero in three densities (from `everyday-feed.built.css` + tile-size rules in `pinned-hero-landing.built.css`):

| Tile | Card width | Min-height | Headline |
|---|---|---|---|
| 1up (hero) | 980px (692px ≤1068px; 100% ≤734px, aspect 4/5) | — | 40px/1.1/700 → 32px ≤1068px → 24px ≤734px |
| 2up | — | 468px → 332px → 328px | 24px/1.1667/700 → 21px ≤1068px |
| 3up | 303px → 333px ≤1068px → 100% ≤734px | 314px → 332px → 328px | 21px/1.1905/700 |

- Kicker `.tile__category`: 12px/700/−0.01em SF Pro Text on small cards (14px/700 on hero tiles). Timestamp: 17px/600 → 14px variant, `color:#86868b`.
- Hover: `.viewport-image{transform:scale(1.03)}` on tile hover (hover-capable only).
- Unloaded module placeholders reserve `min-height` (everydayfeed 1000px desktop / 2000px ≤734px) to avoid layout shift.

### 1.5 Archive (`/newsroom/archive/`)

Server-rendered list: H1 "Archive" → Filter bar (All Topics / All Years 2000–2026 / All Months, with Reset/Done) → month groups (`## August 2026`) of cards, each card = tile image + uppercase kicker (PRESS RELEASE / UPDATE) + H3 headline + date, linking to the article → numbered pagination ("Page Number 1 of 254").

Primary source: rendered markdown of `https://www.apple.com/newsroom/archive/` (3 Sep 2026).

### 1.6 Article page

Anatomy from the Mac Studio press release (3 Sep 2026), top to bottom: kicker row ("PRESS RELEASE August 25, 2026") → H1 (long, can run 3+ lines) → grey dek paragraph → hero image (large, rounded) + caption + download-zip link → dateline lead ("CUPERTINO, CALIFORNIA …") → body with bold H2 section headers, pull quotes, captioned image blocks (caption + download link each), prev/next image galleries, bulleted spec lists → "Share article" → "Media in this article / Download all media" → "Copy text" → Press Contacts accordion → About Apple boilerplate → numbered footnotes (sosumi) → footer. Body classes: `.pagebody` (prose), `.pagebody-header` (H2), `.pagebody-header--secondary` (large H2), `.pagebody-location/.pagebody-date` (dateline), `.dropcaps`, `.image`, `.nr-accordion`, `.docsanddownloads`, `.contactinfo`, `.presscontacts`, `.quickread-modal .chiclet`.

---

## 2. Typography

Fonts served from `/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3` (newsroom + article HTML). Headlines: **SF Pro Display, weight 700** (blog uses 700 where marketing hero uses 600). Body: SF Pro Display 19px on desktop articles, SF Pro Text elsewhere. Fallback stack: `"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif` (Text variant for body/UI).

| Element (selector) | Desktop | ≤1068px | ≤734px |
|---|---|---|---|
| Pinned-hero headline (`.tile-pinned-hero .tile__headline`, clamp 5) | 48px / 1.0835 / 700 / −0.003em | 40px / 1.1 / 700 / 0em | 24px / 1.1667 / 700 / +0.009em |
| Feed 1up headline (`.everydayfeed .tile.tile-1up .tile__headline`) | 40px / 1.1 / 700 / 0em | 32px | 24px |
| Feed 2up headline | 24px / 1.1667 / 700 / +0.009em | 21px / 1.1905 / 700 / +0.011em | (unverified) |
| Feed 3up headline | 21px / 1.1905 / 700 / +0.011em | (same) | (unverified) |
| Article H1 (`.pagetitle .hero-headline`) | 48px / 1.0835 / 700 / −0.003em | 40px / 1.1 / 700 / 0em | 32px / 1.125 / 700 / +0.004em |
| Article body (`.pagebody`) | 19px / 1.4211 / 400 / +0.012em, SF Pro Display | 17px / 1.4706 / 400 / −0.022em, SF Pro Text | (same as ≤1068px) |
| Article H2 (`.pagebody-header`), mt 52/48/44px | 24px / 1.1667 / 700 / +0.009em | 21px / 1.1905 / 700 | (same) |
| Article large H2 (`.pagebody-header--secondary`) | 40px / 1.1 / 700 / 0em | 32px / 1.125 | 28px / 1.1429 / +0.007em |
| Kicker / dateline (`.tile__category`, `.pagebody-location/.pagebody-date`, uppercase) | 12–14px / 700 | 12px | (same) |
| Timestamp (`.tile__timestamp`) | 17px / 600 / −0.022em | 14px variant | (same) |
| Drop cap (`.dropcaps …::first-letter`) | 84px / 600 / −0.015em | (same) | 48px / 1.0835 / 600 / −0.003em |
| Image caption (`.quickread-modal .image-description`) | 12px / 600, `#6e6e73` | (same) | (same) |
| Localnav search input | 21px / 600 / +0.011em | (same) | 24px / 600 / +0.009em |

Developer guidance (`developer.apple.com/fonts/`): SF Pro has nine weights, variable optical sizes, four widths, and a rounded variant; SF Compact is the watchOS/small-size face; SF Mono (6 weights) is for code; New York (6 weights) is the serif companion. Note the license on that page restricts the downloadable fonts to Apple-platform mock-ups — for a web storefront, use a licensed/web-safe stack, not Apple's binaries.

---

## 3. Colors

| Token | Value | Where |
|---|---|---|
| Section band / card fill | `#f5f5f7` | `.pinned-hero`, `.everydayfeed`, `.nr-cta-open`, `.nr-accordion .accordion-item`, `.docsanddownloads__list` |
| Page background | `#fff` (white) | article/landing base; search curtain `#ffffffe6` |
| Body / headline text | `#1d1d1f` | text, accordion titles/icons |
| Secondary text | `#6e6e73` (captions, search placeholder, CTA icons) | `.image-description`, `.tile__description` controls |
| Tertiary text / timestamps | `#86868b` | `.tile__timestamp`, eyebrow |
| Text-link blue | `#06c` (light) / `#2997ff` (dark) | link/icon hover, search results |
| Button blue | `#0071e3`, hover `#06c`, white text | `.webpush__button--subscribe` |
| Hover wash grey | `#e8e8ed` (hover `#d2d2d7`) | `.nr-cta-open`, search-filter chips (`.nr-sf-content`) |
| Dark surfaces | `#000` card bg under gradients; `#1d1d1f` docs list (dark); `#333336` controls | gradient tiles, dark theme |
| Category pills (`.pill-accent0–6`) | `#6e6e73`, `#065ec6`, `#661d9d`, `#d28314`, `#cd1f48`, `#d0542d`, `#5c800f` | `.pill` (radius 16px, padding 2px 6px, uppercase) |
| Overlay scrim | `linear-gradient(180deg, transparent → #000)`, blur scrims `saturate(180%) blur(20px)` | tiles, search curtain, modal `blur(20px)` |

---

## 4. Layout / spacing

- **Breakpoints (verified in newsroom CSS via `#viewport-emitter`):** small ≤734px · medium ≤1068px · large ≥1069px · xlarge ≥1441px. Localnav/search collapses at 767px; modal compresses at 480px.
- **Radii:** hero card 32px (`--corner-radius` 16px on the band, 12px ≤734px) · article images 10px · accordion/docs rows 10px · pills 16px · circular icon buttons 44px round · small buttons 30px / 22px.
- **Article column:** `.component-content{width:653px}` centered → 576px ≤1068px → 87.5% ≤734px; wide media uses 980px. (Same 980px content column as the rest of Apple.)
- **Article vertical rhythm:** images/footnotes `margin:44px 0` → 36px → 32px; H2 `margin-top:52/48/44px`; accordion items `padding:36px` → 32px → 24px.
- **Feed/hero spacing:** feed padding 52/80 → 40/64 → 32/40; hero card margins 40/80 → 24–52 → 24/40; category/headline/timestamp gaps 12px → 8px.
- **Chiclet (share thumbnail):** 150px / radius 32px → 110px ≤1068px → 104px ≤734px.

---

## 5. Motion / interactions

- Scroll reveal: `.nr-scroll-animation` — opacity 0 → 1 with translate+scale over `0.8s cubic-bezier(.4,0,.25,1)` (`.nr-scroll-animation--off/--on` classes). Slideshow images fade in over 400ms with the same easing, per breakpoint (`xlarge/large/medium/small` loader classes).
- Card hover (hover-capable only): image `transform:scale(1.03)`; card link copy underlines. Gallery icon buttons transition `background-color .4s` with the same bezier.
- Gating: `html.reduced-motion *{transition:none}`; `html.text-zoom` adjustments; touch-specific tweaks (`html.touch`); `prefers-reduced-motion` disables modal crossfade.
- Landing modules lazy-mount via `IntersectionObserver` (`rootMargin: 200px`) and reserve min-heights while loading (no layout shift).
- Search overlay: full-screen curtain + blur, focus-trapped tray, suggestion highlighting (`#06c`, `#2997ff` dark).

---

## 6. Reusable Next.js / Tailwind v4 spec (for eguidar's French blog)

Tokens (`@theme` in CSS-first Tailwind v4):

```css
@theme {
  --breakpoint-sm: 735px;    /* Apple "small" starts above 734px */
  --breakpoint-md: 1069px;   /* Apple "large" */
  --breakpoint-xl: 1441px;   /* Apple "xlarge" */
  --color-canvas: #f5f5f7;
  --color-ink: #1d1d1f;
  --color-muted: #6e6e73;
  --color-faint: #86868b;
  --color-link: #06c;
  --color-link-dark: #2997ff;
  --color-accent: #0071e3;
  --color-wash: #e8e8ed;
  --ease-apple: cubic-bezier(.4,0,.25,1);
  --font-display: "SF Pro Display", Inter, system-ui, sans-serif;
  --font-text: "SF Pro Text", Inter, system-ui, sans-serif;
}
```

Type scale (headlines weight 700, Display; body 19px→17px):

- Featured card: 48 → 40 → 24px · Grid cards: 24 → 21px / 21px fixed · Article H1: 48 → 40 → 32px · Article body: 19px/1.42 (Display) → 17px/1.47 (Text) · Kicker: 12–14px/700 uppercase, tracking −0.01em · Timestamp: 17px/600 `#86868b`.
- (Do not ship Apple's SF binaries: license limits them to Apple-platform mock-ups. Use Inter/system stack under these metrics.)

Markup skeleton (App Router server component + client islands):

```tsx
{/* /blog : grey band, pinned featured card */}
<section className="bg-canvas">
  <a className="tile-pinned-hero group mx-auto block aspect-video w-[calc(100%-90px)] max-w-[1722px] overflow-hidden rounded-[32px] max-md:w-[calc(100%-40px)] max-sm:w-[87.5%]">
    <img className="transition-transform duration-500 group-hover:scale-[1.03]" … />
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent" />
    <div className="absolute bottom-0 p-9">
      <p className="text-sm font-bold uppercase">Communiqué</p>
      <h2 className="text-5xl font-bold tracking-tight text-white [display:-webkit-box] [-webkit-line-clamp:5]">…</h2>
      <p className="mt-3 text-[17px] text-white/80"><time>…</time></p>
    </div>
  </a>
  {/* feed: 1 featured (40px) + 2up (24px) + 3up (21px) cards, same anatomy */}
</section>
{/* /blog/[slug] : 653px column */}
<article className="mx-auto w-[653px] max-md:w-[576px] max-sm:w-[87.5%]">
  <p className="text-sm font-bold uppercase">Communiqué · <time>…</time></p>
  <h1 className="text-5xl font-bold max-md:text-[40px] max-sm:text-[32px]">…</h1>
  <p className="text-muted text-xl">dek…</p>
  <img className="rounded-[10px]" … />
  <div className="text-[19px] leading-[1.42]">…prose…</div>
</article>
```

Motion: IntersectionObserver reveal (opacity/translate/scale, 0.8s `var(--ease-apple)`), `motion-reduce:` fallbacks, hover-only zoom (`[@media(hover:hover)]`), min-height skeletons for feed islands. Base UI: Accordion for press contacts, Dialog for share/media viewer.

---

## Sources

Retrieved 3 Sep 2026 (direct HTTP GET / webfetch of Apple's own assets):

1. `https://www.apple.com/newsroom/` — landing HTML head (stylesheet list, font endpoint, island boot script, RSS) + rendered body (H1, tagline, localnav links, footer).
2. `https://www.apple.com/newsroom/styles/site.built.css` — localnav/search tray, viewport-emitter breakpoints, pills, CTA buttons, scroll animation, webpush banner, link colors.
3. `https://www.apple.com/newsroom/styles/global.built.css` — shared tokens (`--sk-focus-color:#0071e3`), modal, accordion, social-icon font.
4. `https://www.apple.com/newsroom/styles/landing-modules.built.css` — module loader fades, per-breakpoint image opacity, module min-heights.
5. `https://www.apple.com/newsroom/styles/pinned-hero-landing.built.css` — tile anatomy, pinned-hero geometry, gradient scrims, 1up/2up/3up sizes, hero headline/category/timestamp.
6. `https://www.apple.com/newsroom/styles/everyday-feed.built.css` — feed band, 1up/2up/3up headline scale + breakpoints, article prose (`.pagebody`, headers, dropcaps, images, accordions, docs list, contacts).
7. `https://www.apple.com/newsroom/archive/` — archive anatomy (filters, month groups, card pattern, pagination).
8. `https://www.apple.com/newsroom/2026/08/apple-introduces-new-mac-studio-with-m5-max-and-m5-ultra/` — article anatomy (kicker, H1, dek, hero image, sections, galleries, share/media, contacts, footnotes); links `articlev2.built.css`.
9. `https://www.apple.com/newsroom/styles/articlev2.built.css` — article H1 (`.pagetitle .hero-headline` 48/40/32px), 653/576/87.5% column, radius frequency.
10. `https://developer.apple.com/fonts/` — SF family description (nine weights, optical sizes, widths, rounded variant) + license note.
11. `https://developer.apple.com/design/human-interface-guidelines/typography` — **unreadable**: JS-rendered, only the page title could be retrieved; no values taken from it.

## Not retrieved

- `in-the-loop-landing.built.css`, `apple-stories-module.built.css`, `more-from-apple-newsroom.built.css`, `takeover.built.css` (topic/related/takeover modules — same tile system expected, values unverified).
- Exact feed grid column counts/gaps (only card widths/min-heights verified); ≤734px 2up/3up headline steps.
- Raw SSR markup of landing tiles (client-rendered; selectors verified from CSS, not HTML).
- Newsroom JS behavior files (only the inline island boot script in `<head>` was read).
- HIG typography body content (JS-gated).
