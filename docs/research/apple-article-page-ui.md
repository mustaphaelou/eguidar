# Apple Newsroom article page UI — research findings for the eguidar blog article surface

> **Research-only document.** Every factual claim below is traced to a primary source: the **live HTML served by apple.com Newsroom article pages**, the **CSS and JavaScript bundles those pages link to**, Apple's **own Atom/RSS feed** used only to discover real article URLs, and Apple's first-party global header / local nav / footer bundles. **Retrieval date for all sources: 27 October 2026 (UTC).** Everything quoted under "Evidence" is verbatim from a minified bundle or from served markup; quotes are verbatim, only line breaks inserted — any inserted break is marked in the comment above the block, and no character was changed. Third-party blogs were **not** used as evidence. No application code, schema, or configuration in this checkout was modified.
>
> **Trademark and copyright caution.** This document describes Apple's *editorial design language* for inspiration only. Never copy Apple assets, Apple Newsroom copy text, SF Pro font files, or pixel-identical layouts. Apple's font CSS carries `/* (C) 2019 Apple Inc. All rights reserved. */` and the SF Pro family is licensed for use in app UI on Apple platforms, not for redistribution as a web font. Apple's article photographs are licensed editorial assets, not templates.
>
> **Companion docs.** This file sits alongside `apple-product-page-ui.md` (on `main`), which covers the marcom product templates, and `apple-homepage.md` (exists on branch `research/apple-homepage`), which covers the homepage tile grid. Where this document and the product-page doc disagree on a token (e.g. button blue `#0071e3` is a *product* token and does not appear in article chrome), the article bundles here are authoritative for the article surface.

## Summary

- **The article template is `articlev2`.** Article pages load exactly four stylesheets — `globalheader.css`, `ac-localnav.built.css`, `ac-globalfooter.built.css`, and `/newsroom/styles/articlev2.built.css` (928,952 B) — plus `/newsroom/scripts/articlev2.built.js` (962,944 B) and `main.built.js`. The Newsroom index page is a React shell that loads twelve different stylesheets and **contains no article `<a href>` at all**; real article URLs must be discovered from the feed `https://www.apple.com/newsroom/rss-feed.rss` (Atom, 18,611 B). [R1][R2][R3][R6][R9]
- **The skeleton is `main#main.main` → `section` → `article.article` → `aside.footertile`.** There is **no `id="article"`** on the article element; the string `article` that looks like an id is the tail of `data-analytics-activitymap-region-id="article"`. The "More from Apple Newsroom" block is an `<aside>` whose `more-from-apple-newsroom` string is likewise an analytics attribute, not an id; only `#latest-news` (on the related `<h2>`) and `#footertile-name` are real ids. [R3][R4]
- **The measure is 653 px inside a 980 px container**, and the ratio is exactly **1.5:1** (980 / 653 = 1.5008). Both are absolute px at desktop, **576 px / 692 px at ≤1068 px**, and **87.5 % / 100 % at ≤734 px**. Media is therefore **1.5× the text column**, and captions snap *back* to the measure: `.image.body-copy-wide.image-fullbleed .image-description{width:653px;margin-inline-start:auto;margin-inline-end:auto}`. That caption-versus-image width mismatch is the single most imitable detail of the template. [R6]
- **One vertical rhythm value governs everything:** `.component{margin-top:44px;margin-bottom:44px}`, collapsing to **36 px at ≤1068** and **32 px at ≤734**. Every figure, pagebody, gallery, pull-quote and download box is a `.component` and receives that spacing — there are no per-component margins to memorise. [R6]
- **Type is a discrete ladder with an optical-size font switch.** The `<h1>` is 48 px / 1.0834933333 / 700 / `-0.003em`, then 40 px / 1.1 / 700 / `0em`, then 32 px / 1.125 / 700 / `+0.004em`. Body copy is **19 px SF Pro Display** at desktop but **17 px SF Pro Text** at ≤1068 — Apple switches the optical cut, not just the size. There is **no `clamp()`** anywhere in the article type ladder. [R6]
- **There is no byline.** The header is eyebrow (category + date) → `<h1>` → deck → share row, in that DOM order, with the date as a `<span>` and the deck as a bare text node inside `.component-content` (not a `<p>`). Authorship appears only as a dateline span inside the body: `<span class="pagebody-location">CUPERTINO, CALIFORNIA</span>` at 14 px uppercase. [R3][R6]
- **The palette is five greys and one blue:** `#1d1d1f` text, `#6e6e73` meta, `#86868b` meta-on-dark, `#d2d2d7` hairlines, `#f5f5f7` panel fill, on `#ffffff`; links `#0066cc`, dark-theme links `#2997ff`. Measured contrast: body **16.83:1**, meta **5.07:1**, link **5.57:1**, hairline **1.51:1** (decorative). **There is no `prefers-color-scheme` support at all** — dark mode is a hand-applied `<body class="page-article theme-dark">` used by gallery/PHOTOS pieces. [R3][R4][R6][R7]
- **The related-articles block is a ruled list, not a card grid.** `.article-list{border-top:1px solid #d2d2d7;padding-top:52px}` and each `.article-list__item` is a full-width row separated by `border-bottom:1px solid #d2d2d7`, with a **171 px** thumbnail (`93 px` at ≤734, `10 px` radius) at `padding-inline-end:24px` and a 19 px/700 title. There are exactly **3** rows on the articles inspected. [R3][R6]
- **Hover is a 400 ms image scale plus a scrim, never a border or shadow:** `.article-list__item__link:hover img{transform:scale(1.05)}` over `transition:transform 400ms cubic-bezier(0.4,0,0.25,1)`, with a `picture::after` overlay going `rgba(0,0,0,.15)` at `opacity:1`. The **same rules fire on `:focus[data-focus-method=key]`**, so keyboard users get the identical affordance. [R6]
- **Motion is essentially absent from the article body.** The only JS components instantiated on a standard article are `CopyText`, `MixinGallery` and `ShareSheet`; there is **no entrance animation, no scroll reveal, no progress bar, and no sticky share rail**. The `fullbleedsticky`/`.reveal` curtain machinery exists in the bundle but is not used on any article inspected, and video autoplay is gated on `prefers-reduced-motion` with an `autoPlayWithReducedMotion: false` default. [R3][R6][R9]
- **A drop cap exists in CSS and is dead code.** `.pagebody-copy:first-child .first-letter{font-size:84px;float:left;margin-inline-end:8px;line-height:.8928571429}` is present in the bundle, but `first-letter` appears **0 times** in all four articles fetched — the CMS never emits it. Do not treat it as part of the live look. [R6][R3][R4][R5][R12]
- **Three distinct article templates exist**, and they are distinguishable by one body class: `page-article` + `articlev2.built.css` (the standard template, light or `theme-dark`), `page-article page-article--quick-read` + `quick-read.built.css` (a short "Quick Read" with `.container-quickread` and **no deck**), and the archive/list page (a completely different `.filter-bar` template with no article at all). [R3][R4][R5][R6][R8][R14]

## 0. Method and limits

Everything below comes from static inspection: I fetched each article's HTML, extracted every `<link rel="stylesheet">` and `<script src>`, downloaded those bundles, and read the rules. Because the Newsroom index renders its article list client-side (91 anchors, none pointing at an article), I discovered real article URLs from Apple's own Atom feed at `/newsroom/rss-feed.rss` — first-party, and the only reliable URL source. [R1][R2]

For the CSS I wrote a small brace-tracking parser so that every declaration could be reported **with its enclosing `@media` block**, rather than grepping minified one-liners and guessing the breakpoint. All numbers in §3, §4 and §8 come from that pass and were cross-checked against the raw bytes.

What this method **cannot** see, and is therefore absent or explicitly flagged: computed styles after JavaScript runs (the gallery carousel is driven by `MixinGallery`; I read the CSS and the server-rendered markup instead), the live appearance of hover/focus (only declared values), anything behind a locale not served (only `en-US`, `fr-FR` and `ar-SA` were fetched), and rendered text metrics such as actual line counts.

Two honest caveats about the bundle itself: it contains **unprocessed preprocessor tokens** — `.body-copy-wide .component-content{width:component-content-width}` and `--sk-quote-copy-color:utilities.$quote-copy-color` are emitted literally, so those declarations are invalid CSS and are dropped by the browser. Where a value mattered I looked for the next rule that actually parses, and said so. The bundle also ships **the same block twice** (e.g. the `.image-sharesheet` radius cascade appears at byte offsets 324,562 and 836,508, with identical content), which is why some counts double.

### Sources inspected

| Page | URL | Served |
|---|---|---|
| Newsroom index [R1] | `https://www.apple.com/newsroom/` | 200, 123,835 B, `<title>Newsroom - Apple</title>` |
| Newsroom Atom feed [R2] | `https://www.apple.com/newsroom/rss-feed.rss` | 200, 18,611 B, `<title>Apple Newsroom</title>` |
| Press release article [R3] | `https://www.apple.com/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` | 200, 255,008 B, `<title>Apple gives iPad mini its biggest update ever - Apple</title>` |
| Gallery / PHOTOS article [R4] | `https://www.apple.com/newsroom/2026/10/iphone-duo-arrives-at-apple-store-locations-worldwide/` | 200, 303,132 B, `<title>iPhone Duo arrives at Apple Store locations worldwide - Apple</title>` |
| Quick Read article [R5] | `https://www.apple.com/newsroom/2026/10/siri-ai-is-available-in-more-languages-starting-today/` | 200, 134,498 B, `<title>Siri AI is available in more languages starting today - Apple</title>` |
| Article CSS bundle [R6] | `https://www.apple.com/newsroom/styles/articlev2.built.css` | 200, 928,952 B |
| Shared site CSS [R7] | `https://www.apple.com/newsroom/styles/site.built.css` | 200, 122,042 B |
| Quick Read CSS [R8] | `https://www.apple.com/newsroom/styles/quick-read.built.css` | 200, 213,420 B |
| Article JS bundle [R9] | `https://www.apple.com/newsroom/scripts/articlev2.built.js` | 200, 962,944 B |
| Shared site JS [R10] | `https://www.apple.com/newsroom/scripts/main.built.js` | 200, 213,318 B |
| French index [R11] | `https://www.apple.com/fr/newsroom/` | 200, 126,309 B, `<title>Newsroom - Apple (FR)</title>` |
| French article [R12] | `https://www.apple.com/fr/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` | 200, 251,772 B, `<title>Apple dévoile la plus importante mise à jour jamais apportée à l’iPad mini - Apple (FR)</title>` |
| French Atom feed [R13] | `https://www.apple.com/fr/newsroom/rss-feed.rss` | 200, 19,643 B |
| Archive list page [R14] | `https://www.apple.com/newsroom/archive/` | 200, 322,833 B, `<title>All Topics Archive - Apple</title>` |
| Room page (Apple Services) [R15] | `https://www.apple.com/newsroom/apple-services/` | 200, 134,753 B, `<title>Apple Services - Newsroom - Apple</title>` |
| Arabic article (RTL) [R16] | `https://www.apple.com/sa-ar/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` | 200, 248,718 B |
| RTL article CSS [R17] | `https://www.apple.com/newsroom/styles/articlev2.rtl.built.css` | 200, 928,952 B (**md5 identical to [R6]**) |
| Global header CSS [R18] | `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` | 200, 170,263 B |
| Local nav CSS [R19] | `https://www.apple.com/ac/localnav/4/styles/ac-localnav.built.css` | 200, 80,958 B |
| Global footer CSS [R20] | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` | 200, 56,408 B |

No redirect was required for any source above: everything served **200** directly, including the Arabic locale. `web.archive.org` was not needed.

## 1. Page skeleton

### 1.1 Body-level outline

The `<body>` carries one class (two on Quick Read, three on dark gallery pieces), and the page is a flat sequence of siblings rather than a nested app shell. Verbatim outline, depth ≤4, attribute noise trimmed: [R3]

```html
<body class="page-article">
<div>
  <div id="globalheader">
    <aside id="globalmessage-segment" class="globalmessage-segment">
    <nav id="globalnav" class="globalnav no-js">
    <div id="globalnav-curtain" class="globalnav-curtain">
    <div id="globalnav-placeholder" class="globalnav-placeholder">
