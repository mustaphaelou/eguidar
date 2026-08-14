# apple.com Design System — Verified Reference

> Research date: 2026-08-11. Every claim below was verified against a **primary source**: either the live apple.com homepage HTML, apple.com's own stylesheets (fetched directly), or Apple's official documentation. Values that could not be verified from a primary source are explicitly marked **[unverified]**.
>
> **Caution:** apple.com is a versioned, frequently-shipped site. CSS assets live under versioned paths (e.g. `/v/home/a/styles/...`) and change often. The values below are current as of the fetch date; re-verify before relying on them.

---

## 1. Color palette

Apple defines its palette as CSS custom properties on `:root` in `main.built.css` (light-theme defaults), overridden inside `.theme-dark` scopes. All values below are **rgb()/hex values extracted verbatim from the real stylesheets**.

### 1.1 Core light theme (the values most commonly cited)

| Token (CSS variable) | Value | Hex | Where used | Source |
|---|---|---|---|---|
| `--sk-body-text-color`, `--sk-headline-text-color` | `rgb(29, 29, 31)` | `#1d1d1f` | All body/headline text (near-black) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-body-background-color` | `rgb(255, 255, 255)` | `#ffffff` | Page background | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-body-link-color` | `rgb(0, 102, 204)` | `#0066cc` | All text links (light theme) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-focus-color` | `#0071e3` | `#0071e3` | Focus rings (`outline: 2px solid var(--sk-focus-color, #0071e3)`) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-fill-blue` (button bg) | `rgb(0, 113, 227)` | `#0071e3` | Primary button background | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-fill-secondary` | `rgb(250, 250, 252)` | `#fafafc` | Near-white fill | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-fill-tertiary` | `rgb(245, 245, 247)` | `#f5f5f7` | The famous light-gray background; matches `.tile-wrapper{background-color:#f5f5f7}` on the homepage hero | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css), [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |

### 1.2 Gray scale (light theme)

| Token | Value | Hex | Source |
|---|---|---|---|
| `--sk-glyph-gray` | `rgb(29, 29, 31)` | `#1d1d1f` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-glyph-gray-secondary` / `.tile-callout` color | `rgb(110, 110, 115)` | `#6e6e73` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css), [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) (`.tile-callout{color:#6e6e73}`) |
| `--sk-glyph-gray-secondary-alt` | `rgb(66, 66, 69)` | `#424245` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-glyph-gray-tertiary` / `.theme-dark .tile-callout` | `rgb(134, 134, 139)` | `#86868b` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css), [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) (`.theme-dark .tile-callout{color:#86868b}`) |
| `--sk-fill-gray-tertiary` | `rgb(210, 210, 215)` | `#d2d2d7` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-fill-gray-quaternary` | `rgb(232, 232, 237)` | `#e8e8ed` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |

### 1.3 Dark theme overrides (`.theme-dark` scope)

| Token | Value | Hex | Source |
|---|---|---|---|
| `--sk-body-text-color`, `--sk-headline-text-color` | `rgb(245, 245, 247)` | `#f5f5f7` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-body-link-color` | `rgb(41, 151, 255)` | `#2997ff` | The dark-background link blue | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-fill` | `rgb(0, 0, 0)` | `#000000` | `.tile-wrapper{background-color:#000}` on dark homepage tiles | [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |
| `--sk-fill-secondary` | `rgb(22, 22, 23)` | `#161617` | Dark near-black surface | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-fill-tertiary` | `rgb(29, 29, 31)` | `#1d1d1f` | Dark panel surface (also the dark footer background) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-glyph-blue` | `rgb(41, 151, 255)` | `#2997ff` | Dark-theme accent | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |

### 1.4 Buttons (light theme)

| Property | Value | Source |
|---|---|---|
| `--sk-button-background` | `rgb(0, 113, 227)` (`#0071e3`) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-button-background-hover` | `#0076DF` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-button-background-active` | `#006EDB` | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-button-border-radius` | `980px` (fully pill-shaped) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `--sk-button-padding-horizontal/vertical` | `16px` / `9px` (base); hero buttons override to `22px` / `12px` (`.section-hero .button`) | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css), [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |

