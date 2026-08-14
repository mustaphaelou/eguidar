# How apple.com's Global Header and Footer Are Actually Built

Research date: 2026-08-10. Method: fetched the live `https://www.apple.com/` homepage HTML and downloaded Apple's actual shipped CSS/JS assets from the URLs found in that HTML; behavior claims were additionally verified by running the real page in headless Chrome (Puppeteer). Everything below cites the primary source (live URL) it was read from. Anything not directly verified is listed under [Unverified / open questions](#unverified--open-questions).

**Important context**: the classic `ac-globalnav` component the literature describes has been replaced. The current apple.com homepage (fetched 2026-08-10) ships a **new global header** — `<nav id="globalnav">` — server-rendered inline in every page, styled by `/api-www/global-elements/global-header/v1/assets/globalheader.css` and hydrated by `globalheader.umd.js`. The footer still uses the legacy `ac-globalfooter` (`/ac/globalfooter/8/...`). The old `ac-globalnav` CSS asset still exists at its old URL and its structure is documented in a section below.

---

## 1. Global Header (current implementation, `globalnav`)

### 1.1 How it's loaded / served

- The nav markup is **server-rendered directly into the page HTML**, inside `<div id="globalheader">`, immediately after the `<body>` tag. It is *not* injected by JavaScript. Source: raw HTML of https://www.apple.com/ (fetched 2026-08-10).
- Assets referenced from the homepage `<head>` ([homepage HTML](https://www.apple.com/)):
  - `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` (170 KB)
  - `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.umd.js` (164 KB, loaded at end of body)
  - `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css`
  - `https://www.apple.com/ac/globalfooter/8/en_US/scripts/ac-globalfooter.built.js`
  - `https://www.apple.com/ac/localeswitcher/4/en_US/scripts/localeswitcher.built.js`
  - Fonts: `https://www.apple.com/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3`
- The nav carries a `no-js` class in the HTML; the JS removes it and adds `js` at hydration (verified: `class="globalnav no-js"` in HTML, becomes `globalnav js` at runtime).
- Body-level hooks: `<body class="ac-nav-overlap globalnav-scrim globalheader-light">`; the page also has `<h1 class="visuallyhidden">Apple</h1>` and `<meta name="globalnav-store-key" ...>`.

### 1.2 DOM structure (from the homepage HTML)

```
<div id="globalheader">
  <aside id="globalmessage-segment" class="globalmessage-segment">…promo bar…</aside>
  <nav id="globalnav" lang="en-US" dir="ltr" aria-label="Global"
       data-store-api="/[storefront]/shop/bag/status"
       class="globalnav no-js">
    <div class="globalnav-content">
      <div class="globalnav-item globalnav-menuback">…back button…</div>
      <ul id="globalnav-list" role="none" class="globalnav-list">
        <li class="globalnav-item globalnav-item-apple"><a class="globalnav-link globalnav-link-apple" aria-label="Apple" href="/">…inline SVG apple logo…</a></li>
        <li class="globalnav-item globalnav-item-store globalnav-item-menu globalnav-item-submenu">
          <div class="globalnav-submenu-trigger-group">
            <ul class="globalnav-submenu-trigger-list">
              <li class="globalnav-submenu-trigger-item"><a href="/us/shop/goto/store" data-globalnav-item-name="store" class="globalnav-link globalnav-submenu-trigger-link globalnav-link-store">Store</a></li>
            </ul>
          </div>
          …flyout (injected/rendered per item)…
        </li>
        …Mac, iPad, iPhone, Watch, Vision, AirPods, TV & Home, Entertainment, Accessories, Support…
        <li class="globalnav-item globalnav-search">
          <a id="globalnav-menubutton-link-search" class="globalnav-link globalnav-link-search" aria-label="Search apple.com" aria-expanded="false" aria-controls="globalnav-submenu-search" role="button" href="/us/search">
          <div id="globalnav-submenu-search" role="search" aria-labelledby="globalnav-menubutton-link-search" class="globalnav-flyout globalnav-submenu">
            <form class="globalnav-searchfield" action="/us/search" method="get">
              <input class="globalnav-searchfield-input" placeholder="Search apple.com" autocorrect="off" autocapitalize="off" autocomplete="off" …>
              <button class="globalnav-searchfield-reset" aria-label="Clear search" tabindex="-1">…</button>
              <button class="globalnav-searchfield-submit" aria-label="Submit search" tabindex="-1" aria-hidden="true">…</button>
              <div class="globalnav-searchresults-count" aria-live="polite">…</div>
            </form>
            <div class="globalnav-searchresults"></div>
        <li id="globalnav-bag" class="globalnav-item globalnav-bag">
          <a id="globalnav-menubutton-link-bag" href="/us/shop/goto/bag" aria-label="Shopping Bag" class="globalnav-link globalnav-link-bag" aria-expanded="false" aria-controls="globalnav-submenu-bag">
            <span class="globalnav-bag-badge"><span class="globalnav-bag-badge-separator"></span><span class="globalnav-bag-badge-number">0</span><span class="globalnav-bag-badge-unit">+</span></span>
          <div id="globalnav-submenu-bag" class="globalnav-flyout globalnav-submenu">
      </ul>
      <div class="globalnav-menutrigger"><button id="globalnav-menutrigger-button" aria-controls="globalnav-list" aria-label="Menu">…SVG hamburger with SMIL <animate> bread animation…</button></div>
    </div>
  </nav>
  <div id="globalnav-curtain" class="globalnav-curtain"></div>
  <div id="globalnav-placeholder" class="globalnav-placeholder"></div>
</div>
```

Notes from the markup:

- All glyphs (logo, search icon, bag icon, chevrons) are **inline SVG** — no image requests. The logo is a `<path>` tuned to the 44px-high bar; a second `globalnav-image-compact` variant is used on mobile.
- Each product item is an `<a class="globalnav-link globalnav-submenu-trigger-link">` inside a `globalnav-submenu-trigger-group`; the *submenu* (nested flyout with links like "Explore All Mac", product links) is assembled client-side — the JS templates it and injects `globalnav-submenu-trigger-button` elements with `aria-expanded`/`aria-controls` ([globalheader.umd.js](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.umd.js)).
- The menu hamburger uses **SMIL animations** inside the SVG: two `<polyline>`s with `<animate id="globalnav-anim-menutrigger-bread-top/bottom-open/close" attributeName="points" dur="0.24s">` morphing between hamburger and X shapes.
- Analytics hooks are everywhere: `data-analytics-region="global nav"`, `data-analytics-element-engagement="globalnav hover - mac"`, `data-analytics-title`, `data-analytics-exit-link` etc.

### 1.3 Positioning, size, and the "sticky" behavior

From [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css):

- `#globalnav { position:absolute; top:0; right:0; left:0; z-index:9999; width:100%; min-width:320px; height:48px; max-height:44px; }`
- At runtime the JS upgrades it to **`position:fixed`** — verified in headless Chrome: after `window.scrollTo(0, 1200)`, `getComputedStyle(#globalnav).position === "fixed"` and the nav's viewport `top` stays constant (70px on the day tested, because the promo `globalmessage-segment` bar above it is ~70px tall; `html.globalmessage-segment-visible { margin-top: var(--r-globalmessage-segment-height) }` shifts the page down instead).
- `.globalnav-placeholder { height:44px }` (48px on mobile) reserves layout space; the body class `ac-nav-overlap` hides the placeholder on pages where content is designed to slide under the nav.
- The overlay behind flyouts/menu, `#globalnav-curtain`: `position:fixed; inset:0; z-index:9998; background:rgba(232,232,237,.4); backdrop-filter:blur(20px);` opacity/visibility transition `0.32s cubic-bezier(.4,0,.6,1) 80ms`. (Dark theme: `rgba(0,0,0,.4)`.) On ≤833px the curtain's own blur is removed while the menu/flyout is open.
- Content wrapper `.globalnav-content { max-width:1024px; padding-inline: max(22px, env(safe-area-inset-*)) }` — the classic centered-max-width pattern.

### 1.4 Backdrop blur / frosted glass

Verified in [globalheader.css](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css):

```css
#globalnav.globalnav-scrim, .globalnav-scrim #globalnav {
  --globalnav-background: rgba(250, 250, 252, .92);
}
@supports (backdrop-filter: initial) {
  #globalnav.globalnav-scrim, .globalnav-scrim #globalnav {
    --globalnav-backdrop-filter: saturate(180%) blur(20px);
    --globalnav-background: rgba(250, 250, 252, .8);
  }
}
#globalnav { backdrop-filter: var(--globalnav-backdrop-filter); }
```

- **`backdrop-filter: saturate(180%) blur(20px)`** (computed at runtime: `saturate(1.8) blur(20px)`), applied via a CSS custom property only when `@supports (backdrop-filter: initial)` passes.
- Graceful degradation: without backdrop-filter support the bar is **more opaque** (`.92` vs `.8` alpha) — blur is treated as a progressive enhancement, and the fallback keeps the bar legible.
- Dark theme variant: `--globalnav-background: rgba(22, 22, 23, .8)` (`.88` without blur support).
- While a flyout is open the bar drops its own blur/background (`#globalnav.globalnav-with-flyout-open { background:none; backdrop-filter:none }`) and the curtain behind takes over the blurring.
- `.globalnav-scrim-noblur` and `.globalnav-curtain-noblur` are opt-out classes (used for reduced-motion/blur-avoidance contexts).
- Note: the new CSS only writes the unprefixed `backdrop-filter`; the *old* `ac-globalnav` CSS wrote both `-webkit-backdrop-filter` and `backdrop-filter` (see §4).

### 1.5 Flyout (dropdown) menus

- **Trigger**: on desktop, moving the pointer over a nav item opens its flyout (verified live in headless Chrome — hover over "Mac" added `globalnav-with-flyout-open globalnav-with-submenu-open` to `<nav>` and revealed a 552px-tall flyout listing "Explore All Mac / MacBook Neo / MacBook Air / MacBook Pro / iMac …"). The JS wires `mouseover`/`mouseleave` on the top-nav list (`onMenuItemMouseOver`, `mouseleave` with `{once:true}`), and closes the open flyout on `document scroll` ([globalheader.umd.js](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.umd.js)).
- **State classes** on `#globalnav`: `globalnav-with-flyout-open`, `globalnav-with-menu-open`, `globalnav-with-submenu-open`, `globalnav-with-iconflyout-open` (search/bag), plus `globalnav-animating` / `globalnav-with-flyout-closing` while transitions run.
- **Animation**: submenu trigger groups and flyout items stagger in with `transition-delay: calc(var(--r-globalnav-flyout-item-number) * 20ms)`; flyouts slide horizontally (`@keyframes globalnav-flyout-slide-forward-next { from { opacity:0; transform:translate(8px) } }`); `.globalnav-flyout-item { opacity:0; transform:translateY(-4px); transition: opacity .32s cubic-bezier(.4,0,.6,1) calc(var(--r-globalnav-flyout-item-number)*20ms + …) }`. Motion timing constants: `--r-globalnav-flyout-close-delay:.12s`, `--r-globalnav-flyout-link-opacity-duration:.5s`, `--r-globalnav-flyout-spacing:88px`.
- **Escape key** closes flyouts: `document.addEventListener("keydown", this._onFlyoutDocumentKeyDown, …)`; `aria-expanded` is toggled on the trigger (`setAttribute("aria-expanded", !0/!1)`).

### 1.6 Search overlay

- Clicking the search icon opens `#globalnav-submenu-search` (`role="search"`, `aria-labelledby="globalnav-menubutton-link-search"`) and **focuses the input** (verified: `document.activeElement === input` after click).
- Input: `placeholder="Search apple.com"`, `autocorrect/autocapitalize/autocomplete="off"`, 24px/SF Pro Display on desktop, 28px on mobile; clear button (`aria-label="Clear search"`) and submit (`aria-label="Submit search"`) are `tabindex="-1"` until typing starts, and the submit is `aria-hidden="true"` (the input's own keyboard is the path).
- **Live suggestions**: typing fetches from an Apple search API — `fetch(apiDomain + apiRequestURL + "?src=" + searchSrc + "&locale=" + locale)` — and renders `.globalnav-searchresults` with a "Suggested Links" section (`.globalnav-searchresults-header`), a results list, and a visible count read out via `.globalnav-searchresults-count` (`aria-live="polite"`, CSS-clipped so it's screen-reader-only). Verified live: typing "mac" produced "Suggested Links" + "10 total results". Search results animate in with the same stagger system.
- The old markup's search API attribute was `data-search-api="/search-services/suggestions/"` (see §4); the current JS takes the endpoint from page config.

### 1.7 Bag

- `<a href="/us/shop/goto/bag" aria-label="Shopping Bag" aria-expanded="false" aria-controls="globalnav-submenu-bag">` with an inline-SVG bag icon and a `globalnav-bag-badge` (number + "+", e.g. "0+", `aria-hidden="true"`).
- Item count comes from the store backend: `data-store-api="/[storefront]/shop/bag/status"` on `<nav>`; JS polls it (XHR/`fetch` + `XMLHttpRequest` for bag status in [globalheader.umd.js](https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.umd.js)).

### 1.8 Responsive / adaptive behavior

- **Breakpoint: 834px.** `@media (min-width: 834px)` = desktop (full link row, flyouts); `@media (max-width: 833px)` = compact mode: hamburger menu replaces the link row, nav height goes 44→48px, content column layout becomes a full-viewport overlay (`height: calc(100vh - var(--globalnav-preceding-element-height, 0px))`, `overflow-y: scroll`).
- Other breakpoints present in globalheader.css: `1068px`, `734px`, `640px`, `480px` (used for search-flyout spacing, result lists, etc.), plus `@media (hover: hover)` and `@media (inverted-colors)` guards.
- **Compact menu behavior** (verified live at 390px width): hamburger click → `globalnav-with-menu-open`; button label flips "Menu"→"Close"; menu is a vertical list of 28px/SF Pro Display links; tapping a section drills into a submenu with a back button (`.globalnav-menuback`, chevron SVG, `aria-label="Main menu"`); slide animations are the horizontal `slide-forward/slide-back` keyframes with `--r-globalnav-logical-factor` for RTL.
- Layout containers use `padding-inline: max(22px, env(safe-area-inset-*))` and `--r-*` logical-property custom properties with `:dir(rtl)` variants (`--r-globalnav-start/end/safe-area-inset-start/end`), i.e. fully logical-ized CSS.

---

## 2. Footer (`ac-globalfooter`)

### 2.1 How it's loaded

Server-rendered inline at the end of every page, inside `<div class="ac-gf-content">`, with its own CSS/JS at versioned `/ac/` URLs ([homepage HTML](https://www.apple.com/)):

- `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` (56 KB)
- `https://www.apple.com/ac/globalfooter/8/en_US/scripts/ac-globalfooter.built.js` (9.7 KB)

### 2.2 Structure (from the homepage HTML)

```
<footer id="ac-globalfooter" class="no-js" lang="en-US" data-nosnippet="true"
        data-analytics-region="global footer" role="contentinfo" aria-labelledby="ac-gf-label">
  <div class="ac-gf-content">
    <h2 class="ac-gf-label" id="ac-gf-label">Apple Footer</h2>            ← visually hidden label for the landmark
    <section class="ac-gf-sosumi" aria-label="Footnotes"> …footnote <ol>/<ul>… </section>
    <nav class="ac-gf-directory with-5-columns" aria-label="Apple Directory" role="navigation">
      <div class="ac-gf-directory-column">
        <div class="ac-gf-directory-column-section">
          <h3 class="ac-gf-directory-column-section-title">
            <span class="ac-gf-directory-column-section-title-text">Shop and Learn</span>
            <button class="ac-gf-directory-column-section-title-button" disabled>
              <span class="…-title-text">Shop and Learn</span>
              <span class="…-title-icon" aria-hidden="true"></span>
            </button>
          </h3>
          <ul id="footer-directory-column-section-products" class="ac-gf-directory-column-section-list" role="list">
            <li class="ac-gf-directory-column-section-item" role="listitem"><a class="ac-gf-directory-column-section-link" href="/us/shop/goto/store">Store</a></li>
            …
          </ul>
        </div>
      </div>
      …
    </nav>
    <section class="ac-gf-footer">
      <div class="ac-gf-footer-shop" x-ms-format-detection="none">
        More ways to shop: <a href="/retail/">Find an Apple Store</a> or <a href="https://locate.apple.com/">other retailer</a> near you. <span class="nowrap">Or call <a href="tel:1-800-692-7753">1-800-MY-APPLE</a>.</span>
      </div>
      <div class="ac-gf-footer-end">
        <div class="ac-gf-footer-locale ac-gf-footer-locale-small">
          <a class="ac-gf-footer-locale-link" href="/choose-country-region/" aria-label="United States. Choose your country or region">United States</a>
        </div>
        <div class="ac-gf-footer-legal">
          <div class="ac-gf-footer-legal-copyright">Copyright © 2026 Apple Inc. All rights reserved.</div>
          <ul class="ac-gf-footer-legal-links" role="list">
            <li><a class="ac-gf-footer-legal-link" href="/legal/privacy/">Privacy Policy</a></li>
            <li><a class="ac-gf-footer-legal-link" href="/legal/internet-services/terms/site.html">Terms of Use</a></li>
            <li><a class="ac-gf-footer-legal-link" href="/us/shop/goto/help/sales_refunds">Sales and Refunds</a></li>
            <li><a class="ac-gf-footer-legal-link" href="/legal/">Legal</a></li>
            <li><a class="ac-gf-footer-legal-link" href="/sitemap/">Site Map</a></li>
          </ul>
        </div>
        <div class="ac-gf-footer-locale ac-gf-footer-locale-large"> …same locale link, shown only ≥834px… </div>
      </div>
    </section>
  </div>
</footer>
```

- The 5 directory columns (`.with-5-columns`) are: **Shop and Learn, Apple Wallet, Account, Entertainment, Apple Store**, with additional sections **For Business, For Education, For Healthcare, For Government, Apple Values, About Apple** distributed into the columns. (Verified from the fetched HTML: the 10 `h3` titles listed in order.)
- **Landmark pattern**: `<footer role="contentinfo" aria-labelledby="ac-gf-label">` + visually-hidden `<h2>Apple Footer</h2>`, so the landmark has an accessible name. The directory is a `<nav aria-label="Apple Directory">`.
- Each column section is an `<h3>` containing both a `<span>` title (static) and a `<button>` (mobile disclosure, `disabled` in the server HTML until JS upgrades it).
- `data-nosnippet="true"` keeps the footer out of Google's rich snippets.
- Schema.org JSON-LD (`Organization` with `contactPoint` +1-800-692-7753, `WebSite` with `SearchAction` `https://www.apple.com/us/search/{search_term_string}`) sits at the footer boundary.

### 2.3 Footer CSS details (from [ac-globalfooter.built.css](https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css))

- Root: `#ac-globalfooter { --footer-background: rgb(245,245,247); --footer-text-color: rgba(0,0,0,.56); --footer-link-color: rgba(0,0,0,.72); --footer-directory-title-color: rgba(0,0,0,.88); --footer-border-color: rgba(0,0,0,.16); font-size:12px; line-height:1.3333733333; letter-spacing:-0.01em; font-family:"SF Pro Text","Myriad Set Pro","SF Pro Icons","Apple Legacy Chevron","Helvetica Neue","Helvetica","Arial",sans-serif; background: var(--footer-background); min-width:1024px (→320px ≤1044px); position:relative; z-index:1 }`. Dark theme variants exist for every variable (`rgb(29,29,31)` background, white-tinted text).
- `.ac-gf-content { margin:0 auto; max-width:980px; padding:0 22px }` (16px on ≤734px), with `max(22px, env(safe-area-inset-*))` variants — the canonical footer width.
- `.ac-gf-sosumi` (footnotes): `border-bottom:1px solid var(--footer-border-color); padding:17px 0 11px`.
- `.ac-gf-directory`: `display:flex; flex-wrap:nowrap; padding-top:20px;` columns `.ac-gf-directory-column { flex-basis:25% }`; column section titles 12px/600 weight, `margin-bottom:.8em`.
- Breakpoints used by the footer: **`max-width: 833px`** (directory becomes a vertical accordion), **`max-width: 1023px`** (legal block stacks), **`max-width: 1044px`** (min-width drops to 320px), **`max-width: 734px`**, **`max-width: 480px`**, plus `@media (prefers-contrast: more)`.
- **Mobile accordion** (≤833px): each section title becomes a full-width `<button>` (`padding-top/bottom:10px`, chevron `.ac-gf-directory-column-section-title-icon` rotating via `transition: transform .3s ease`); the list is hidden with `position:absolute; top:100%; transform:translateY(-100px); visibility:hidden; z-index:-1; will-change:transform` and revealed by JS adding `ac-gf-directory-column-expanded` ([ac-globalfooter.built.js](https://www.apple.com/ac/globalfooter/8/en_US/scripts/ac-globalfooter.built.js)). The JS also animates an SVG chevron `<polyline>` with `<animate attributeName="points" …>` (collapsed/halfway/expanded point sets). The `no-js` fallback renders lists statically visible.
- **Footer shop row**: `.ac-gf-footer-shop a { color: var(--footer-mini-shop-link-color); text-decoration: underline }` — the only underlined links in the footer, distinguishing them from the directory.
- **Legal row**: `.ac-gf-footer-end { display:flex; justify-content:space-between }` → `display:block` ≤833px; locale link (`United States`, with a `:before` pipe divider) and the legal link list float inline; on ≤833px the *small* locale clone (`.ac-gf-footer-locale-small`) shows above the legal text and the *large* one hides — the two-clone responsive trick.
- Focus styles reuse the system tokens: `outline:2px solid var(--sk-focus-color, #0071e3); outline-offset: var(--sk-focus-offset, 1px)`, with a `:after` inset hit-area on link/button focus-visible.

---

## 3. Implementation details

### 3.1 The JavaScript

- **globalheader.umd.js** (164 KB minified, UMD): a component framework (`globalnav` classes with lifecycle hooks `mounted()`), feature modules for: flyouts, compact menu, submenus, search, bag, and a shared "top nav" module. Confirmed internals:
  - `openFlyout`/`closeFlyout` add/remove the state classes, toggle `aria-expanded` on the trigger, add `mouseleave {once:true}` guards and document-level `keydown` listeners (Escape).
  - Triggers are located by attribute: `[data-topnav-flyout-trigger-regular]` (desktop: search/bag/logo) and `[data-topnav-flyout-trigger-compact]` (mobile menu items) — `trigger = { regular: el.querySelector("[data-topnav-flyout-trigger-regular]"), compact: el.querySelector("[data-topnav-flyout-trigger-compact]") }`.
  - Breakpoint detection via `window.matchMedia` (`viewportQuery`/`_viewportChangeHandler`), `retinaQuery`, `orientationQuery`; touch detection (`touchstart` once-listener) switches touch styling (`#globalnav.touch`).
  - Focus-method tracking: links with `data-focus-method="touch|mouse"` get `outline:none`; keyboard focus gets the `:focus-visible` ring — the JS classifies the last input modality.
  - Custom events `globalnav:onFlyoutOpen` / `onFlyoutWillOpen` / `onFlyoutWillClose` / `onFlyoutClose` (used by the analytics layer, whose config lives in `data-analytics-element-engagement-start/end` attributes on `<nav>`).
  - Search fetches suggestions and the store status via `fetch()`/`XMLHttpRequest` using `data-store-api` and page-level search config.
- **ac-globalfooter.built.js** (9.7 KB, browserified module): two behaviors — (1) directory accordion (creates disclosure widgets from `h3 > button` + list, toggling `ac-gf-directory-column-expanded`, animating the SVG chevron), (2) locale-link localization (`data-locale-current` attribute rewrites the current URL path to the other locale).

### 3.2 The CSS

- `globalheader.css` (170 KB) — namespaced reset under `#globalheader` (`#globalheader ul, #globalheader li, … { margin:0; padding:0 }`), then the component. Key patterns:
  - Design tokens as custom properties: `--r-globalnav-*` (runtime/logical), `--sk-*` (system), `--globalnav-*` (computed from `@supports`).
  - Focus ring default: `:focus-visible { outline:2px solid var(--sk-focus-color, #0071e3); outline-offset:var(--sk-focus-offset, 1px) }`; nav links override with `--sk-focus-offset:-7px` (inset ring).
  - Motion: `cubic-bezier(.4,0,.6,1)` (easeOutCubic-ish) everywhere; durations `0.24s` (medium), `0.32s` (flyout/curtain), `80ms` curtain delay; `--r-globalnav-flyout-rate: 0s` used to disable transition while the layout animates.
- `ac-globalfooter.built.css` (56 KB) — see §2.3.
- Both legacy CSS assets (see §4) and the new ones still ship together; nothing is built with Tailwind — all hand-authored selectors with BEM-ish prefixes (`globalnav-*`, `ac-gf-*`).

### 3.3 Typography

- The nav and footer never use system fonts directly; they stack **SF Pro** (served from `/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3`):
  - Nav links (desktop): `SF Pro Text, SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`, **12px**, `line-height:1`, `letter-spacing:-0.01em`, weight 400.
  - Nav links (≤833px): `SF Pro Display, …`, **28px**, weight 600.
  - Apple logo link: `SF Pro Text`, **17px**, weight 600, `letter-spacing:-0.022em`.
  - Search input: `SF Pro Display`, **24px** (28px mobile), weight 600.
  - Footer: `"SF Pro Text","Myriad Set Pro","SF Pro Icons","Apple Legacy Chevron","Helvetica Neue",…`, 12px, `letter-spacing:-0.01em`.
  - Localized overrides via `:lang()`: `SF Pro AR/JP/KR/TH/SC/HK/TC` + regional fallbacks (e.g. `SF Pro JP, SF Pro Display, SF Pro Icons, Hiragino Kaku Gothic Pro, … Meiryo`), and `letter-spacing:0em` for ar/ja/ko/zh.

### 3.4 Accessibility

Verified in markup + CSS + JS (see URLs in §1.1/§2.1):

- Landmarks with labels: `<nav aria-label="Global">`, `<footer role="contentinfo" aria-labelledby="ac-gf-label">`, `<nav class="ac-gf-directory" aria-label="Apple Directory">`, search flyout `role="search" aria-labelledby="globalnav-menubutton-link-search"`.
- Disclosure semantics: `aria-expanded`/`aria-controls` on menu trigger (`globalnav-menubutton-link-search`, `globalnav-menubutton-link-bag`, `globalnav-menutrigger-button` → `aria-controls="globalnav-list"`) and on the injected submenu buttons; toggled by JS on open/close.
- Buttons/links labeled via `aria-label` ("Shopping Bag", "Search apple.com", "Menu"/"Close" swapped at runtime, "Clear search", "Submit search", "Main menu" back button); decorative SVGs are `aria-hidden="true"`.
- `aria-live="polite"` on the search-results count; the results list itself gets a labeled region.
- Keyboard: Escape closes flyouts/menu; `tabindex="-1"` management during search transitions; `:focus-visible` rings (2px `#0071e3`) with `data-focus-method` suppression for mouse/touch; `-webkit-tap-highlight-color: transparent` on links; menu item `:focus` inside open menu does not dismiss (focus-in/focus-out guards on icon flyouts).
- Reduced motion is not explicitly gated in the shipped CSS (no `prefers-reduced-motion` rules found in globalheader.css / ac-globalfooter.built.css — but `globalnav-block-transitions` and `globalnav-curtain-noblur` classes exist for JS to apply). **Open question** — see §7.
- **No skip-to-content link** in the current homepage markup (searched the fetched HTML for `skip`/`skiplink`/`href="#main"` — absent). The old component historically shipped `ac-skiplink` patterns; the current page compensates with `<h1 class="visuallyhidden">` for the page title. The HIG Toolbars guidance (see §6) says nothing about web skip links; Apple's own web a11y approach here is worth matching with a proper skip link in eguidar regardless.

---

## 4. Legacy `ac-globalnav` (the component most write-ups describe)

The old shared component still exists and still serves at its original URL (HTTP 200, fetched 2026-08-10): `https://www.apple.com/ac/globalnav/3/en_US/styles/ac-globalnav.built.css` (77 KB) and `https://www.apple.com/ac/globalnav/7/en_US/scripts/ac-globalnav.built.js`. Key verified facts from that CSS:

- **Breakpoint emitter trick**: `#ac-gn-viewport-emitter { content:"large" }` with `@media (max-width:1023px){…"medium"}`, `(max-width:767px){…"small"}`, `(max-width:419px){…"xsmall"}` — an invisible element whose `content`/`:before` value tells the JS which breakpoint is active (`x-content` + `::before{content:…}`, read via computed style).
- Old bar: `#ac-globalnav { position:absolute; top:0; z-index:9999; height:48px; max-height:44px; background:rgba(0,0,0,0.8); -webkit-backdrop-filter:saturate(180%) blur(20px); backdrop-filter:saturate(180%) blur(20px) }` — **the same blur recipe as today**; old theme was the dark black bar (`rgba(85,85,85,0.5)` hover state, `#000` when the mobile menu opens).
- Old nav link row: `.ac-gn-list { display:flex; justify-content:space-between; height:44px }`; mobile: `position:absolute; top:44px; bottom:0; padding:0 48px; overflow-y:auto; visibility:hidden` with 1s visibility transition delay; search-show animation `ac-gn-list-searchshow 800ms both` (translateY(-50px)).
- Old markup (from the earlier era, class names in the source-code.fandom.com capture): `<nav id="ac-globalnav" class="no-js" role="navigation" aria-label="Global Navigation" data-store-api="/[storefront]/shop/bag/status" data-search-api="/search-services/suggestions/">` with `.ac-gn-list` > `.ac-gn-item` > `.ac-gn-link` (`ac-gn-link-store`, `ac-gn-link-search`…), search field `ac-gn-search-input`, `ac-gn-bag`, `ac-gn-segmentbar`; footer JS included a `localnav` counterpart (`/ac/localnav/9/styles/ac-localnav.built.css`, still linked on the homepage today).

Takeaway for eguidar: emulate the *current* pattern (server-rendered landmarks, tokens, `@supports`-gated blur, focus-visible rings) rather than the old `ac-gn` class soup; but the legacy page's breakpoint-emitter idea (CSS → JS viewport hand-off) is a proven technique if you need to share breakpoints with JS.

---

## 5. Official design guidance

- **HIG "Navigation bars" no longer exists as its own page**: `https://developer.apple.com/design/human-interface-guidelines/navigation-bars` returns **301 → `/design/human-interface-guidelines/toolbars`** (verified with curl; the page content is the Toolbars guidance, and it states "In iOS, a navigation-specific toolbar is sometimes called a navigation bar"). The Toolbars page was updated June 8, 2026 per its changelog.
- **Toolbars** (https://developer.apple.com/design/human-interface-guidelines/toolbars): toolbars provide commands/controls/navigation/search along a view edge; three content types (title, navigation controls incl. search, actions/bar items); avoid overcrowding — define which items move to an overflow/More menu as width narrows; "Reduce the use of toolbar backgrounds and tinted controls. Any custom backgrounds and appearances you use might overlay or interfere with background effects that the system provides" (directly relevant to Apple.com's transparent blurred bar); prefer standard components, monochromatic appearance, and hiding bars contextually for distraction-free experiences.
- **Sidebars** (https://developer.apple.com/design/human-interface-guidelines/sidebars): sidebars navigate between app areas; need lots of space — a tab bar is more compact; "sidebars can float above content in the Liquid Glass layer" (Apple's current system-design language — the website's frosted-glass nav is the web analogue); support customization and hiding; show ≤2 hierarchy levels with disclosure controls (relevant to Apple's flyout design: a section plus one submenu level); keep labels succinct.
- No HIG page addresses website footers directly; the footer's design language (small 12px text, muted `rgba(0,0,0,.56)` on `#F5F5F7`, centered 980px column) is an internal Apple.com pattern, not HIG-mandated. Apple publishes web-specific design tokens (`--sk-*`) inside the shipped CSS itself, which is the best "documentation" of the visual system.
- **WebKit on backdrop-filter** (https://webkit.org/blog/3632/introducing-backdrop-filters/, Brent Fulgham, 2015): the property was proposed by WebKit to the CSS Working Group (Filter Effects Module Level 2); it blurs the *content drawn behind* the element (not its background), then composites; the engine does the passes, but "the nature of this backdrop effect forces the engine to perform more rendering passes, which will have an impact on performance. Make sure you only use this feature where it is most necessary" — matching Apple.com's choice to gate the blur behind `@supports` and turn it off while flyouts are open. Also: at the time of the article the property required the `-webkit-` prefix (Apple.com's old CSS still has both prefixed and unprefixed; the new one ships unprefixed only).

---

## 6. Sources (all primary; all fetched 2026-08-10)

1. Live homepage HTML — https://www.apple.com/ (raw HTML fetched with curl; markup quoted verbatim in §1.2/§2.2)
2. New global-header CSS — https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css
3. New global-header JS — https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.umd.js
4. Footer CSS — https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css
5. Footer JS — https://www.apple.com/ac/globalfooter/8/en_US/scripts/ac-globalfooter.built.js
6. Legacy globalnav CSS — https://www.apple.com/ac/globalnav/3/en_US/styles/ac-globalnav.built.css (HTTP 200)
7. Homepage page-level CSS (checked for header hooks) — https://www.apple.com/v/home/a/styles/main.built.css
8. Font CSS — https://www.apple.com/wss/fonts?families=SF+Pro,v3|SF+Pro+Icons,v3
9. HIG Toolbars — https://developer.apple.com/design/human-interface-guidelines/toolbars
10. HIG Sidebars — https://developer.apple.com/design/human-interface-guidelines/sidebars
11. HIG navigation-bars (301 redirect, verified) — https://developer.apple.com/design/human-interface-guidelines/navigation-bars
12. WebKit blog: Introducing Backdrop Filters — https://webkit.org/blog/3632/introducing-backdrop-filters/
13. Historical markup reference (used only to name old `ac-gn-*` classes; superseded by asset #6) — https://source-code.fandom.com/wiki/Apple.com_Source_Code

Behavioral checks (headless Chrome 126 + Puppeteer against the live site): fixed positioning while scrolled, hover flyout open (class list + 552px flyout with "Explore All Mac / MacBook Neo / MacBook Air / MacBook Pro / iMac…"), mobile menu open/Close label swap, search flyout autofocus + `aria-expanded` + live "Suggested Links"/"10 total results" results, computed `backdrop-filter: saturate(1.8) blur(20px)`.

---

## 7. Unverified / open questions

- **Skip link**: current US homepage markup contains no skip-to-content link (searched `skip`, `skiplink`, `#main` in the fetched HTML; none found). Historical pages used `ac-skiplink`; I did not crawl other apple.com pages to check whether any variant of the header includes one.
- **Reduced motion**: no `prefers-reduced-motion` rules appear in globalheader.css or ac-globalfooter.built.css; the JS ships `globalnav-block-transitions` / `globalnav-curtain-noblur` classes, but I did not trace whether reduced-motion users actually get them applied (would require more code reading).
- **"Do Not Sell My Personal Information" / "Your Privacy Choices" links**: absent from the current US homepage footer (only Privacy Policy, Terms of Use, Sales and Refunds, Legal, Site Map). California-specific/other-region footers were not fetched, so I can't confirm where those links now live (they were historically conditionally injected per-region by ac-globalfooter JS).
- **Exact bag-badge polling cadence and search API endpoint**: the JS reads endpoints from page config (`data-store-api`, search config with `apiRequestURL`/`searchSrc`); I did not reverse-engineer the exact URLs/cadence. (Old markup used `/search-services/suggestions/` and `/shop/bag/status`.)
- **Font delivery details**: the `/wss/fonts` response returned 0 bytes to curl (likely UA/header gating), so exact font payloads (woff2 variants, unicode ranges) are unverified; the CSS font stacks are verified, the served files are not.
- **Nav "sticky" mechanics**: the nav's `position` is `absolute` in CSS and becomes `fixed` at runtime (verified), but I did not trace which JS code performs the upgrade or whether it's conditional (e.g. only when no globalmessage segment).
- Apple.com caches/versions: everything above reflects the exact HTML/CSS/JS snapshot fetched on 2026-08-10; the header is explicitly versioned (`global-header/v1`, `globalfooter/8`, `globalnav/3`), so details will drift.