<input type="checkbox" id="ac-ln-menustate" class="ac-ln-menustate" aria-hidden="true"/>
<div id="ac-ln-sticky-placeholder" class="css-sticky">
<nav id="ac-localnav" class="no-js ac-localnav ac-localnav-scrim" role="navigation" aria-label="Newsroom">
  <div class="ac-ln-wrapper">
    <div class="ac-ln-background">
    <div class="ac-ln-content">
    <div id="search-tray" class="search-tray">
<div id="search-curtain" class="search-curtain">
<div>
<main id="main" class="main" role="main">
  <section>
    <article class="article" data-analytics-activitymap-region-id="article">
    <aside class="footertile" data-analytics-activitymap-region-id="router" aria-labelledby="footertile-name">
<div class="webpush-notification-parent">
<div>
  <footer id="ac-globalfooter" class="no-js">
    <div class="ac-gf-content">
```

Four things to note in that outline:

- The article is wrapped in a **classless `<section>`**; the `<article>` itself has only `class="article"`. There is no `#article` id. [R3]
- `aside.footertile` is a **sibling of `<article>` inside the same `<section>`**, not part of the article and not part of the footer. It is the "router" back into Newsroom. [R3]
- The local nav is a **separate `<nav id="ac-localnav">`** with its own sticky placeholder and scrim class, distinct from `#globalnav`. [R3][R19]
- A `<span id="opens-in-new-window" class="large-hide">opens in new window</span>` sits immediately before the `<section>`, i.e. a page-level announcement for offsite links rather than per-link text. [R3]

### 1.2 Article header stack

Verbatim, from `<div class="article-header">` to the first figure: [R3]

```html
<div class="article-header">
  <div class="category component">
    <div class="component-content">
      <div class="category-eyebrow">
        <span class="category-eyebrow__category category_release">PRESS RELEASE</span>
        <span class="category-eyebrow__date">October 26, 2026</span>
      </div>
    </div>
  </div>
  <div class="pagetitle component">
    <div class="component-content">
      <h1 class="hero-headline">Apple gives iPad mini its biggest update ever</h1>
    </div>
  </div>
  <div class="article-subhead component">
    <div class="component-content">
      Featuring a stunning OLED display in an even thinner and lighter design, …
    </div>
  </div>
  <div class="sharesheet component" data-component-list="ShareSheet" data-clipboard-text="Copied to clipboard">
    <div class="component-content">
      <div class="sharesheet-content tooltip-wrapper">
        <div class="sharesheet-options-open">
          <button type="button" class="icon-share icon" aria-label="Open share options"></button>
        </div>
        <ul class="sharesheet-options" data-analytics-content="Apple gives iPad mini its biggest update ever">
          <li class="social-option"><button class="icon icon-facebook social-icon" aria-label="Share this article via Facebook (opens in new window)"></button></li>
          <li class="social-option"><button class="icon icon-x social-icon" aria-label="Share this article via X (opens a new window)"></button></li>
          <li class="social-option"><button class="icon icon-mail social-icon" aria-label="Share this article via Mail (opens in new window)"></button></li>
          <li class="social-option"><button class="icon icon-link social-icon" aria-label="Share via link"></button></li>
        </ul>
        <div class="sharesheet-options-close">
          <button class="icon icon-close" title="close sharesheet" aria-label="close share"></button>
        </div>
        <div class="sharesheet-link-container" aria-hidden="true">
          <div class="sharesheet-link-content">
            <input class="link-text" value="https://nr.apple.com/Dx6L0R3GJ1" tabindex="-1" readonly/>
            <button class="icon icon-close sharesheet-link-close" title="close" aria-label="close link" tabindex="-1"></button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

The **repeating unit of every block** is `<name> component` → `.component-content`. That is the whole layout system: `.component` owns the outer width (980 px, 692 px, or the 414 px phone cap) and the 44 px rhythm; `.component-content` owns the inner measure (653 px, 576 px, 87.5 %). Blocks then add modifiers (`.image-big`, `.image-fullbleed`, `.body-copy-wide`, `.gallery-hero`). [R3][R6]

*Attribute note: the block above keeps every element, class and `aria-*` attribute but elides the analytics hooks (`data-analytics-title`, `data-analytics-content` on siblings, `data-href`) and the share sheet's `id`, purely for readability. Structure and semantics are exact; the elided attributes carry no layout.*

### 1.3 Article body stack

Ordered, with each block's real class string: [R3]

```html
<figure class="image component image-big image-fullbleed body-copy-wide" aria-label="Media, The new iPad mini in the palm of a hand.">
  <div class="component-content">
    <div class="image-sharesheet" data-analytics-activitymap-region-id="…">
      <style type="text/css">/* per-breakpoint padding-top aspect ratio */</style>
      <div><picture class="picture"><source/><source/><img class="picture-image" alt="…"/></picture></div>
    </div>
    <div class="image-description">
      <div class="image-caption">…</div>
      <a href="…zip" class="icon-arrowdown icon nr-cta-download" download aria-label="Download media, …"></a>
    </div>
  </div>
</figure>

<div class="pagebody  text component">
  <div class="component-content">
    <h2 class="pagebody-header"><strong>Thinner and Lighter Than Ever</strong></h2>
    <div class="pagebody-copy">At 5.4 mm thin, …</div>
    <div class="pagebody-copy">…</div>
  </div>
</div>

<div class="gallery component gallery-hero body-copy-wide" role="group" aria-label="gallery" data-component-list="MixinGallery" id="ipad-mini-finishes-and-rating">
  <div class="component-content">
    <nav role="presentation" class="dotnav"><ul role="tablist">…</ul></nav>
    <div class="gallery-images">
      <div class="gallery-item" aria-labelledby="gallery-dotnav-…"><figure role="presentation" class="image-shareheet-gallery">…</figure></div>
    </div>
    <style type="text/css">.paddlenav.nav-… { top: 327.0px; } @media only screen and (max-width: 1068px) { … top: 231.0px; }</style>
    <nav role="presentation" class="paddlenav nav-…">
      <ul>
        <li><button class="paddlenav-arrow paddlenav-arrow-previous"><span class="vo-text">previous</span></button></li>
        <li><button class="paddlenav-arrow paddlenav-arrow-next"><span class="vo-text">next</span></button></li>
      </ul>
    </nav>
  </div>
</div>

<div class="pullquote component">
  <div class="component-content">
    <aside class="quote" aria-label="Article Quote 1">
      <p class="pullquote__text no-quotes"><span>Apple Domain NORTHSIDE, Austin</span></p>
    </aside>
  </div>
</div>

<div class="pagebody pagebody-small text component">…</div>

<div class="nr-article-share" data-analytics-activitymap-region-id="sharesheet-footer">
  <div class="nr-article-share__header component"><div class="component-content">Share article</div></div>
  <div class="sharesheet component" data-component-list="ShareSheet">…</div>
</div>

<div class="docsanddownloads text component">
  <div class="component-content">
    <ul class="docsanddownloads__list">
      <li class="docsanddownloads__item">
        <div class="docsanddownloads__icon-wrapper"><span class="docsanddownloads__icon docsanddownloads__icon--images"></span></div>
        <div class="docsanddownloads__text-wrapper"><div class="docsanddownloads__text">…</div></div>
        <a class="docsanddownloads__link" …></a>
      </li>
    </ul>
  </div>
</div>

<aside class="component legal-info" aria-label="Legal information">
  <div class="component-content">
    <div class="legal-info__entry">
      <h3 class="legal-info__heading">…</h3>
      <p class="legal-info__body">…</p>
    </div>
  </div>
</aside>

<div class="sosumi text component">
  <div class="component-content"><ol><li>…</li></ol></div>
</div>

<div class="presscontacts component">
  <div class="component-content">
    <h2 class="presscontacts-headline">Press Contacts</h2>
    <div class="contacts-container">
      <div class="contactinfo">
        <p class="contactinfo-title">…</p>
        <p class="contactinfo-text">…</p>
        <p class="contactinfo-text"><a>…</a></p>
      </div>
    </div>
  </div>
</div>
```

The `pullquote` block is verbatim from the PHOTOS article, which is the only one of the four that uses it; its `<aside>` carries an **auto-numbered** `aria-label="Article Quote 1"`. [R4]

### 1.4 Article footer stack

```html
<aside data-analytics-activitymap-region-id="more-from-apple-newsroom" aria-labelledby="latest-news">
  <div class="component">
    <div class="article-list component-content">
      <div class="section-headline-container">
        <h2 id="latest-news" class="article-list__heading">More from Apple Newsroom</h2>
      </div>
      <div class="article-list__item">
        <a class="article-list__item__link" href="/newsroom/2026/10/…/">
          <div class="article-list__item__img-wrapper">
            <picture class="no-dl"><source/><source/><img …/></picture>
          </div>
          <div class="article-list__item__content">
            <div class="article-list__item__category ">UPDATE</div>
            <h3 class="article-list__item__title">Formula 1® United States Grand Prix™ streams live on Apple TV this weekend</h3>
            <div class="article-list__item__date">October 22, 2026</div>
          </div>
        </a>
      </div>
      <!-- ×3 -->
    </div>
  </div>
</aside>
</article>

<aside class="footertile" data-analytics-activitymap-region-id="router" aria-labelledby="footertile-name">
  <a class="block" href="/newsroom/">
    <div class="footertile-copy">
      <figure class="footertile-copy-image"><svg class="logo-nr" …></svg></figure>
      <div class="footertile-copy-headline" id="footertile-name">…</div>
      <div class="footertile-copy-cta block-link">…</div>
    </div>
  </a>