### 1.5 Global nav (header) colors

| Item | Value | Source |
|---|---|---|
| Nav link color (light) | `rgba(0, 0, 0, .8)`; hover `#000000` (`--r-globalnav-color` / `--r-globalnav-color-hover`) | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| Nav link color (dark) | `rgba(255, 255, 255, .8)` (`--r-globalnav-color`) | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| Scrim background (light, no blur support) | `rgba(250, 250, 252, .92)` | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| Scrim background (light, with `backdrop-filter` support) | `rgba(250, 250, 252, .8)` | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| Scrim background (dark) | `rgba(22, 22, 23, .88)` (`.8` with blur support) | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| **The frosted-glass effect** | `--globalnav-backdrop-filter: saturate(180%) blur(20px)` | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| Search icon fill / placeholder text | `rgb(110, 110, 115)` (`#6e6e73`); typed value & results `#333336` | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |

### 1.6 Footer colors (light theme; `#ac-globalfooter.theme-light` / `.ac-gf-light`)

| Token | Value (light) | Dark variant | Source |
|---|---|---|---|
| `--footer-background` | `rgb(245, 245, 247)` (`#f5f5f7`) | `rgb(29, 29, 31)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |
| `--footer-directory-title-color` | `rgba(0, 0, 0, .88)` | `rgba(255, 255, 255, .92)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |
| `--footer-link-color` | `rgba(0, 0, 0, .72)` | `rgba(255, 255, 255, .8)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |
| `--footer-text-color` | `rgba(0, 0, 0, .56)` | `rgba(255, 255, 255, .56)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |
| `--footer-border-color` | `rgba(0, 0, 0, .16)` | `rgba(255, 255, 255, .24)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |
| `--footer-pipe-color` | `rgba(0, 0, 0, .48)` | `rgba(255, 255, 255, .4)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |
| `--footer-mini-shop-link-color` ("More ways to shop…" links) | `rgb(0, 102, 204)` (`#0066cc`) | `rgb(41, 151, 255)` | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |

---

## 2. Typography

### 2.1 Font family stacks

apple.com uses **SF Pro** (San Francisco), served as a web font from Apple's own CDN, with a robust system fallback stack. Verified declarations:

**HTML root** — [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css):

```css
html { font-family: SF Pro Text, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif; font-size: 106.25%; }
```

`font-size: 106.25%` on `<html>` makes `1em` = 17px.

**Body** — [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css):

```css
body {
  font-size: 17px;
  line-height: 1.4705882353;   /* ~25px */
  font-weight: 400;
  letter-spacing: -.022em;     /* the tight SF Pro body tracking */
  font-family: SF Pro Text, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif;
}
```

Headings: `h1–h6 { font-weight: 600; }` (semibold), `color: var(--sk-headline-text-color)`. Text rendering is tuned with `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale` (both in [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css)).

**Font delivery** — the homepage `<head>` includes:

```html
<link rel="stylesheet" href="/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3" />
```