</aside>
```

Note the nested closing tag: `</aside>` (related) → `</article>` → `aside.footertile`. The related card title is an **`h3`**, the section title an **`h2`**, and the whole row is wrapped in a single `<a>` — so the card is one link target, not a link inside a card. [R3]

### 1.5 Which template is current, and how I know

| Body class | Stylesheet | Shape | Verdict |
|---|---|---|---|
| `page-article` [R3] | `articlev2.built.css` (928,952 B) [R6] | `.article-header` → figure/pagebody alternating → `.article-list` → `.footertile` | **The current canonical template** — used by the newest press release, the PHOTOS piece (plus `theme-dark`), and the French translation of the same article [R12] |
| `page-article theme-dark` [R4] | same bundle [R6] | identical, dark via `.theme-dark` tokens | A variant of the current template, **not** an older one |
| `page-article page-article--quick-read` [R5] | `quick-read.built.css` (213,420 B) [R8] | `.container-quickread` → `.article-quickread` → `.featured-header` (`.chiclet` + category + `h1` + sharesheet), **no `.article-subhead`** | A deliberately reduced sibling for short items; `.article-quickread .article-header{margin-top:0}` [R8] |
| *(none)* on `<body>` [R14] | — | `section#archive.archive` + `.filter-bar` + `.loading-container` | The **list/archive** template, not an article page |

The evidence that `articlev2` is current rather than legacy: it is what the **most recent** press release fetched (26 October 2026) loads, and the French locale serves the *same* bundle name for the translated article [R12] — an older template would not still be receiving new locale builds.

## 2. Header / masthead

DOM order is fixed and short: **eyebrow → `<h1>` → deck → share**. There is nothing else. [R3]

| Slot | Element | Class | Notes |
|---|---|---|---|
| Wrapper | `<div>` | `.article-header` | `margin-top:52px` → 40 → 32 [R6] |
| Eyebrow group | `<div>` | `.category-eyebrow` | inside `.category.component`, whose `margin-bottom:20px` is the eyebrow→headline gap [R6] |
| Kicker | `<span>` | `.category-eyebrow__category.category_release` | `text-transform:uppercase`, `color:#6e6e73`, 12 px/700 [R6] |
| Date | `<span>` | `.category-eyebrow__date` | 14 px/600, `color:#6e6e73`, `margin-top:4px`, `display:block` [R6] |
| Headline | `<h1>` | `.hero-headline` | only `<h1>` on the page (count = 1) [R3] |
| Deck | *(bare text node)* | `.article-subhead` → `.component-content` | no `<p>`, no `<h2>`; `.article-subhead{margin-top:20px}` [R3][R6] |
| Share | `<div>` | `.sharesheet.component` | 4 icon buttons + hidden copy-link field [R3] |

Consequences worth stating plainly:

- **The deck is not a heading and not a paragraph.** It is a text node directly inside a `<div>`, styled by `.article-subhead`. Copying the *look* with a `<p>` is fine for eguidar, but the DOM here gives it no semantic role at all (inferred: it is not announced as a summary by any assistive technology). [R3]
- **There is no byline, no author avatar, no reading time, no "updated" timestamp.** `byline` and `read-time` appear **0 times** in all four articles. The only human attribution is the body dateline `CUPERTINO, CALIFORNIA`, an uppercase 14 px/700 span. [R3][R4][R5][R12][R6]
- **Everything except the `<h1>` is decorative or meta.** The kicker and date are spans inside a `<div>`; the category text (`PRESS RELEASE`, `PHOTOS`, `QUICK READ`) is the only machine-readable signal, and it lives in the class name (`category_release`, `category_photos`, `category_quickread`) as well as the text. [R3][R4][R5]
- The share row's four buttons are `<button>` elements with **no `<a>`** — the destinations live in `data-href` and are opened by JS, which is why the popup-warning text is baked into each `aria-label` ("opens in new window"). [R3]

## 3. Measure and grid

### 3.1 The two-width system

This is the structure that produces the look, and it is three rules: [R6]

```css
.component{margin-inline-start:auto;margin-inline-end:auto;width:980px}
.component-content{margin-inline-start:auto;margin-inline-end:auto;width:653px}
.image-big .component-content{width:980px}
```

| Token | Desktop | ≤1068 px | ≤734 px |
|---|---|---|---|
| Outer container `.component` / `.viewport-content` | **980 px** | **692 px** | **100 %, `max-width:414px`** |
| Text measure `.component-content` | **653 px** | **576 px** | **87.5 %** |
| Hero media `.image-big .component-content` | **980 px** | **692 px** | **100 %** |
| Caption under hero `.image-description` | **653 px** (`margin-inline:auto`) | **576 px** | **87.5 %** |
| Related thumb `.article-list__item__img-wrapper` | **171 px** (`padding-inline-end:24px`) | 171 px | **93 px** (`padding-inline-end:16px`) |

Arithmetic (inferred from the declarations above, not declared anywhere): at desktop the text column sits **163.5 px** in from each side of the 980 px container — `(980 − 653) / 2`. At ≤1068 it is `(692 − 576) / 2 = 58 px`. The media/text ratio is **1.5008 at desktop** and **1.2014 at tablet** — so the breakout *narrows* as the viewport shrinks, then disappears at ≤734 where text is 87.5 % and media 100 % of the same container.

The `max-width:414px` on `.component` at ≤734 is what makes phone media genuinely edge-to-edge rather than merely wide: `.component{max-width:414px;width:100%;margin-inline-start:auto;margin-inline-end:auto}`. At a 390 px viewport the component is 390 px, the image is 390 px, and the text is 87.5 % of 390 = 341 px. That also explains the radius cascade in §6.5. [R6]

### 3.2 The vertical grid

```css
.component{margin-top:44px;margin-bottom:44px}
@media(max-width: 1068px){.component{margin-top:36px;margin-bottom:36px}}
@media(max-width: 734px){.component{margin-top:32px;margin-bottom:32px}}
```

Two exceptions exist, both deliberate: `.article-header{margin-top:52px}` (40/32) so the masthead gets more air than a body block, and `.pullquote.component{margin-top:72px;margin-bottom:72px}` (64/52) so a pull-quote is fenced off. [R6]

### 3.3 Breakpoints

The article bundle uses exactly **four** widths, plus two micro-breaks: [R6]

| Breakpoint | Occurrences in `articlev2.built.css` | Role |
|---|---|---|
| `max-width: 734px` | 401 | phone: text 87.5 %, media 100 %, radius squared, 32 px rhythm |
| `max-width: 1068px` | 287 | tablet: everything steps down one, Display→Text optical switch |
| `min-width: 1441px` | 44 | **does not change the article measure** — used for `br.xlarge{display:block}` line-break utilities and `.image.image-wide` caps (`max-width:1920px`) |
| `max-width: 415px` | 22 | drops figure radius to 0 because media is truly edge-to-edge there |
| `max-width: 480px`, `min-width: 1922px` | 4 / 3 | edge cases: strapline and ultra-wide image caps |

`min-width: 1441px` is the surprise: on the **product** pages it is a real type/layout step, but for articles `.viewport-content` and `.component` are re-declared at `width:980px` unchanged inside it. So **above 1441 px the article simply centres its 980 px column and nothing else changes**. [R6]

## 4. Typography ladder

Every value below is a verbatim tuple from `articlev2.built.css`, read with its enclosing media block. Format is `size / line-height / weight / letter-spacing`, then the family. [R6]

| Role | Selector | Desktop | ≤1068 px | ≤734 px |
|---|---|---|---|---|
| Kicker | `.category-eyebrow` | `12px / 1.3333733333 / 700 / -0.01em` — SF Pro **Text** | same | same |
| Date | `.category-eyebrow__date` | `14px / 1.2857742857 / 600 / -0.016em` — Text | same | same |
| Headline | `.pagetitle .hero-headline` | `48px / 1.0834933333 / 700 / -0.003em` — Display | `40px / 1.1 / 700 / 0em` | `32px / 1.125 / 700 / +0.004em` |
| Deck | `.article-subhead` | `24px / 1.1666666667 / 500 / +0.009em` — Display | `21px / 1.1904761905 / 500 / +0.011em` | *(no 734 rule — stays 21 px)* |
| Body | `.pagebody` | `19px / 1.4211026316 / 400 / +0.012em` — **Display** | `17px / 1.4705882353 / 400 / -0.022em` — **Text** | *(no 734 rule — stays 17 px)* |
| Section head | `.pagebody-header` | `24px / 1.1666666667 / 700 / +0.009em` — Display | `21px / 1.1904761905 / 700 / +0.011em` | *(no 734 rule)* |
| Spec list | `.pagebody-small .pagebody-copy` | `14px / 1.4285914286 / 400 / -0.016em` — Text | same | same |
| Pull-quote | `.pullquote__text` | `40px / 1.1 / 700 / 0em` — Display, centred | `32px / 1.125 / 700 / +0.004em` | `28px / 1.1428571429 / 700 / +0.007em` |
| Pull-quote credit | `.quote-credit` | `17px / 1.2353641176 / 600 / -0.022em` — Text (the rule declares `400` then `600`; the later wins) | — | — |
| Caption | `.image-description` | `12px / 1.3333733333 / 600 / -0.01em` — Text | same size, `margin-top:12px` | same |
| Gallery caption | `.gallery-caption` | `12px / 1.3333733333 / 600 / -0.01em` — Text | `margin-top:12px` | same |
| Dateline | `.pagebody-location` | `14px / 1.4285914286 / 700 / -0.016em` — Text, uppercase | same | same |
| Footnote | `.sosumi` | `12px / 1.3333733333 / 400 / -0.01em` — Text | same | same |
| Related section head | `.article-list__heading` | `24px / 1.1666666667 / 700 / +0.009em` — Display | `21px / 1.1904761905 / 700 / +0.011em` | *(no 734 rule)* |
| Related card title | `.article-list__item__title` | `19px / 1.2105263158 / 700 / +0.012em` — Display | `17px / 1.2353641176 / 700 / -0.022em` — Text | *(no 734 rule)* |
| Related card kicker | `.article-list__item__category` | `12px / 1.3333733333 / 600 / -0.01em` — Text, uppercase | same | same |
| Related card date | `.article-list__item__date` | `14px / 1.2857742857 / 600 / -0.016em` — Text | same | same |
| Footer tile head | `.footertile-copy-headline` | `19px / 1.2105263158 / 700 / +0.012em` — Display, `#6e6e73`, centred | `17px / 1.2353641176 / 700 / -0.022em` — Text | — |
| Share label | `.nr-article-share__header` | `19px / 1.2105263158 / 700 / +0.012em` — Display | — | — |

Three patterns fall out of that table, and they are the ones worth internalising:

1. **The Display→Text switch is tied to size, not to breakpoint per se.** Everything ≥21 px uses `SF Pro Display`; 19 px body uses Display at desktop but Text at ≤1068 when it drops to 17 px; everything ≤17 px uses Text. This is the optical-size rule made literal: Apple never sets 17 px in Display and never sets 24 px in Text. [R6]
2. **Tracking is a function of size, and it flips sign.** Negative above ~40 px (`-0.003em` at 48 px), zero at 40 px, positive below (`+0.004em` at 32 px, `+0.009em` at 24 px, `+0.012em` at 19 px). Then the *small* sizes go negative again (`-0.01em` at 12 px). The curve is a U, not a monotonic ramp. [R6]
3. **The deck is weight 500, the headline 700, and nothing else is bold.** No article element uses 800 or 900; `.pagebody-header` uses 700, captions 600. [R6]

Font stack, verbatim: `"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif` and the `…Text` variant. Every one of those rules is followed by a `:lang()` fan-out that swaps the family for JP/KR/TH/AR/SC/HK/TC and, for CJK/Thai, replaces the line-height — the delivered CSS carries those overrides inline rather than in a separate sheet. [R6]

## 5. Colour and theme

### 5.1 The palette, by frequency in the article bundle

| Hex | Count in `articlev2.built.css` | Role (from the selectors that use it) |
|---|---|---|
| `#f5f5f7` | 123 | panel fill — `.docsanddownloads__list` background, dark-theme text |
| `#1d1d1f` | 85 | primary text, related-card title, dark-theme scrims |
| `#fff` | 54 | page background, dark-mode hairline (`border-bottom:1px solid #fff`) |
| `#6e6e73` | 51 | **all** meta text: kicker, date, caption, footnote, share icons |
| `#86868b` | 46 | meta text **on dark** only (`.theme-dark .image-description`, `.theme-dark .category-eyebrow__date`) |
| `#333336` | 31 | dark-theme control fill |
| `#000` | 27 | dark-theme page field |
| `#d2d2d7` | 26 | **the hairline** — `.article-list` and `.article-list__item` borders |
| `#161617` | 24 | dark-theme figure field |
| `#424245` | 22 | dark-theme hover fill |
| `#e8e8ed` | 21 | light control fill / download-button background |
| `#0071e3` | 15 | **focus ring only** on article pages |

The page field itself is not a literal in the article bundle; it comes from `site.built.css`: [R7]

```css
:root{--sk-body-text-color: rgb(29, 29, 31);--sk-headline-text-color: rgb(29, 29, 31);--sk-body-background-color: rgb(255, 255, 255);…}
html{font-family:SF Pro Text,SF Pro Icons,Helvetica Neue,Helvetica,Arial,sans-serif;font-size:106.25%;quotes:"\201c" "\201d"}
```

`font-size:106.25%` on `<html>` is worth flagging: it makes the root **17 px** against a 16 px browser default, which is why the `em`-based paragraph margin in §6.1 resolves to ~24 px rather than ~22.7 px. [R7]

### 5.2 Links

```css
a{color:var(--sk-body-link-color, rgb(0, 102, 204));letter-spacing:inherit}
a:hover{text-decoration:underline}
a:focus[data-focus-method=key],.link:focus[data-focus-method=key]{text-decoration:underline}
```

Links are **`#0066cc`, not underlined at rest, underlined on hover and on keyboard focus**. Dark theme overrides the variable to `rgb(41, 151, 255)` = `#2997ff`. [R7][R6]

### 5.3 Dark theme

Dark mode is **not** driven by `prefers-color-scheme`: that string occurs **0 times** in `articlev2.built.css`, `site.built.css` and `articlev2.built.js`. It is a class the CMS puts on `<body>`: [R4][R6]

```css
.theme-dark{--sk-body-background-color: rgb(0, 0, 0);--sk-body-text-color: rgb(245, 245, 247)}
```

with per-component overrides, e.g. `.theme-dark .category-eyebrow__category{color:#86868b;border-color:#86868b}`, `.theme-dark .image-description{color:#86868b}`, `.theme-dark a.block.block-light{--sk-blocklink-color: rgb(0, 102, 204)}`. [R6]

### 5.4 Contrast (computed from the quoted hex values)

WCAG 2.1 relative luminance, sRGB, no rounding before the final division:

| Pair | Where | Ratio | Verdict |
|---|---|---|---|
| `#1d1d1f` on `#ffffff` | body text | **16.83:1** | AAA |
| `#1d1d1f` on `#f5f5f7` | body on panel | **15.46:1** | AAA |
| `#6e6e73` on `#ffffff` | kicker/date/caption/footnote | **5.07:1** | AA (normal text) |
| `#6e6e73` on `#f5f5f7` | meta on panel | **4.66:1** | AA |
| `#0066cc` on `#ffffff` | inline link | **5.57:1** | AA |
| `#0066cc` on `#f5f5f7` | inline link on panel | **5.11:1** | AA |
| `#d2d2d7` on `#ffffff` | hairline rule | **1.51:1** | decorative only — correctly used as a rule, never as text |
| `#f5f5f7` on `#000000` | dark-theme body | **19.29:1** | AAA |
| `#2997ff` on `#000000` | dark-theme link | **6.96:1** | AA |
| `#86868b` on `#000000` | dark-theme meta | **5.80:1** | AA |

Worked example for the first row, so the method is checkable: `#1d1d1f` → `(29,29,31)` → linear `(0.0126, 0.0126, 0.0144)` → `L = 0.2126·0.0126 + 0.7152·0.0126 + 0.0722·0.0144 = 0.01273`. White `L = 1`. Ratio `= (1 + 0.05) / (0.01273 + 0.05) = 1.05 / 0.06273 = 16.83`. The same arithmetic for `#6e6e73` on white gives `L = 0.15607` → `1.05 / 0.20607 = 5.07`.

The one weak spot is that captions are `12px` at `600` weight in `#6e6e73` — **5.07:1 passes AA**, but at 12 px there is no size-based relief, so it is worth knowing that Apple sits comfortably above 4.5:1 rather than at the edge.

## 6. Body-content components

### 6.1 Paragraphs

Paragraphs are `div.pagebody-copy`, **not `<p>`**. Spacing is a single em-based value, so it scales with the body size: [R3][R6]

```css
.pagebody-copy{margin-bottom:1.4211026316em}
.pagebody-copy:first-child{margin-top:0}
.pagebody-copy:last-child{margin-bottom:0}
```

At 19 px that is `19 × 1.4211026316 ≈ 27.0 px`; at 17 px it is `≈ 24.2 px`. The multiplier is **identical to the body line-height** (`1.4211026316`), i.e. Apple's paragraph gap is exactly one line — the paragraph rhythm and the leading are the same number. [R6]

Section subheads inside the body are `<h2 class="pagebody-header"><strong>…</strong></h2>` with `margin-bottom:16px;margin-top:52px` (48/44). The `<strong>` inside an already-700 heading is redundant markup, not an extra weight step. [R3][R6]

Bullets are plain `<ul><li>` inside a `.pagebody-copy`; there is **no `list-style` rule** for them in the article bundle and `site.built.css` only zeroes margins/padding, so they render with the browser's default disc. The "spec list" variant is `.pagebody.pagebody-small`, which drops copy to 14 px. [R3][R6][R7]

### 6.2 Pull-quotes and blockquotes

There is no `<blockquote>`. The component is: [R4]

```html
<div class="pullquote component"><div class="component-content">
  <aside class="quote" aria-label="Article Quote 1">
    <p class="pullquote__text no-quotes"><span>…</span></p>
  </aside>
</div></div>
```

`40px/1.1/700`, `text-align:center`, `margin-top/bottom:72px`, and — the important structural point — `.pullquote .component-content{width:100%}` at `min-width:735px`. Since `.component` is 980 px, **a pull-quote spans the media width, not the text measure**, and is centred. It is the one text element allowed to break out of the 653 px column. [R6]

There is a second, older `.quote` component in the bundle (`.quote{font-size:40px;line-height:1.2;font-weight:400}` with `--sk-quote-copy-color`) which is what an editor-facing "quote" block compiles to; the `.pullquote` wrapper is what actually appears in served markup. I found `.pullquote` in the PHOTOS article only. [R4][R6]

### 6.3 Images and captions

Every hero/inline figure is a `<figure>` with a CMS-generated inline `<style>` that sets the **aspect ratio per breakpoint**, so the box does not reflow when the art-directed crop changes: [R3]

```html
<style type='text/css'>
  .image-85760f8d07024df4b712122ddd479e63 { width: 100%; padding-top: 66.68367%; height: auto; }
  @media only screen and (max-width: 1068px) {
    .image-85760f8d07024df4b712122ddd479e63 { width: 100%; padding-top: 66.69075%; height: auto; }
  }
  @media only screen and (max-width: 734px) {
    .image-85760f8d07024df4b712122ddd479e63 { width: 100%; padding-top: 100.0%; height: auto; }
  }
</style>
```

That is a **deliberate art-direction change of crop**, not a responsive scale: 3:2 landscape at desktop (66.68 %), square at phone (100 %). The art direction is mirrored in `<picture>`: `source` at `max-width:734px` → `.small.jpg` / `.small_2x.jpg`, `source` at `max-width:1068px` → `.medium.jpg` / `.medium_2x.jpg`, default `img` → `.large.jpg` with `srcset …large_2x.jpg 2x`. [R3]

Caption and download affordance share one flex row: [R3][R6]

```css
.image-description{position:relative;display:flex;align-items:flex-start;justify-content:space-between;
  color:#6e6e73;margin:16px 16px 0;font-size:12px;line-height:1.3333733333;font-weight:600;
  letter-spacing:-0.01em;font-family:"SF Pro Text",…}
.image.body-copy-wide.image-fullbleed .image-description{width:653px;margin-inline-start:auto;margin-inline-end:auto}
```

`justify-content:space-between` puts caption left and download button right; the `653px` auto-margin rule pulls the row back to the text measure under a 980 px image. **That is the visual signature: image wide, caption narrow.** [R6]

`image-inline` figures are the same 980 px width but have **no** inline aspect-ratio style — they size to the image's natural ratio. So "big" vs "inline" is about fixed frame vs natural height, not about width. [R3]

### 6.4 Galleries / carousels

Markup, with the a11y wiring intact: [R3]

```html
<div class="gallery component gallery-hero body-copy-wide" role="group" aria-label="gallery"
     data-component-list="MixinGallery" id="ipad-mini-finishes-and-rating">
  <nav role="presentation" class="dotnav">
    <ul role="tablist">
      <li role="presentation">
        <a id="gallery-dotnav-0cd6…" href="#gallery-0cd6…" class="dotnav-item"
           data-ac-gallery-trigger="gallery-0cd6…"><span class="visuallyhidden">iPad mini is shown in midnight.</span></a>
      </li>
    </ul>
  </nav>
  <div class="gallery-images">
    <div id="gallery-0cd6…" class="gallery-item" aria-labelledby="gallery-dotnav-0cd6…" data-gallery-item>
      <figure role="presentation" class="image-shareheet-gallery">…</figure>
    </div>
  </div>
  <nav role="presentation" class="paddlenav nav-0cd6…">
    <ul>
      <li><button class="paddlenav-arrow paddlenav-arrow-previous"><span class="vo-text">previous</span></button></li>
      <li><button class="paddlenav-arrow paddlenav-arrow-next"><span class="vo-text">next</span></button></li>
    </ul>
  </nav>
</div>
```