(verified in the homepage HTML at https://www.apple.com/). SF Pro Text/Display are used directly; icons/chevrons come from **SF Pro Icons** private-use glyphs (e.g. `.icon-chevronright:after{content:"\f301"}` with `font-family: SF Pro Icons`, [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css)). **[unverified]** The `@font-face` rules behind `/wss/fonts` could not be retrieved (the endpoint rejects non-browser clients); the font stack above is verified from the stylesheets and the `<link>` tag.

**Language variants** — per-`lang` overrides swap in localized SF faces (`SF Pro AR`, `SF Pro JP`, `SF Pro KR`, `SF Pro SC`, `SF Pro HK`, `SF Pro TC`, …), always ending in `Helvetica Neue, Helvetica, Arial, sans-serif` ([main.built.css](https://www.apple.com/v/home/a/styles/main.built.css)).

### 2.2 The type scale (verified selectors & values)

The homepage uses a `typography-*` utility system. Unless noted, the family is the **SF Pro Display stack** `SF Pro Display, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`; text/caption sizes use **SF Pro Text**. Breakpoints: default `≥1069px`, `≤1068px` (medium), `≤734px` (small).

| Selector | Size / line-height / weight / letter-spacing | Family | Source |
|---|---|---|---|
| `.typography-tile-headline` (hero tiles, e.g. "iPhone") | **56px** / 1.0714 / **600** / -.005em → **48px** @≤1068 → **32px** @≤734 | SF Pro Display | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.typography-tile-subhead` (hero subheads, e.g. "Meet the latest iPhone lineup.") | **28px** / 1.1429 / **400** / +.007em → **24px** @≤1068 → **19px** @≤734 | SF Pro Display | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.typography-headline` | **48px** / 1.0835 / 600 / -.002em → 40px @≤1068 → 32px @≤734 | SF Pro Display | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.typography-callout` | **32px** / 1.125 / 600 / +.002em → 28px → 24px | SF Pro Display | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.typography-body` | `body` defaults: 17px / 1.4706 / 400 / -.022em | SF Pro Text | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.typography-body-reduced` | **14px** / 1.4286 / 400 / -.016em | SF Pro Text | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.typography-caption` | **12px** / 1.3334 / 400 / -.01em | SF Pro Text | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |
| `.tile-callout` (eyebrow line above tiles) | **14px** / 1.2858 / 400 / -.016em | SF Pro Text | [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |
| `.section-promo .tile-headline` (promo tiles, e.g. "MacBook Pro") | **40px** / 1.1 / 600 / 0em → 32px @≤1068 | SF Pro Display | [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |
| `.tile-subhead` (promo subheads) | **21px** / 1.1905 / 400 / +.011em → 19px @≤1068 | SF Pro Display | [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |
| `.section-hero .button` | **17px** / 1.1765 / 400 / -.022em | SF Pro Text | [home.built.css](https://www.apple.com/v/home/a/styles/home.built.css) |
| `.button` (default) | **14px** / 1.2858 / 400 / -.016em | SF Pro Text | [main.built.css](https://www.apple.com/v/home/a/styles/main.built.css) |

### 2.3 Header & footer type sizes

| Selector | Value | Source |
|---|---|---|
| `.globalnav-link` (desktop nav items, e.g. "Mac", "iPhone") | **12px** / 1 / 400 / -.01em, SF Pro Text | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| `.globalnav-link-apple` (Apple logo link) | **17px** / 1.2354 / 600 / -.022em, SF Pro Text | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| `.globalnav-link` (mobile expanded menu) | **28px** / 1.1429 / 600 / +.007em, SF Pro Display | [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css) |
| `.ac-gf-directory`, `.ac-gf-directory-column-section-title`, `.ac-gf-sosumi`, `.ac-gf-breadcrumbs-path` | **12px** / 1.3334 / 400 / -.01em, `"SF Pro Text","Myriad Set Pro","SF Pro Icons","Apple Legacy Chevron","Helvetica Neue","Helvetica","Arial",sans-serif` (titles additionally `font-weight: 600`) | [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css) |

### 2.4 Apple's own guidance (HIG)

- **"Apple provides two typeface families that support an extensive range of weights, sizes, styles, and languages. San Francisco (SF) is a sans serif typeface family that includes the SF Pro, SF Compact, SF Arabic, SF Armenian, SF Georgian, SF Hebrew, and SF Mono variants. New York (NY) is a serif typeface family designed to work well by itself and alongside the SF fonts."** — [HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- **"SF Pro: This neutral, flexible, sans-serif typeface is the system font for Apple platforms. SF Pro features nine weights, variable optical sizes for optimal legibility, four widths, and includes a rounded variant."** — [Apple Fonts](https://developer.apple.com/fonts/)
- **"Use font sizes that most people can read easily…"** iOS/iPadOS default body **17 pt**, minimum **11 pt**; macOS 13 pt / 10 pt; tvOS 29 pt / 23 pt; visionOS 17 pt / 12 pt; watchOS 16 pt / 12 pt — [HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- **"In general, avoid light font weights. For example, if you're using system-provided fonts, prefer Regular, Medium, Semibold, or Bold font weights, and avoid Ultralight, Thin, and Light…"** — [HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- SF Pro tracking is size-dependent (e.g. +41/1000 em at 6 pt, 0 at 12 pt, −26 at 17 pt, +8 at 48 pt) — [HIG Typography, "Tracking values"](https://developer.apple.com/design/human-interface-guidelines/typography). This matches apple.com's site CSS, which uses letter-spacing ≈ −0.022em at 17px.

> **Licensing note for your own project:** per the [Apple Fonts](https://developer.apple.com/fonts/) license, the San Francisco font files may only be used for mockups of software running on Apple platforms — not for web content. apple.com itself serves SF Pro from its own CDN (see §2.1). To emulate the look elsewhere, use the **system font stack**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif` (Apple platforms render `-apple-system` as SF Pro natively; other platforms fall back to Helvetica/Arial).

---

## 3. Design philosophy

### 3.1 The eight design principles (HIG)

Apple reintroduced its design principles in the HIG (changelog on the page: "June 8, 2026 — Reintroduced design principles"). Source: [HIG Design Principles](https://developer.apple.com/design/human-interface-guidelines/design-principles/). All quotes verbatim:

> "The most successful and enduring designs are based on a deep understanding of how people think, feel, and interact with the world."

| Principle | Apple's one-line definition (verbatim) |
|---|---|
| **Purpose** | "Make something meaningful." |
| **Agency** | "Let people do things their own way." |
| **Responsibility** | "Act in people's best interest." |
| **Familiarity** | "Build on what people know." |
| **Flexibility** | "Adapt to diverse contexts and needs." |
| **Simplicity** | "Be clear and direct." |
| **Craft** | "Care about every detail." |
| **Delight** | "Make it human." |

Key guidance quotes relevant to apple.com's look and feel:

- **Simplicity**: "Include just what's necessary. Simplicity isn't minimalism. Aim for a focused, useful experience that keeps the important things close by and lets the others fall away." / "Be concise. When you find the simplest way to say something, it's often the most universal, and the most helpful."
- **Familiarity**: "Keep visuals and interactions consistent. Once you establish a behavior or appearance for an element, apply it throughout your design."
- **Craft**: "Quality sets the tone. Every element of your design shows people how much you care. Be deliberate with each decision, and strive for stunning visuals, smooth animations, precise wording, and thoughtful audio."
- **Delight**: "Don't mistake delight for decoration."
- **Agency**: "Stay out of the way. People use your product to get things done."

*(Note: the HIG "Fonts" page at `human-interface-guidelines/fonts` failed to render during research; the official [Apple Fonts](https://developer.apple.com/fonts/) page was used instead. The [HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography) page rendered fully.)*

---

## 4. Header & footer structure

### 4.1 Global header (nav)

From the live homepage HTML at https://www.apple.com/ (fetched 2026-08-11). Header stylesheet: [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css).

```html
<div id="globalheader">
  <aside id="globalmessage-segment" class="globalmessage-segment">…</aside>   <!-- promo ribbon (e.g. store segments) -->
  <nav id="globalnav" class="globalnav no-js" aria-label="Global">
    <div class="globalnav-content">
      <ul id="globalnav-list" class="globalnav-list">
        <li class="globalnav-item globalnav-item-apple">
          <a class="globalnav-link globalnav-link-apple" aria-label="Apple"><svg …>  <!-- inline SVG logo -->
        <li class="globalnav-item globalnav-item-store">       <a class="globalnav-link globalnav-link-store">Store</a>
        <li class="globalnav-item globalnav-item-mac">         <a class="globalnav-link globalnav-link-mac">Mac</a>
        <li class="globalnav-item globalnav-item-ipad">        <a class="globalnav-link globalnav-link-ipad">iPad</a>
        <li class="globalnav-item globalnav-item-iphone">      <a class="globalnav-link globalnav-link-iphone">iPhone</a>
        <li class="globalnav-item globalnav-item-watch">       <a class="globalnav-link globalnav-link-watch">Watch</a>
        <li class="globalnav-item globalnav-item-vision">      <a class="globalnav-link globalnav-link-vision">Vision</a>
        <li class="globalnav-item globalnav-item-airpods">     <a class="globalnav-link globalnav-link-airpods">AirPods</a>
        <li class="globalnav-item globalnav-item-tv-home">     <a class="globalnav-link globalnav-link-tv-home">TV &amp; Home</a>
        <li class="globalnav-item globalnav-item-entertainment"><a class="globalnav-link globalnav-link-entertainment">Entertainment</a>
        <li class="globalnav-item globalnav-item-accessories"> <a class="globalnav-link globalnav-link-accessories">Accessories</a>
        <li class="globalnav-item globalnav-item-support">     <a class="globalnav-link globalnav-link-support">Support</a>
        <li class="globalnav-item globalnav-search">
          <a role="button" id="globalnav-menubutton-link-search" class="globalnav-link globalnav-link-search"
             href="/us/search" aria-controls="globalnav-submenu-search">…</a>   <!-- magnifier SVG -->
        <li class="globalnav-item globalnav-bag">
          <a role="button" class="globalnav-link globalnav-link-bag">…</a>      <!-- bag SVG -->
      </ul>
    </div>
  </nav>
</div>
```

**Behavior & key facts (all verified):**

- **Sticky/frosted nav**: `#globalnav { position: absolute; top: 0; right: 0; left: 0; z-index: 9999; width: 100%; min-width: 320px; height: 48px; max-height: 44px; }`. The page `<body>` carries `class="ac-nav-overlap globalnav-scrim globalheader-light"` — `ac-nav-overlap` lets hero content scroll under the transparent nav; `globalnav-scrim` switches in the frosted background `rgba(250, 250, 252, .8)` + `backdrop-filter: saturate(180%) blur(20px)` once the page scrolls. Dark variant: `rgba(22, 22, 23, .8)` (see §1.5).
- **Layout**: `.globalnav-content { max-width: 1024px; margin: 0 auto; padding-inline: max(22px, env(safe-area-inset-left)); }`; `.globalnav-list { display: flex; justify-content: space-between; height: 44px; list-style: none; }`.
- **Hover flyouts**: each section link carries `data-globalnav-item-name="mac"` etc. plus `data-topnav-flyout-trigger-*` attributes; hover opens `.globalnav-flyout` panels (`width: 100%; padding-top: 50px`). Flyouts are also reachable by keyboard via `.globalnav-submenu-trigger-button` (`width: 22px; outline-offset: -7px`). Transition easing throughout the nav: `cubic-bezier(.4, 0, .6, 1)` with ~.24s durations.
- **Search**: trigger is `a#globalnav-menubutton-link-search[role="button"]` with `aria-controls="globalnav-submenu-search"`, linking to `/us/search`; typing opens a flyout whose icon/placeholder is `rgb(110, 110, 115)` and typed text/results `#333336` (`--r-globalnav-search-*` vars, §1.5). Body-level `globalheader-light` / `globalheader-dark` classes toggle the whole nav theme.
- **Icons**: the logo, magnifier, and bag glyphs are **inline SVGs** (`<svg height="44" viewBox="0 0 14 44">` for the Apple logo), with `globalnav-image-regular` / `globalnav-image-compact` variants.
- The bag's live count is driven by a store API configured via `data-store-api="/[storefront]/shop/bag/status"` and `<meta name="globalnav-store-key" content="…">` in the head.

### 4.2 Global footer

From the live homepage HTML (fetched 2026-08-11); stylesheet: [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css).

```html
<footer id="ac-globalfooter" class="no-js" role="contentinfo" aria-labelledby="ac-gf-label">
  <div class="ac-gf-content">
    <h2 class="ac-gf-label" id="ac-gf-label">Apple Footer</h2>             <!-- visually hidden -->

    <section class="ac-gf-sosumi" aria-label="Footnotes">                   <!-- legal footnotes -->
      <ul><li><small>*</small>…</li></ul> / <ol><li>…</li></ol>

    <nav class="ac-gf-directory with-5-columns" aria-label="Apple Directory"> <!-- link columns -->
      <div class="ac-gf-directory-column">
        <div class="ac-gf-directory-column-section">
          <h3 class="ac-gf-directory-column-section-title">
            <span class="ac-gf-directory-column-section-title-text">Shop and Learn</span>
            <button class="ac-gf-directory-column-section-title-button" disabled>…</button>
          </h3>
          <ul class="ac-gf-directory-column-section-list" role="list">
            <li class="ac-gf-directory-column-section-item"><a class="ac-gf-directory-column-section-link">Store</a></li>
            …</ul>
        </div>
        … <!-- more sections per column -->
      </div>
      … <!-- 5 columns total -->
    </nav>

    <section class="ac-gf-footer">
      <div class="ac-gf-footer-shop">More ways to shop: <a>Find an Apple Store</a> or <a>other retailer</a> near you. …</div>
      <div class="ac-gf-footer-end">
        <div class="ac-gf-footer-locale ac-gf-footer-locale-small">  <!-- country link, mobile position -->
        <div class="ac-gf-footer-legal">
          <div class="ac-gf-footer-legal-copyright">Copyright © 2026 Apple Inc. All rights reserved.</div>
          <ul class="ac-gf-footer-legal-links" role="list">
            <li class="ac-gf-footer-legal-links-item"><a class="ac-gf-footer-legal-link">Privacy Policy</a></li>
            <li class="ac-gf-footer-legal-links-item"><a class="ac-gf-footer-legal-link">Terms of Use</a></li>
            <li class="ac-gf-footer-legal-links-item"><a class="ac-gf-footer-legal-link">Sales and Refunds</a></li>
            <li class="ac-gf-footer-legal-links-item"><a class="ac-gf-footer-legal-link">Legal</a></li>
            <li class="ac-gf-footer-legal-links-item"><a class="ac-gf-footer-legal-link">Site Map</a></li>
          </ul>
        </div>
        <div class="ac-gf-footer-locale ac-gf-footer-locale-large">  <!-- country link, desktop position → /choose-country-region/ -->
      </div>
    </section>
  </div>
</footer>
```

**Key facts:**

- **Container**: `.ac-gf-content { margin: 0 auto; max-width: 980px; padding: 0 22px; }`.
- **The 5 directory columns** (`.with-5-columns`): (1) *Shop and Learn* + *Apple Wallet*, (2) *Account* + *Entertainment*, (3) *Apple Store*, (4) *For Business* + *For Education* + *For Healthcare* + *For Government*, (5) *Apple Values* + *About Apple*. Desktop: `.ac-gf-directory-column { flex-basis: 25% }`; mobile: columns stack vertically and each section title becomes an accordion `button.ac-gf-directory-column-section-title-button` (hidden on desktop via `display: none`).
- **Column typography**: titles and links are 12px; titles semibold (`font-weight: 600; margin-bottom: .8em`); links `padding: 6px 14px; display: block`, color `var(--footer-link-color)` = `rgba(0,0,0,.72)`.
- **"More ways to shop"** line (`.ac-gf-footer-shop`): its links use `--footer-mini-shop-link-color` = `rgb(0, 102, 204)` (`#0066cc`) with hover underline.
- **Legal bar**: copyright text `rgba(0,0,0,.56)` (`--footer-text-color`); the five legal links are separated by a 1px vertical pipe (`--footer-pipe-color`), drawn with `.ac-gf-footer-legal-links-item:before`. The country link ("United States") floats right on desktop (`.ac-gf-footer-locale-large`) and is reordered to the top on mobile (`.ac-gf-footer-locale-small`).
- **Breadcrumbs**: the global-footer CSS defines `.ac-gf-breadcrumbs` (12px, `border-bottom: 1px solid var(--footer-section-border-color)`, home icon + chevron separators rendered via SVG `mask-image` with a visually hidden label `.ac-gf-breadcrumbs-home-label`), but the current homepage does **not** render them (verified: no `ac-gf-breadcrumbs` element in the homepage HTML). Breadcrumbs appear on subpages and come from the same stylesheet.
- **Footer theme**: `#ac-globalfooter.theme-light` / `.ac-gf-light` for light (default, `#f5f5f7` background); dark variant via the `--footer-*` overrides in §1.6.
- A `.visuallyhidden` utility (1×1px absolute clip) hides the "Apple Footer" heading and other screen-reader-only labels.

### 4.3 Local nav (subpages only)

Subpages add a local nav bar below the global nav. The homepage links `/ac/localnav/9/styles/ac-localnav.built.css` in its `<head>` but does not render a localnav element, so its markup was not part of this research; the stylesheet is available at https://www.apple.com/ac/localnav/9/styles/ac-localnav.built.css.

---

## 5. Practical checklist for replicating the look

1. **Colors** — copy the tokens in §1: `#1d1d1f` text, `#f5f5f7` section backgrounds, `#0066cc` links (light) / `#2997ff` (dark), `#0071e3` buttons (hover `#0076DF`, active `#006EDB`), pill radius `980px`. Use CSS custom properties in `.theme-light` / `.theme-dark` scopes exactly like Apple does.
2. **Type** — base 17px / 1.4706 / 400 / -.022em with the system SF stack; semibold (600) headings; hero headline 56px → 48px → 32px; subhead 28px → 24px → 19px; nav 12px; footer 12px.
3. **Layout philosophy** — content max-width ~980px (footer) / ~1024px (nav); generous vertical padding (hero tiles `padding: 48px 0 56px`); one big product story per section; centered, short copy; fewer than 10 words per headline.
4. **Header** — transparent 44px nav that gains `saturate(180%) blur(20px)` frosted glass on scroll; inline SVG icons; 12px uppercase-free text links; hover flyouts.
5. **Footer** — `#f5f5f7` background, 5 link columns, "More ways to shop" line, legal links separated by 1px pipes, country selector, all 12px type.

---

## 6. Sources (all consulted 2026-08-11)

| # | URL | What it provided |
|---|---|---|
| 1 | https://www.apple.com/ | Homepage HTML: stylesheet links, global nav markup, footer markup, hero/promo structure |
| 2 | https://www.apple.com/v/home/a/styles/main.built.css | Design tokens (`--sk-*`), font stacks, `typography-*` type scale, button styles, theme-dark overrides |
| 3 | https://www.apple.com/v/home/a/styles/home.built.css | Hero/promo tile styles: `.tile-wrapper` (#f5f5f7/#000), `.tile-callout` colors, promo headline sizes |
| 4 | https://www.apple.com/home/built/styles/home_vzpcm0sw.built.css | Current-page overrides (BTS2026 tile layout, `.endless-entertainment` background) |
| 5 | https://www.apple.com/v/home/a/built/styles/home-gallery.built.css | Homepage gallery component CSS (fetched; no `typography-tile` classes present) |
| 6 | https://www.apple.com/v/home/a/styles/inline-media.built.css | Inline media component CSS (fetched; no `typography-tile` classes present) |
| 7 | https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css | Global nav: position/z-index, 44px bar, scrim + `saturate(180%) blur(20px)`, nav link type, search flyout colors |
| 8 | https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css | Footer tokens (`--footer-*`), directory/breadcrumb/legal/sosumi classes, 12px footer type |
| 9 | https://www.apple.com/ac/localnav/9/styles/ac-localnav.built.css | Local nav stylesheet (linked on homepage; localnav itself is subpage-only) |
| 10 | https://developer.apple.com/design/human-interface-guidelines/typography | SF/SF Pro/NY facts, platform text sizes, weights guidance, Dynamic Type, tracking values |
| 11 | https://developer.apple.com/design/human-interface-guidelines/design-principles/ | The eight design principles with verbatim quotes |
| 12 | https://developer.apple.com/fonts/ | SF Pro description ("system font for Apple platforms"), nine weights, SF font license terms |

**Not fetched / failed:** `https://developer.apple.com/design/human-interface-guidelines/fonts/` (crawl 404), and the `@font-face` CSS at `/wss/fonts` (endpoint rejected non-browser clients; usage is confirmed via the homepage `<link>` tag).