Mechanically: `.gallery-images{white-space:nowrap;position:relative;width:653px}` (576 / 100 %) with `.gallery-item{display:inline-block;width:100%;visibility:hidden}`; at `max-width:734px` `.gallery-item{visibility:visible}`, i.e. **on phones the JS carousel is replaced by a native horizontal scroll of inline-block items**, while on desktop `MixinGallery` moves them. The arrows are vertically positioned by a per-instance inline `<style>` computing `top: 327.0px` (231.0 px at ≤1068) from the rendered image height. [R3][R6]

The dot navigation is a **tablist**: each dot is an `<a role="presentation">` inside `<li role="presentation">`, containing a `span.visuallyhidden` sentence describing the slide, and each slide's `aria-labelledby` points back at its dot's id. The arrows use `.vo-text` (screen-reader-only text) rather than `aria-label`, so their accessible name comes from content. [R3]

### 6.5 Geometry: radius, scrim, download button

```css
.image-sharesheet{display:table;border-radius:10px;overflow:hidden;z-index:0;position:relative}
@media(max-width: 734px){.image-sharesheet{display:block}}
@media(max-width: 734px){.image.image-fullbleed .image-sharesheet{border-radius:0}}
@media(min-width: 416px)and (max-width: 734px){.image.image-fullbleed .image-sharesheet{border-radius:10px}}
@media(max-width: 415px){.image .image-sharesheet{border-radius:0}}
.component.not-rounded .image-sharesheet{border-radius:0 !important}
```

Net effect: **10 px radius everywhere except below 416 px**, where media is edge-to-edge and the radius is squared off — including the contradictory 416–734 reset back to 10 px, which I report as served rather than as intended. `.component.not-rounded` is the editorial opt-out. [R6]

The download control is an icon-only `<a download>` whose accessible name is long-form: `aria-label="Download media, A person sits on stairs while holding iPad mini."` — i.e. it reuses the alt text. [R3]

### 6.6 Video

No `<video>` element appears on any of the four articles. The bundle does contain a full player (`.ac-video-player-*`, trickplay, captions) and `video-hero .component-content{width:980px}` / `692px` / `100%`, but on this surface it is unused. I found **no autoplaying media** in served markup. [R3][R4][R5][R6]

### 6.7 Footnotes ("sosumi")

```html
<div class="sosumi text component"><div class="component-content"><ol><li>…</li></ol></div></div>
```

`sosumi` is Apple's house name for the legal footnote block: `12px/1.3333733333/400/-0.01em`, colour `rgba(0,0,0,0.56)` (≈ `#707070`, **4.95:1** on white) with links at `rgba(0,0,0,0.72)`. In-body markers are plain `<sup>1</sup>` … `<sup>15</sup>`. Note the switch from hex to alpha here — the only place in the article's meta text where colour is expressed as opacity rather than a hex value, which means it composites differently over `#f5f5f7`. [R3][R6]

### 6.8 Downloads and press contacts

The press-kit box is a filled panel, not a card list of bare links: [R6]

```css
.docsanddownloads__list{background-color:#f5f5f7;border-radius:10px;display:flex;flex-direction:column;margin:0}
.docsanddownloads__item{border-bottom:1px solid #fff;display:flex;align-items:center;list-style:none;
  padding-bottom:36px;padding-top:36px;margin:0 36px}
```

So: `#f5f5f7` panel at 10 px radius, rows separated by **white** hairlines (not grey), 36 px vertical padding and 36 px inset, stepping to 32 px and then 24 px with `align-items:flex-start` at ≤734. [R6]

`presscontacts` is a 3-column `.contacts-container` of `.contactinfo` blocks with `<p class="contactinfo-title">` / `<p class="contactinfo-text">`. It is purely institutional — there is nothing in the article template that maps to a French e-commerce site's needs. [R3]

### 6.9 Share affordances, twice

The share sheet appears **twice**: once in `.article-header` (no label) and once near the end inside `div.nr-article-share`, preceded by `.nr-article-share__header` whose text content is `Share article`. Both instances are the same `.sharesheet.component`. On desktop it is a horizontal inline-flex row of four icons at `height:71px` (57 at ≤1068, 55 at ≤734), colour `#6e6e73`; `.sharesheet-options-open` and `.sharesheet-options-close` are `display:none` at base and appear in the `.sharesheet.native` variant, where a `.show-options` class toggles the popover (inferred from the CSS state selectors — I have no running browser to confirm the toggle). [R3][R6]

The copy-link field is a real `<input readonly tabindex="-1">` inside a container marked `aria-hidden="true"`, so it is removed from the a11y tree and from tab order — the "copy link" action is a `<button>` instead. [R3]

## 7. Related content and article footer

### 7.1 "More from Apple Newsroom"

It is a **ruled vertical list**, not a card grid: [R6]

```css
.article-list{border-top:1px solid #d2d2d7;padding-top:52px}
.article-list__item{margin-top:0;border-bottom:1px solid #d2d2d7;padding-bottom:32px;padding-top:32px}
.article-list__item__link{color:#1d1d1f;display:flex;text-decoration:none}
.article-list__item__img-wrapper{padding-inline-end:24px;width:171px}
.article-list__item__img-wrapper picture{width:171px;display:block;font-size:0;border-radius:10px;overflow:hidden;z-index:0;position:relative}
.article-list__item__content{display:flex;flex-direction:column}
```

Layout, therefore: `653px` measure → `171px` thumbnail + `24px` gutter + `458px` text. Rows are separated by `1px #d2d2d7`, the whole block opens with a `1px #d2d2d7` rule and `52px` of air. At `max-width:734px`: thumbnail `93px`, gutter `16px`, `border-radius:12px`, row padding 28 px, `padding-top:28px` on the block. **3** rows on each of the four articles inspected (I cannot tell from static HTML whether 3 is fixed or CMS-chosen). [R3][R4][R5][R12][R6]

Title is `h3.article-list__item__title` at `19px/1.2105/700/+0.012em` desktop → `17px/1.2354/700/-0.022em` at ≤1068, `color:#1d1d1f`. Kicker `12px/600/-0.01em` uppercase `#6e6e73` with `margin-bottom:4px`. Date `14px/600/-0.016em` `#6e6e73` with `margin-top:8px`. [R6]

Hover and keyboard focus are identical, and the mechanism is **image scale + scrim**, never a border: [R6]

```css
.article-list__item__img-wrapper picture::after{content:"";position:absolute;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,.15);opacity:0;transition:opacity 400ms cubic-bezier(0.4, 0, 0.25, 1) 0ms}
.article-list__item__img-wrapper img{width:100%;transition:transform 400ms cubic-bezier(0.4, 0, 0.25, 1) 0ms;
  transform:scale(1.00001)}
.article-list__item__link:hover img{transform:scale(1.05)}
.article-list__item__link:hover picture::after{opacity:1}
.article-list__item__link:focus[data-focus-method=key] img{transform:scale(1.05)}
.article-list__item__link:focus[data-focus-method=key] picture::after{opacity:1}
.article-list__item__link:hover{text-decoration:none}
```

Note the resting `scale(1.00001)` — a float that forces a compositing layer so the hover scale does not re-rasterise the bitmap. [R6]

### 7.2 The router tile

`.footertile{position:relative;width:100%;background-color:#fafafc}` with a centred 19 px/700 `#6e6e73` headline and a `.footertile-copy-cta.block-link` — a single full-width band that sends the reader back to `/newsroom/`, carrying the Newsroom wordmark as an **inline SVG** (`svg.logo-nr` with `<g fill="#333">`). `#fafafc` is Apple's shared "light band" fill (the same value fills `.headersplitview`, `.pdflist` and `.downloadall--padded`), one shade lighter than the `#f5f5f7` panel used by the press-kit box. [R3][R6]

### 7.3 There is no next/previous article

No "next article" link, no pagination, no infinite scroll, no sidebar, no TOC. The only onward paths are the three related rows and the router tile. [R3]

## 8. Responsive behaviour

What actually changes, in source order: [R6]

**At `max-width: 1068px`**

1. `.component` 980 → **692 px**; `.component-content` 653 → **576 px**; `.image-big .component-content` 980 → **692 px**.
2. `.component` margin 44 → **36 px**; `.article-header` `margin-top` 52 → **40 px**; `.category.component` `margin-top` 52 → **40 px**; `.article-subhead` `margin-top` 20 → **16 px**; `.article-header .sharesheet` 28 → **24 px**; `.pagebody-header` `margin-top` 52 → **48 px**.
3. `<h1>` 48 → **40 px**, tracking `-0.003em` → **`0em`**; deck 24 → **21 px**; body 19 → **17 px** *and family* Display → **Text**, tracking `+0.012em` → **`-0.022em`**.
4. Related-card title 19 → **17 px** (and Display → Text); `.article-list` `padding-top` 52 → **48**; thumbnail stays **171 px**.
5. Caption `margin-top` 16 → **12 px**.

**At `max-width: 734px`**

1. `.component` becomes **`max-width:414px;width:100%`**; `.component-content` becomes **87.5 %**; `.image-big .component-content` becomes **100 %**; captions **87.5 %**. Media/text breakout collapses (or rather, text insets and media does not).
2. `.component` margin **32 px**; `.article-header` `margin-top` **32 px**; `.article-header .sharesheet` **20 px**; `.pagebody-header` `margin-top` **44 px**; `.pullquote.component` **52 px**.
3. `<h1>` **32 px** at `+0.004em`; pull-quote **28 px**; body, deck and section heads **do not change** (no 734 rule for them).
4. Related row: thumbnail **93 px**, gutter **16 px**, radius **10 → 12 px**, padding **28 px**; the related block's own `padding-top` **52 → 28 px**.
5. Figures square off below 416 px (radius 10 → **0**), and `image-sharesheet` switches `display:table` → **`block`**.
6. Gallery switches from JS carousel to native scroll (`.gallery-item{visibility:visible}`).

**Stacking order.** There is nothing to stack: the template is a single column at every width. The only multi-column moment is `presscontacts`' `.contacts-container` of three `.contactinfo` blocks, and `image-description`'s caption/download flex row — both collapse by wrapping/`flex-start`, not by a media query in the article bundle. [R6]

## 9. Motion

**Finding: almost none, and what exists is not an entrance animation.**

- **No scroll-triggered reveal.** The `.reveal`, `.is-visible`, `.became-visible` and `content-anim` strings exist in the bundle, but they belong to `.fullbleedsticky` / `.curtain` sections. `fullbleedsticky` occurs **0 times** in the press-release, Quick Read and French articles (`1` reference in the PHOTOS article, on a `FullbleedSticky LocalnavTransformer` component). No `data-anim*` attribute is present on any of the four. [R3][R4][R5][R12][R6][R9]
- **Only three JS behaviours are instantiated:** `data-component-list="CopyText"`, `"MixinGallery"`, `"ShareSheet"` (plus `FullbleedSticky LocalnavTransformer` on the PHOTOS piece). [R3][R4]
- **Hover/focus transitions** are the only motion a reader reliably sees: the related-card `scale(1.05)` + scrim over **400 ms `cubic-bezier(0.4, 0, 0.25, 1)`**; gallery caption `opacity 300ms ease-in-out`; share/CTA colour transitions at `0.4s`/`0.5s`. [R6]
- **Reduced motion is gated in JS, not in CSS.** The only `@media(prefers-reduced-motion)` block in the bundle is `.modal-crossfade{transition:none}`. The player defaults to `autoPlayWithReducedMotion: false` and returns early when `window.matchMedia("(prefers-reduced-motion: reduce)").matches`; the gallery reads `document.documentElement.classList.contains("reduced-motion")`. The `.reduced-motion` class is also used to neutralise sticky-video height (`height:auto`, `position:relative`, `opacity:1`) so the layout degrades to static. [R6][R9]
- **No parallax, no sticky headline, no scroll progress, no number counters, no marquee** in article markup or the article-specific CSS. [R3][R6]

## 10. Accessibility details verified

**Focus ring.** Global, one declaration, high specificity of intent: [R7]

```css
:focus-visible{outline:2px solid var(--sk-focus-color, #0071e3);outline-offset:var(--sk-focus-offset, 1px)}
```

Container-like controls use the wider offset: `outline-offset:var(--sk-focus-offset-container, 3px)` (4 occurrences). Dark surfaces get an explicit inversion: `outline:2px solid #fff` (4 occurrences) and `.theme-dark` dotnavs use `--sk-dotnav-focus-color`. `outline:none` appears 18 times in the article bundle — but each is paired with a replacement indicator (background swap or scrim), and the global `:focus-visible` rule in `site.built.css` is declared with two-argument `var()` fallbacks so it survives a missing token. [R6][R7]

Additionally, `a:focus[data-focus-method=key]{text-decoration:underline}` gives keyboard users the same underline that hover gives mouse users — a deliberate `:focus` ≠ `:focus-visible` split driven by a `data-focus-method` attribute set in JS. [R7]

**Landmarks and structure.**

| Element | Role/semantics | Source |
|---|---|---|
| `<main id="main" class="main" role="main">` | explicit `role="main"` (redundant but present) | [R3] |
| `<article class="article">` | article landmark | [R3] |
| `<nav id="ac-localnav" role="navigation" aria-label="Newsroom">` | labelled nav | [R3] |
| `<nav role="presentation" class="dotnav">` + `<ul role="tablist">` | gallery tabs | [R3] |
| `<aside class="quote" aria-label="Article Quote 1">` | auto-numbered quote region | [R4] |
| `<aside class="component legal-info" aria-label="Legal information">` | labelled complementary region | [R3] |
| `<aside aria-labelledby="latest-news">` | related-content region labelled by its visible `h2 id="latest-news"` | [R3] |
| `<aside class="footertile" aria-labelledby="footertile-name">` | labelled router region | [R3] |
| `<footer id="ac-globalfooter" role="contentinfo" aria-labelledby="ac-gf-label">` | contentinfo, labelled by a visually-hidden `<h2 class="ac-gf-label" id="ac-gf-label">Apple Footer</h2>` | [R3][R20] |

Every `aria-labelledby` in all four articles resolves to an element that exists — I checked the id sets against the references and found **0 dangling references**, including `footertile-name`, `ac-gf-label` and the three gallery dot ids. [R3][R4][R5][R12]

**Heading order.** Exactly one `<h1>`; 14 `<h2>` and 15 `<h3>` on the press release. The `<h2>` set is: the body section heads (8), `Media`, `Press Contacts`, `More from Apple Newsroom`, `Apple Footer`, plus two empties inside the nav. Related cards are `<h3>`. There is no skipped-level jump in the article region. [R3]

**Share controls.** Four `<button>`s with `aria-label` sentences that include the popup warning ("(opens in new window)"); the copy-link `<input>` and its close button are `tabindex="-1"` inside an `aria-hidden="true"` container. **Gap worth naming:** the share toggle has `aria-label="Open share options"` but **no `aria-expanded` and no `aria-controls`** — the only `aria-expanded` in the document belongs to the global-nav search button. A popup-triggering control without expanded state is the one place this template falls short of its own standard. [R3]

**Gallery controls.** Each slide's `aria-labelledby` points at the dot that selects it, and each dot carries a full descriptive sentence in `.visuallyhidden` ("iPad mini is shown in midnight.") rather than "1 of 3". The arrow buttons contain `.vo-text` (`previous` / `next`) instead of `aria-label`. [R3]

**Alt-text strategy.** Two layers, not one: the `<figure>` gets an `aria-label="Media, <description>"` and the `<img>` gets `alt="<description>"` — so the same sentence is exposed twice (inferred: most screen readers will announce the figure label and then the image, which is arguably one announcement too many). The download link's `aria-label` is `"Download media, <description>"`. Decorative logos are inline SVG with no title; the router tile is labelled by its visible headline. Related-card thumbnails are wrapped in `picture.no-dl` and sit inside a link whose accessible name is the card title, so the thumbnail contributes nothing extra. [R3][R4]

**Structured data.** The article ships `NewsArticle` JSON-LD with `mainEntityOfPage`, `headline`, and an `image` array carrying explicit `width`/`height`; plus an `Organization` block. So the article's own metadata is machine-readable even though the header has no byline. [R3]

## 11. Locale, RTL and French differences

**French is not a separate template.** `/fr/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` is 251,772 B vs 255,008 B for the English original, serves the **same** `articlev2.built.css`, the same `.article-header` class stack and the same `.article-list` — and differs only in: [R12]

| Aspect | `en-US` | `fr-FR` |
|---|---|---|
| `<html>` | `xml:lang="en-US" lang="en-US" dir="ltr"` | `xml:lang="fr-FR" lang="fr-FR" dir="ltr"` |
| `<title>` | `Apple gives iPad mini its biggest update ever - Apple` | `Apple dévoile la plus importante mise à jour jamais apportée à l’iPad mini - Apple (FR)` |
| Kicker text | `PRESS RELEASE` | `COMMUNIQUÉ DE PRESSE` |
| Date text | `October 26, 2026` | `26 octobre 2026` |
| Related heading | `More from Apple Newsroom` | `Plus de contenus Apple Newsroom` |
| Local nav label | `aria-label="Newsroom"`, title `Newsroom` | translated |
| Footer bundle | `ac-globalfooter/8/en_US/…` | `ac-globalfooter/8/fr_FR/…` |

The **class names stay English and unchanged** (`category_release` in both), the date is **server-formatted into the locale** rather than localised client-side, and the related-section id remains `latest-news` in French. Typography is identical — the article bundle has no `:lang(fr)` override at all, because French needs none: it uses the Latin stack and the same tracking. [R6][R12]

**RTL is handled by logical properties, not a flipped build.** The Arabic article at `/sa-ar/` declares `dir="rtl"` and loads *`.rtl`* bundle names: `articlev2.rtl.built.css`, `site.rtl.built.css`, `ac-localnav.rtl.built.css`. But `articlev2.rtl.built.css` is **byte-identical** to `articlev2.built.css` — same 928,952 B, same md5 `35826cf01e9d9b7dcd5c801ecc4801a4` — and the same `.component-content{width:653px}` / 576 / 87.5 % and the same 48/40 px `<h1>` ladder appear in it unchanged. So the "RTL stylesheet" is a naming convention; actual mirroring comes from the pervasive `margin-inline-start` / `margin-inline-end` / `inset-inline-start` logical properties plus `dir="rtl"`. The `:lang(ar)` overrides then swap the family (`"SF Pro AR","SF Pro AR Display",…`) and zero the negative tracking (`letter-spacing:0em`), which is the correct move since Arabic has no tracking to tighten. [R16][R17][R6]

**Locale discovery is a large `<link rel="alternate">` mesh.** The English article's `<head>` carries dozens of `hreflang` alternates for the same slug (`en-LT`, `en-BH`, `no-NO`, `pl-PL`, `ko-KR`, …) plus a canonical to itself — i.e. the article slug is shared across locales and only the path prefix changes. [R3]

## Evidence

Verbatim excerpts, each with the `@media` context stated. Line breaks inside a rule are marked `/* ⏎ */` in the comment line above the block; everything else is byte-identical to the served bundle. [R6]

**E1 — the two widths and the phone cap.** Four separate rules, quoted in bundle order.

```css
.component{margin-inline-start:auto;margin-inline-end:auto;width:980px}
@media(max-width: 1068px){.component{margin-inline-start:auto;margin-inline-end:auto;width:692px}}
@media(max-width: 734px){.component{max-width:414px;width:100%;margin-inline-start:auto;margin-inline-end:auto}}
.component-content{margin-inline-start:auto;margin-inline-end:auto;width:653px}
@media(max-width: 1068px){.component-content{width:576px}}
@media(max-width: 734px){.component-content{width:87.5%}}
.image-big .component-content{width:980px}
@media(max-width: 1068px){.image-big .component-content{width:692px}}
@media(max-width: 734px){.image-big .component-content{width:100%}}
```

**E2 — caption snaps back to the measure.** `/* ⏎ after the two width declarations */`

```css
.image.body-copy-wide.image-fullbleed .image-description{width:653px;margin-inline-start:auto;margin-inline-end:auto}
@media(max-width: 1068px){.image.body-copy-wide.image-fullbleed .image-description{width:576px}}
@media(max-width: 734px){.image.body-copy-wide.image-fullbleed .image-description{width:87.5%}}
```

**E3 — the single vertical rhythm plus the two sanctioned exceptions.**

```css
.component{margin-top:44px;margin-bottom:44px}
@media(max-width: 1068px){.component{margin-top:36px;margin-bottom:36px}}
@media(max-width: 734px){.component{margin-top:32px;margin-bottom:32px}}
.article-header{margin-top:52px}
@media(max-width: 1068px){.article-header{margin-top:40px}}
@media(max-width: 734px){.article-header{margin-top:32px}}
.pullquote.component{margin-top:72px;margin-bottom:72px}
@media(max-width: 1068px){.pullquote.component{margin-top:64px;margin-bottom:64px}}
@media(max-width: 734px){.pullquote.component{margin-top:52px;margin-bottom:52px}}
```

**E4 — headline ladder, with the tracking sign flip.**

```css
.pagetitle .hero-headline{font-size:48px;line-height:1.0834933333;font-weight:700;letter-spacing:-0.003em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}
@media(max-width: 1068px){.pagetitle .hero-headline{font-size:40px;line-height:1.1;font-weight:700;letter-spacing:0em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}}
@media(max-width: 734px){.pagetitle .hero-headline{font-size:32px;line-height:1.125;font-weight:700;letter-spacing:.004em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}}
```

**E5 — the optical-size switch in body copy (Display 19 px → Text 17 px).**

```css
.pagebody{font-size:19px;line-height:1.4211026316;font-weight:400;letter-spacing:.012em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}
@media(max-width: 1068px){.pagebody{font-size:17px;line-height:1.4705882353;font-weight:400;letter-spacing:-0.022em;font-family:"SF Pro Text","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}}
```

**E6 — paragraph gap equals the leading, exactly.**

```css
.pagebody-copy{margin-bottom:1.4211026316em}
.pagebody-copy:first-child{margin-top:0}
.pagebody-copy:last-child{margin-bottom:0}
```

**E7 — deck, section head, kicker, date.**

```css
.article-subhead{font-size:24px;line-height:1.1666666667;font-weight:500;letter-spacing:.009em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;margin-top:20px;margin-bottom:0}
@media(max-width: 1068px){.article-subhead{font-size:21px;line-height:1.1904761905;font-weight:500;letter-spacing:.011em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}}
.pagebody-header{font-size:24px;line-height:1.1666666667;font-weight:700;letter-spacing:.009em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;margin-bottom:16px;margin-top:52px}
.category-eyebrow{font-size:12px;line-height:1.3333733333;font-weight:700;letter-spacing:-0.01em;font-family:"SF Pro Text","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}
.category-eyebrow__category{text-transform:uppercase;color:#6e6e73;border-color:#6e6e73}
.category-eyebrow__date{font-size:14px;line-height:1.2857742857;font-weight:600;letter-spacing:-0.016em;font-family:"SF Pro Text","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;color:#6e6e73}
```

**E8 — pull-quote: 980 px wide, centred, fenced.**

```css
.pullquote__text{font-size:40px;line-height:1.1;font-weight:700;letter-spacing:0em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;text-align:center}
@media(min-width: 735px){.pullquote .component-content{width:100%}}
```

**E9 — caption + download row, and the caption colour.**

```css
.image-description{position:relative;display:flex;align-items:flex-start;justify-content:space-between;color:#6e6e73;margin:16px 16px 0;font-size:12px;line-height:1.3333733333;font-weight:600;letter-spacing:-0.01em;font-family:"SF Pro Text","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif}
@media(max-width: 1068px){.image-description{margin-top:12px}}
```

**E10 — figure radius cascade (reported as served, including the contradiction).**

```css
.image-sharesheet{display:table;border-radius:10px;overflow:hidden;z-index:0;position:relative}
@media(max-width: 734px){.image-sharesheet{display:block}}
@media(max-width: 734px){.image.image-fullbleed .image-sharesheet{border-radius:0}}
@media(min-width: 416px)and (max-width: 734px){.image.image-fullbleed .image-sharesheet{border-radius:10px}}
@media(max-width: 415px){.image .image-sharesheet{border-radius:0}}
.component.not-rounded .image-sharesheet{border-radius:0 !important}
```

**E11 — related list geometry and the image-scale hover.**

```css
.article-list{border-top:1px solid #d2d2d7;padding-top:52px}
.article-list__item{margin-top:0;border-bottom:1px solid #d2d2d7;padding-bottom:32px;padding-top:32px}
.article-list__item__link{color:#1d1d1f;display:flex;text-decoration:none}
.article-list__item__img-wrapper{padding-inline-end:24px;width:171px}
.article-list__item__img-wrapper picture{width:171px;display:block;font-size:0;border-radius:10px;overflow:hidden;z-index:0;position:relative}
.article-list__item__img-wrapper img{width:100%;transition:transform 400ms cubic-bezier(0.4, 0, 0.25, 1) 0ms;transform:scale(1.00001)}
.article-list__item__link:hover img{transform:scale(1.05)}
.article-list__item__link:hover picture::after{opacity:1}
```

**E12 — the dead drop cap (present in CSS, emitted nowhere).**

```css
.pagebody-copy:first-child .first-letter{font-size:84px;line-height:1;font-weight:600;letter-spacing:-0.015em;font-family:"SF Pro Display","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;float:left;margin-inline-end:8px;line-height:.8928571429}
@media(max-width: 734px){.pagebody-copy:first-child .first-letter{font-size:48px;line-height:1.0834933333;font-weight:600;letter-spacing:-0.003em;font-family:"SF Pro Display",…}}
```

**E13 — global token block, `site.built.css`.**

```css
:root{--sk-body-text-color: rgb(29, 29, 31);--sk-headline-text-color: rgb(29, 29, 31);--sk-body-background-color: rgb(255, 255, 255);--sk-body-font-stack: text;--sk-default-stacked-margin: .4em;--sk-paragraph-plus-element-margin: .8em;--sk-headline-plus-first-element-margin: .8em;--sk-headline-plus-headline-margin: .4em;--sk-paragraph-plus-headline-margin: 1.6em}
html{font-family:SF Pro Text,SF Pro Icons,Helvetica Neue,Helvetica,Arial,sans-serif;font-size:106.25%;quotes:"\201c" "\201d"}
a{color:var(--sk-body-link-color, rgb(0, 102, 204));letter-spacing:inherit}
a:hover{text-decoration:underline}
a:focus[data-focus-method=key],.link:focus[data-focus-method=key]{text-decoration:underline}
:focus-visible{outline:2px solid var(--sk-focus-color, #0071e3);outline-offset:var(--sk-focus-offset, 1px)}
```

**E14 — dark theme is a class, not a media query.**

```css
.theme-dark{--sk-body-background-color: rgb(0, 0, 0);--sk-body-text-color: rgb(245, 245, 247)}
.theme-dark .category-eyebrow__category{color:#86868b;border-color:#86868b}
.theme-dark .image-description{color:#86868b}
```

**E15 — footnote block.**

```css
.sosumi{font-size:12px;line-height:1.3333733333;font-weight:400;letter-spacing:-0.01em;font-family:"SF Pro Text","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif;color:#6e6e73}
.sosumi a{color:#1d1d1f}
```

**E16 — the reduced-motion gate in JS** (`articlev2.built.js`, identifiers preserved).

```js
GX(this.options,"autoPlayWithReducedMotion",!1),!this._autoPlayWithReducedMotion&&$X.prefersReducedMotion)return;
static get prefersReducedMotion(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}
```

## What eguidar should take

I read `app/(boutique)/blog/[slug]/page.tsx` and `app/globals.css` before writing this section. The headline finding is awkward but useful: **eguidar's blog article page has already copied most of Apple's numbers.** The task is therefore not adoption but *reconciliation* — a handful of values have drifted, one structural idea is missing entirely (the media breakout), and several Apple blocks should be deliberately **not** ported.

### Current state versus Apple, item by item

| Property | eguidar today | Apple (this doc) | Verdict |
|---|---|---|---|
| Text measure | `w-[653px]` → `max-md:w-[576px]` → `max-sm:w-[87.5%]` (line 102) | 653 → 576 → 87.5 % [R6] | **Exact match.** Keep. |
| Outer container | `max-w-[980px]` only on the related-products band (line 160) | 980 px is the *article's* container, not just a band [R6] | **Missing at article level.** |
| H1 | `text-[48px] leading-[1.0835] font-bold tracking-[-0.003em]` → 40/1.1/0 → 32/1.125/`0.004em` (line 114) | identical [R6] | **Exact match.** Keep. |
| Body | `text-[19px] leading-[1.4211] tracking-[0.012em]` → `text-body`/`leading-body`/`-0.022em` (line 135) | 19/1.4211/`+0.012em` Display → 17/1.4706/`-0.022em` Text [R6] | **Nearly exact**; the only gap is that `--text-body` is `1rem` (17 px at the 106.25 % root) and Apple's is explicitly 17 px — same result, different mechanism. |
| Deck | `mt-4 text-[19px] leading-[1.4211]` (line 117) | **24 px / 1.1667 / weight 500 / `+0.009em`** [R6] | **Divergent.** eguidar's deck is body-sized, so the header has no second voice. |
| Kicker | `text-[12px] … sm:text-[14px]` uppercase (line 103) | 12 px/700 for the kicker, **separate 14 px/600 date span**, `margin-top:4px` [R6] | **Merged into one line.** Apple splits category and date into two spans. |
| Section head | `mt-11 text-[21px]` → `sm:text-[24px]` → `lg:mt-[52px]` (line 140) | 24 px at desktop, 21 px at ≤1068 (no 734 step), `margin-top` 52 → 48 → 44, `margin-bottom:16px` [R6] | **Right values, early crossing.** eguidar reaches 24 px at 640 px wide; Apple holds 21 px until 1068. The margin endpoints (44/48/52) already agree. |
| Block rhythm | `mt-6` per paragraph, `mt-8` per block | 44 px between components, paragraph gap `= 1 × line-height` [R6] | **Ad hoc.** Apple has one number. |
| Cover image | `aspect-video rounded-[10px]` **inside the 653 px column**, `sizes="… 653px, 100vw"` (lines 122–131) | media breaks out to **980 px** (1.5×), caption returns to 653 px [R6] | **The one structural miss.** eguidar's hero is the same width as the text, so the page reads as a document, not as an Apple article. |
| Media radius | `rounded-[10px]` | 10 px, squared below 416 px [R6] | **Match**, minus the phone exception. |
| Related content | 2–4 `ProduitLieCarte` product cards in a `bg-muted` band, centred `32px` heading | 3 **ruled rows**, 171 px thumb + 24 px gutter, `1px #d2d2d7` top border, 19 px/700 title [R6] | **Different animal**, and correctly so — see "what to drop". |
| Share | none | two `.sharesheet` instances + copy-link [R3] | **Missing.** |
| Footnotes | none | `.sosumi` 12 px, `rgba(0,0,0,.56)` [R6] | **Missing** (matters for FR legal/prix mentions). |
| Focus ring | `@apply … outline-ring-attenue` (globals.css:118) — a 50 % mix of `--primary` | `2px solid #0071e3` at `1px` offset, opaque [R7] | **Divergent**: eguidar's ring is translucent → weaker. |
| Link colour | `--link: oklch(52.2% 0.177 256)` ≈ `#0a63cc` (globals.css:85) | `#0066cc` [R7] | Negligible perceptually; note only. |
| Border colour | `--border: oklch(86.5% 0 none)` ≈ `#d4d4d4` | `#d2d2d7` [R6] | Near-identical. |
| Root font size | `html{font-size:106.25%}` (globals.css:145) | `html{font-size:106.25%}` [R7] | **Exact match** — so eguidar's `rem` already equals Apple's `em` basis. |
| Body tracking | `letter-spacing:-0.022em` (globals.css:140) | body is `+0.012em` at 19 px, `-0.022em` at 17 px [R6] | eguidar applies the *small-size* tracking globally; at 19 px this is 0.034em tighter than Apple. |
| Paragraph wrapping | `text-wrap: pretty` (globals.css:125) | not declared [R7] | **eguidar is ahead.** Keep. |

### The four changes that would actually move the needle

**1. Let the article's media break out to 980 px, and pull the caption back to 653 px.** This is the whole trick, and it is two rules plus one wrapper. Concretely: the article should sit in a `max-w-[980px]` container while the prose column stays `653px`; `<figure>` blocks take the full 980 px; the `<figcaption>` re-applies `w-[653px] mx-auto`. In Tailwind that is a `980px` wrapper with a `653px` inner column and `-mx-[163.5px]` on figures — or, cleaner, a CSS grid whose column is `min(980px, 100%)` with the prose constrained to `653px`. Without this, nothing else about the page reads as an Apple article.

**2. Give the deck its own voice: 24 px / 1.1667 / weight 500 / `+0.009em`, `margin-top:20px`.** Today the deck is 19 px, i.e. identical to body copy, so the header is headline + a slightly smaller paragraph. Apple's deck is 26 % larger than the body and, crucially, **lighter** than the headline (500 vs 700) rather than greyer. In Tailwind: `mt-5 text-[24px] leading-[1.1667] font-medium tracking-[0.009em] max-md:text-[21px] max-md:leading-[1.1905] max-md:tracking-[0.011em]`. Then drop `text-muted-foreground` from it — Apple's deck is full `#1d1d1f`, and the hierarchy comes from size and weight, not from colour.

**3. Replace the per-element margins with one rhythm.** `.component{margin-top:44px;margin-bottom:44px}` → `36` at ≤1068 → `32` at ≤734, with `margin-top:52px` on the header and `72px` around pull-quotes. On eguidar's existing structure that means: drop `mt-8`/`mt-6`/`mt-12` in favour of a single `[&>*+*]:mt-11 max-md:[&>*+*]:mt-9 max-sm:[&>*+*]:mt-8` on the article container, keep `mt-[52px]` for `.pagebody-header` (which eguidar already has at `lg:mt-[52px]`, line 140), and set the paragraph gap to `mb-[1.4211em]` so it tracks the body size instead of a fixed 24 px. That single change removes the "everything is roughly spaced" feeling.

**4. Hold the section head at 21 px until 1024 px.** The values are already Apple's — 21 px → 24 px, and 44 → 48 → 52 px top margin — but the crossing point is early: eguidar promotes the size at `sm` (640 px) and the margin at `lg` (1024 px), so between 640 and 1024 it renders 24 px where Apple keeps 21 px down to 1068 (the 48 px margin is right above 734 and 4 px generous below it). On a 700 px-wide tablet window the section head then looks as loud as the 32 px `<h1>`. Move the size step to `lg` and the descent is restored. This is a breakpoint-width fix, not a ladder rewrite.

### What to drop on purpose

- **Press contacts and press-kit downloads.** `.presscontacts` and `.docsanddownloads` exist because a press release's audience is journalists who need spokespeople and asset zips. A French e-commerce blog has neither. Do not port them.
- **The `footertile` router band.** `.footertile` with its inline `logo-nr` SVG is a signpost back into Newsroom's own index. eguidar's equivalent is a breadcrumb (which it already has, `AppleBreadcrumb`).
- **The `.first-letter` drop cap.** It is dead code in Apple's own build (0 occurrences across four articles). Do not implement it — a drop cap on a 653 px column of 19 px text reads as a magazine mannerism, not as Apple.
- **The related-**article** list in Apple's ruled-row form, at least for now.** Apple's rows point at other editorial pieces; eguidar's related band points at *products*, which is commercially the right call and structurally a different component. If a "more articles" list is ever added, copy the ruled-row geometry (171 px thumb, `1px #d2d2d7` separators, 19 px/700 title) rather than inventing a third card style.
- **The `image-big` fixed-aspect `<style>` injection.** Apple's CMS generates a per-image, per-breakpoint `padding-top` because its art directors crop differently per device. eguidar has one source image per article; `aspect-video` is honest and sufficient. Copy the *principle* (reserve the box so nothing shifts) not the mechanism.
- **SF Pro.** `--font-sans` already begins `-apple-system, BlinkMacSystemFont, "SF Pro Text", …` (globals.css:63–65), which is the legitimate way to get the cut on Apple hardware. Apple's own web-font CSS is `© 2019 Apple Inc.`; shipping the files is not an option.

### Two small, high-value additions

- **A share row**, because it is the one header element eguidar lacks entirely and it is cheap: four real `<button>`s with explicit French `aria-label`s (`Partager sur X (ouvre une nouvelle fenêtre)`), a `Partager` label above the second instance, and the link-copy interaction. Follow Apple's structure, **but add the `aria-expanded` it forgot** — Apple's toggle has `aria-label="Open share options"` and no expanded state, which is the single a11y defect I could prove in an otherwise careful template.
- **A `.sosumi`-equivalent footnote block** at 12 px / `#6e6e73`, because French product articles need legal mentions (prix TTC, disponibilité, conditions de l'offre) and today those would have to live in body copy at 19 px, which is both wrong typographically and bad for the reader scanning for the offer terms.

## References

All URLs retrieved **27 October 2026 (UTC)**. Bundle filenames are unhashed and stable, but their *contents* rotate; the quoted rules are what was served on that date.

| Ref | Source | URL |
|---|---|---|
| R1 | Newsroom index HTML (200, 123,835 B) — React shell, 91 anchors, **no** article hrefs | `https://www.apple.com/newsroom/` |
| R2 | Newsroom Atom feed (200, 18,611 B) — used only to discover real article URLs | `https://www.apple.com/newsroom/rss-feed.rss` |
| R3 | iPad mini press-release article (200, 255,008 B) — the main skeleton, header and related-list evidence | `https://www.apple.com/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` |
| R4 | iPhone Duo PHOTOS article (200, 303,132 B) — `<body class="page-article theme-dark">`, `.pullquote`, `FullbleedSticky` | `https://www.apple.com/newsroom/2026/10/iphone-duo-arrives-at-apple-store-locations-worldwide/` |
| R5 | Quick Read article (200, 134,498 B) — `.container-quickread`, no deck | `https://www.apple.com/newsroom/2026/10/siri-ai-is-available-in-more-languages-starting-today/` |
| R6 | `articlev2.built.css` (200, 928,952 B) — **primary evidence**: all widths, type ladder, colour, radius, hover, a11y states | `https://www.apple.com/newsroom/styles/articlev2.built.css` |
| R7 | `site.built.css` (200, 122,042 B) — `:root` tokens, `html{font-size:106.25%}`, link and focus-ring rules | `https://www.apple.com/newsroom/styles/site.built.css` |
| R8 | `quick-read.built.css` (200, 213,420 B) — the Quick Read variant | `https://www.apple.com/newsroom/styles/quick-read.built.css` |
| R9 | `articlev2.built.js` (200, 962,944 B) — `prefersReducedMotion` gate, component registry, curtain/sticky machinery | `https://www.apple.com/newsroom/scripts/articlev2.built.js` |
| R10 | `main.built.js` (200, 213,318 B) | `https://www.apple.com/newsroom/scripts/main.built.js` |
| R11 | French Newsroom index (200, 126,309 B) | `https://www.apple.com/fr/newsroom/` |
| R12 | French article (200, 251,772 B) — locale comparison, same bundle | `https://www.apple.com/fr/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` |
| R13 | French Atom feed (200, 19,643 B) | `https://www.apple.com/fr/newsroom/rss-feed.rss` |
| R14 | Archive list page (200, 322,833 B) — `section#archive.archive` + `.filter-bar`, **not** an article | `https://www.apple.com/newsroom/archive/` |
| R15 | Apple Services room page (200, 134,753 B) — room landing, no article template | `https://www.apple.com/newsroom/apple-services/` |
| R16 | Arabic article, `dir="rtl"` (200, 248,718 B) — loads `.rtl` bundle names | `https://www.apple.com/sa-ar/newsroom/2026/10/apple-gives-ipad-mini-its-biggest-update-ever/` |
| R17 | `articlev2.rtl.built.css` (200, 928,952 B, md5 `35826cf0…` **identical to [R6]**) | `https://www.apple.com/newsroom/styles/articlev2.rtl.built.css` |
| R18 | Global header CSS (200, 170,263 B) — `--r-globalnav-height: 44px` | `https://www.apple.com/api-www/global-elements/global-header/v1/assets/globalheader.css` |
| R19 | Local nav CSS (200, 80,958 B) — `.ac-localnav`, `.ac-localnav-stacked{height:66px}` | `https://www.apple.com/ac/localnav/4/styles/ac-localnav.built.css` |
| R20 | Global footer CSS (200, 56,408 B) — `.ac-gf-content`, breadcrumbs | `https://www.apple.com/ac/globalfooter/8/en_US/styles/ac-globalfooter.built.css` |

### What I could not verify

| Item | Why | What I did instead |
|---|---|---|
| Rendered/computed styles | No browser in this sandbox — static HTML and CSS only | Every value quoted is a **declared** value, read with its `@media` context by a brace-tracking parser. Where behaviour depends on JS (the gallery carousel, the mobile share popover), I say so and label the inference. |
| Gallery carousel behaviour | `MixinGallery` runs client-side; only the server-rendered markup and CSS are visible | Documented the markup contract (`role="tablist"`, dot ids, `aria-labelledby` wiring) and the CSS (`inline-block` + `visibility:hidden` → `visible` at ≤734), plus the per-instance `top:` calculation. |
| The mobile share popover's open/close | `.sharesheet.native` toggling depends on a `show-options` class applied at runtime | Reported the declared `display:none` defaults and the `.show-options` selectors, labelled "(inferred)". |
| Whether `.first-letter` is ever emitted by the CMS | It appears **0** times in the four articles I fetched | Reported it as dead code on the evidence I have; there may exist a legacy article that emits it. This is the one place my sample could be unrepresentative, and I would not build on it. |
| Apple Newsroom video articles | No `<video>` on any of the four articles; the bundle carries a player but the surface did not use it | Stated as "none found" rather than describing the player from CSS alone. |
| Locales beyond `en`, `fr`, `ar` | I did not fetch `ja`, `zh`, `de` | The `:lang()` fan-out in the CSS shows what each locale overrides (family, line-height, zeroed tracking), which is sufficient to describe the mechanism without claiming per-locale detail. |
| A rendered light/dark screenshot comparison | No browser | Colour claims come from `.theme-dark` declarations and from the `class` attribute on `<body>`, both of which I quote verbatim. |
