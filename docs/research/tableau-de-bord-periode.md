# The period switch: primitive, link seam, and thirty daily bars at 390 px

> **Research-only document.** Every claim below is traced to a primary source: the installed packages
> under `node_modules/`, files in this checkout, or vendor documentation fetched over the web. Work was
> done on **8 November 2026** against commit `4441426`, with `@base-ui/react@1.9.0`, `recharts@3.10.1`
> and `next@16.4.3` installed. Unconfirmed claims are marked **unverified**. No application code, test,
> schema, configuration or `package.json` was modified.
>
> **Scope.** Three questions: the primitive, the link seam, and thirty daily labels at ~305 px.

## Summary

- **Base UI 1.9.0 ships `Toggle` and `ToggleGroup`**, and the shadcn `base-maia` registry builds a
  Base UI `toggle-group.tsx` on them. Adding it would not violate ADR-0008, but it installs **two**
  files and it is the wrong widget for a URL switch.
- **`ToggleGroup` is a button widget, not navigation.** It renders `role="group"`, stamps
  `aria-pressed` on every item, keeps one roving tab stop and moves focus with the arrow keys.
  Rendering each item as an anchor through `render` is possible with `nativeButton={false}`, but the
  anchor becomes `role="button"`; a link role does not support `aria-pressed`. Reject it.
- **The cheapest correct primitive is a server-rendered `<Link>`.** Three links styled with the
  exported `buttonVariants`, `aria-current="page"` on the active period, need zero new client
  components and keep link semantics. The dashboard already renders server-built links.
- **Copy the existing URL grammar.** `lib/commande-listing.ts` and `lib/produit-listing.ts` hold a path
  constant, typed params, a validating `parse…` with defaults and a `build…Url` that omits defaults;
  the page awaits `searchParams` inside `<Suspense>`. Add one module of that shape, not a client hook.
- **Recharts 3.10.1 solves the crowding with `interval` + `minTickGap`, measured from the plot width.**
  `interval="preserveStartEnd"` keeps first and last labels while thinning the middle; tooltips come
  from the full categorical domain, so thinning labels never thins the per-bar tooltip. For a visible
  tick line per bar, use `interval={0}` plus a sparse custom `tick` (or a `tickFormatter` returning
  `""`), because the axis draws tick lines and labels from the same `finalTicks` array.
- **No manual width measurement is needed for thinning.** `ResponsiveContainer` feeds the chart a
  `ResizeObserver` width, and the axis uses it. `onResize(width, height)` exists if a prop must change
  per breakpoint; `useIsMobile` is viewport-based, not container-based.

## 1. The primitive

### 1.1 What `@base-ui/react@1.9.0` exports

The installed package is `@base-ui/react@1.9.0` [1], and its barrel exports both modules [2]. `Toggle`
takes `pressed`, `defaultPressed`, `onPressedChange`, `value`, `disabled`, `nativeButton` and the
inherited `render` [3]; `ToggleGroup` takes `value: readonly Value[]`, `defaultValue`, `onValueChange`,
`multiple`, `orientation`, `loopFocus`, `disabled` and `render` [4]. There is no `ToggleGroup.Item`: the
items are plain `Toggle` children [9][10]. Two implementation facts decide the switch:

- `Toggle` always applies `aria-pressed={pressed}`, and its click handler toggles the pressed state,
  calling `groupContext.setGroupValue` inside a group [5:74-93].
- Inside a group, `Toggle` renders through `CompositeItem` with `tag="button"` and the caller's `render`
  [5:108-118]. `CompositeItem` gives the item a roving `tabIndex` of `0` when highlighted and `-1`
  otherwise [7:26-28]. `ToggleGroup` sets `role="group"` [6:79-81] and enables Home/End [6:98].

The data attributes are `data-pressed` / `data-disabled` on the toggle and `data-orientation` /
`data-multiple` on the group [8]. A search of the package's JavaScript for `data-state` returns nothing.

### 1.2 What the shadcn registry installs, and ADR-0008

This checkout is on the `base-maia` style with Hugeicons (`components.json:3,13` [11]). The Base UI
registry item is `https://ui.shadcn.com/r/styles/base-maia/toggle-group.json` [12]. It declares
`registryDependencies: ["toggle"]`, so `shadcn add toggle-group` installs **two** files — `toggle.tsx`
and `toggle-group.tsx` (the checkout has neither [14]). It imports `@base-ui/react/toggle` and
`@base-ui/react/toggle-group`, exports `ToggleGroup` and `ToggleGroupItem`, and takes `toggleVariants`
from the `toggle` item [12][13]. That variants function carries `aria-pressed:bg-muted`, the active
style Base UI actually triggers [13].

ADR-0008 forbids `@radix-ui/*` and `lucide-react` and says each wrapper imports its Base UI module
directly [15]. The `base-maia` item satisfies that; the Radix `new-york-v4` item depends on `radix-ui`
[16]. **Adding `components/ui/toggle-group.tsx` is therefore ADR-0008-compatible.** The widget
semantics, not the dependency, make it wrong here. One registry wrinkle: `ToggleGroupItem` carries
`data-[state=on]:bg-muted` [12], but Base UI 1.9.0 emits `data-pressed`, not `data-state` [8]. The
selector is dead; the active background still works via `aria-pressed:bg-muted` [13], because Base UI
emits `aria-pressed` [5:75]. Replace the dead selector with `data-pressed:` if the file is copied.

### 1.3 A `ToggleGroup` can render anchors — and that is the problem

`Toggle` extends `NativeButtonProps` and accepts `render` [3:24]. The installed docs say
`nativeButton` defaults to `true` and must be `false` when the rendered element is not a button [9], so
this is type-valid:

```tsx
<ToggleGroup value={[periode]}>
  <Toggle value="30j" nativeButton={false} render={<Link href="?periode=30j" />}>30 j</Toggle>
</ToggleGroup>
```

What renders is not three links: `useButton` with `native: false` adds `role="button"` to the anchor
[17:184-187], while `Toggle` still applies `aria-pressed` [5:75]; `CompositeItem` keeps one item in the
tab order and moves focus with the arrow keys [7:26-28], and `ToggleGroup` adds Home/End [6:98]; the
click handler toggles the group value *and* the anchor navigates [5:76-92].

ARIA defines `aria-pressed` as the pressed state of **toggle buttons** [18]. The `link` role supports
`aria-disabled`, `aria-expanded` and `aria-haspopup`, and inherits `aria-current` [19];
`aria-pressed` is not among them. `aria-current` is the state for "the current item within a container
or set of related elements" [20]. A period switch is a set of links whose current member is the active
period: `aria-current` is right, `aria-pressed` on an anchor is not. The runtime behaviour of a
`Toggle`-rendered `<Link>` was read from source but **not executed in a browser** (**unverified**); a
prototype would confirm that both the toggle handler and Next's navigation fire.

### 1.4 The alternatives in the existing kit

| Candidate | Cost | Verdict |
|---|---|---|
| **Three server-rendered `<Link>`s** with `buttonVariants` | Zero new client code; real link role; `aria-current` | **Recommended** |
| `Button render={<Link />}` | Same visual, but `nativeButton = !render` [22] makes Base UI add `role="button"` [17] | House pattern for action links; less accurate for a navigation set |
| `Badge render={<Link />}` | Real anchor (`useRender`, no role override [24]); already used on the dashboard [25] | Works, but `h-5` is small for a primary control |
| `Select` | Client wrapper over Base UI Select [21]; needs `onValueChange` + `router.replace` or a form | Heavier; hides two of three choices |
| ARIA `radiogroup` | Base UI radio group [26]; roving focus, client state, form semantics | Wrong widget for navigation |
| Base UI `ToggleGroup` | Two new files; client component; `role="button"` + `aria-pressed` on anchors; roving focus | Reject |

`buttonVariants` is already exported from `components/ui/button.tsx:61` [22], so the recommended option
adds no component and no style. A raw `<Link className={buttonVariants({ variant: "outline", size:
"sm" })}>` can be rendered from a server component, exactly like the existing `<Link>`s in `app/admin/page.tsx` [32].

## 2. The link seam

### 2.1 The URL language the repository already has

The listings separate four concerns; the period switch needs only the first and third:

1. **The grammar module.** `lib/commande-listing.ts` holds the path constant, a typed
   `CommandeListingParams`, a `firstValue` helper, a `parseCommandeListingParams` that validates every
   token and falls back to a default, and a `buildCommandeListingUrl` that uses `URLSearchParams` and
   omits default values [27]. `lib/produit-listing.ts` has the same shape [28].
2. **The use case.** `listAdminOrders(params)` builds the `where` and returns the page envelope.
3. **The server page.** `app/admin/commandes/page.tsx` receives `searchParams: Promise<RawSearchParams>`,
   renders the header, and wraps an async child in `<Suspense>`; the child awaits, parses and calls the
   use case [29].
4. **The client hook, only when interaction needs it.** `use-commande-listing.ts` exists for the 300 ms
   search debounce, sorting and pagination; it rebuilds hrefs with the same builder and calls
   `router.replace(href, { scroll: false })` [30:157], reconciling the server echo [31].

The dashboard already uses the grammar modules from a server component: the KPI hrefs are built with
`buildCommandeListingUrl` / `buildProduitListingUrl` at `app/admin/page.tsx:171-173` [32]. It also
already renders `Button render={<Link />}` [32:183-185] and `Badge render={<Link />}` [32:139-147].

**Add one pure module, not a second grammar and not a client hook.** Concretely:
`lib/tableau-de-bord-periode.ts` with a path constant, `PERIODE_VALUES = ["30j", "90j", "12mois"] as
const`, a `Periode` type, `parsePeriode(raw)` accepting only those tokens with an explicit default, and
`buildTableauDeBordUrl({ periode })` omitting the default. The server page parses once, passes the
typed period to the use case, and builds the three links from the same function. A discrete three-way
navigation has no debounce and no local draft, so the `use-commande-listing.ts` half is unnecessary.

If the page gains `searchParams`, follow the commandes shape: a `Promise` prop plus a `<Suspense>`
child [29]. The Next.js 16.4.3 docs shipped in this checkout say `searchParams` is a Promise and a
request-time API, and that where it is accessed determines how much of the page can be prerendered
[33]. The dashboard already calls `await connection()` at `app/admin/page.tsx:161` [32], so it is
dynamic; the Suspense child is still the house pattern and keeps the header outside the boundary. For
the links, `scroll={false}` stops Next from attempting to scroll to the first page element; the default
maintains scroll position but scrolls when the page is not visible in the viewport [34]. The orders hook
already passes `{ scroll: false }` [30:157]. The server stays the only reader of Prisma: the page calls
a use case, the use case calls `lib/db` [35]; the three links only carry a URL.

### 2.2 The smallest client surface

**Zero new client components.** The page is a server component, `next/link` is already rendered there,
and the active period is known on the server. The three links render with `aria-current="page"` on the
active one, no state, no `useRouter`, no `useSearchParams`. The `?periode=` change is a normal
navigation; the RSC re-renders and re-queries. The fallback, if a future design insists on a client
segmented control, is a tiny wrapper calling `router.replace(href, { scroll: false })`; it still never
touches Prisma. That is strictly more code than the links and is not needed here. The `ToggleGroup`
route would force that client surface *and* add the wrong semantics.

## 3. Thirty daily bars at 390 px

### 3.1 The props that exist in Recharts 3.10.1

The installed version is `recharts@3.10.1` [36]. `XAxis` exposes, among others:

| Prop | Type / default | What it does |
|---|---|---|
| `interval` | `AxisInterval`, default `"preserveEnd"` [37:120-125] | Which ticks are shown. A number `N` shows every `N+1`-th tick; string modes thin by measured collision [38:859] |
| `minTickGap` | `number`, default `5` [37:117-120] | Minimum pixel gap between labels in the `preserve*` modes |
| `angle` | `number`, default `0` [38:738] | Rotates tick text; the rotated width is used in collision calculation [42:145-155] |
| `tickFormatter` | `(value, index) => string` [38:793] | Formats labels and supplies the text whose width is measured |
| `tick` | `TickProp` (boolean, element, or function) [37:101; 38:760] | Replaces label rendering; it does **not** control tick lines |
| `hide` | `boolean`, default `false` [38:744] | Hides the whole axis (`CartesianAxis` returns `null` at [45:447]) |
| `height` | `number \| "auto"`, default `30` [37:35] | Axis height; `"auto"` grows to the measured label boxes, useful with `angle` |
| `tickLine` | `boolean \| SVGProps`, default `true` [38:784] | Whether a tick line is drawn for each rendered tick |
| `fontSize`, `letterSpacing` | `number \| string` [37:127-136] | Used to measure label widths instead of reading the DOM each time |

`Bar` also has `barSize` and `maxBarSize` [39], but those control bar width, not label crowding.

### 3.2 What the props actually do

`getTicks` is the decision point [42]. If `interval` is a number, or the render is server-side, it
returns `getEveryNth(ticks, interval + 1)` and skips measurement [42:132-135]. `getEveryNth` starts at
index 0 and steps by `N`, so `interval={4}` on thirty bars shows 0, 5, 10, 15, 20, 25 — the last bar is
not labelled [43:19-24]. Otherwise it measures the plot width from `viewBox`, measures each label with
`getStringSize`/`getAngledTickWidth`, and walks from the end (`preserveEnd`), the start
(`preserveStart`) or both (`preserveStartEnd`), dropping ticks closer than `minTickGap` [42:136-171].
`getStringSize` measures real DOM text and returns zero during SSR [44].

`CartesianAxis` computes `finalTicks` once and derives **both** tick lines and tick labels from it
[45:315-343]. So `interval`/`minTickGap` remove tick lines as well as labels; they do not keep a mark
per bar. A custom `tick` returning `null` hides only the label, because the tick line is rendered
separately from `finalTicks` [45:333-341,369-373]. `angle` is not a cure for thirty labels: it increases
the measured width used by the collision calculation, so fewer labels fit, and it usually needs
`height="auto"` (or a larger fixed height) so the rotated text is not clipped; `XAxis` implements
`height="auto"` by measuring the rendered tick boxes [46]. `hide` removes the axis entirely and is only
honest if the labels live somewhere else.

### 3.3 Sparse labels while keeping one tick and one tooltip per bar

The tooltip is independent of axis ticks. `selectTooltipAxisTicks` builds ticks from the full
categorical scale domain [47:91-146]; `selectActiveTooltipIndex` uses them [47:149]; `Bar` matches
`entry.originalDataIndex` against the active index [48:100,131]. `BarChart`'s default tooltip event type
is `"axis"` [49:15]. Thinning labels therefore leaves one active category — one tooltip — per bar.

Two recipes, depending on what "one tick per bar" means:

1. **Sparse labels, no tick lines (the current chart style).** `RevenueChart` already sets
   `tickLine: false` [50]. Use `interval="preserveStartEnd"`, `minTickGap={8}`, a short
   `tickFormatter` (for example `"12/08"` or the day number) and `fontSize={11}`. Recharts chooses the
   number of labels from the measured width; the mode guarantees first and last [42:166-171]. No width
   calculation is needed.
2. **Sparse labels but a visible tick line under every bar.** Set `interval={0}` so all thirty ticks
   survive [42:132-135], then hide most labels while leaving the lines: either a `tick` function
   returning `null` unless `index % N === 0`, or a `tickFormatter` returning `""` for those indices.
   Tick lines are still generated for all `finalTicks` [45:330-341]; only labels are suppressed. With
   `interval={0}` the `index` passed to `tickFormatter` is the data index; with a `preserve*` mode it is
   the index among the *shown* ticks, because `CartesianAxis` passes the `finalTicks` loop index
   [45:343,372]. An index-based formatter is only safe with `interval={0}`.

At the ticket's measured ~305 px plot [51], thirty bars give a band of about 10 px; thirty labels
cannot fit whatever their angle, and the realistic target is six to nine labels. The measurement was
not re-rendered here, so the exact number is **unverified**; the props above are the ones to tune in the
browser. For 90-day weekly (about thirteen bars) and 12-month monthly (twelve bars), the same props
work; month labels are longer, so keep `minTickGap` at 8 and expect six to eight labels.

### 3.4 Is the axis responsive out of the box?

Yes for tick thinning. `ResponsiveContainer` measures its parent with a `ResizeObserver` and provides
width and height to the chart [40:69; 41:97-118]; the axis uses that measured `viewBox` width in
`getTicks` [42:159]. `interval="preserveStartEnd"` plus `minTickGap` therefore adapt per axis without
application code. For a prop that must change *value* at a breakpoint (for example a different
`angle`), use `ResponsiveContainer`'s `onResize(width, height)` [40:59-62; 41:110]. `useIsMobile` is not
a substitute: it is a viewport `matchMedia` query at 767 px [52], while the chart card's width is set by
the grid (`lg:col-span-4`) and card padding [32:251]. CSS container queries can change classes but
cannot set the numeric `angle` prop on an SVG axis. Measure the container, not the viewport.

## 4. Recommendation

**Primitive.** Do not add `components/ui/toggle-group.tsx`. Render three server-side `<Link>`s styled
with `buttonVariants({ variant: "outline", size: "sm" })`, inside a `role="group"` container with
`aria-label="Période"` (or a `<nav>`), with `aria-current="page"` on the active period. This keeps the
link role, needs no client component and uses the existing style authority. `Button render={<Link />}`
is the established house pattern for action links, but Base UI gives that anchor `role="button"`; it is
acceptable if visual consistency wins, but a navigation set should stay links. The shadcn files are
ADR-0008-compatible but are the wrong widget and would add two files.

**Link seam.** Add one pure module, `lib/tableau-de-bord-periode.ts`, with the path constant,
`PERIODE_VALUES` (`"30j"`, `"90j"`, `"12mois"`), `parsePeriode(raw)` and
`buildTableauDeBordUrl({ periode })`, copying the shape of `lib/commande-listing.ts` [27]. Read the
promise in the server page inside `<Suspense>`, as `app/admin/commandes/page.tsx` does [29], pass the
typed period to the dashboard use case, and build the three hrefs from the same function. Use
`scroll={false}` [34]. No `use-*` hook and no `useRouter`; the server remains the only reader of Prisma
[35].

**Chart.** Keep `tickLine: false` and use `interval="preserveStartEnd"`, `minTickGap={8}`, a short
`tickFormatter` and `fontSize={11}`; add `angle={-45}` and `height="auto"` only if labels are long, and
use `hide` only with a caption elsewhere. If a tick line per bar is a design requirement, switch to
`interval={0}` plus a sparse `tick`/`tickFormatter`; tooltips stay per bar either way. Do not compute
the width by hand: `ResponsiveContainer` already measures, and `onResize` is there if a
breakpoint-specific prop is ever needed [40:59-62].

**Left to the build ticket.** The default period is a product choice the URL parser must state
explicitly: `30j` makes the chart answer the same window as the *CA encaissé* KPI; `12mois` preserves
today's chart. The short versus long label vocabulary is the map's existing *Not yet specified* item.
The exact label count at 390 px, and the runtime behaviour of a `Toggle`-rendered link, remain
**unverified** until rendered in a browser.

## Sources

[1][2] — `node_modules/@base-ui/react/package.json` (1.9.0); `index.d.ts:38-39` — package version and barrel exports.
[3][4] — `toggle/Toggle.d.ts:24-50`; `toggle-group/ToggleGroup.d.ts:35-68` — `Toggle` and `ToggleGroup` props.
[5][6][7][8] — `toggle/Toggle.js:74-93,108-118`; `toggle-group/ToggleGroup.js:79-81,88-100`; `internals/composite/item/useCompositeItem.js:26-28`; the two `*DataAttributes.d.ts` files — `aria-pressed`, roving focus, `data-pressed`/`data-orientation`; no `data-state` in the package's JS.
[9][10] — `node_modules/@base-ui/react/docs/react/components/toggle.md:227-252` and `toggle-group.md:548-554` — `nativeButton`, `render`, roving focus.
[11] — `components.json:3,13` — `"style": "base-maia"`, `"iconLibrary": "hugeicons"`.
[12][13] — `https://ui.shadcn.com/r/styles/base-maia/toggle-group.json` and `.../toggle.json` (fetched 2026-11-08) — Base UI imports, `registryDependencies: ["toggle"]`, `toggleVariants` with `aria-pressed:bg-muted`.
[14] — `components/ui/` listing — no `toggle.tsx`, no `toggle-group.tsx`.
[15] — `docs/adr/0008-base-ui-hugeicons-not-radix-lucide.md:3-5` — Base UI wrappers; no Radix, no Lucide.
[16] — `https://ui.shadcn.com/r/styles/new-york-v4/toggle-group.json` (fetched 2026-11-08) — depends on `radix-ui`.
[17] — `node_modules/@base-ui/react/internals/use-button/useButton.js:184-187` — `role: "button"` when `nativeButton` is false.
[18][19][20] — W3C WAI-ARIA 1.2, `aria-pressed`, `link`, `aria-current` — https://www.w3.org/TR/wai-aria-1.2/ (fetched 2026-11-08).
[21][24][26] — `components/ui/select.tsx:1-4`, `badge.tsx:41-62`, `radio-group.tsx:1-10` — client wrappers and `useRender`.
[22] — `components/ui/button.tsx:45-61` — `nativeButton = !render`; exports `buttonVariants`.
[23][25][32] — `app/admin/page.tsx:139-147,161,171-173,183-185,251` — KPI links, `connection()`, `Button`/`Badge` render, chart card span.
[27][28] — `lib/commande-listing.ts:5,42-75,77-95`; `lib/produit-listing.ts:124-151` — URL grammar and builder.
[29][30][31] — `app/admin/commandes/page.tsx:16-45`; `commandes-table.tsx:152-159`; `use-commande-listing.ts:81-119` — Promise `searchParams`, `router.replace`, echo.
[33][34] — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:67-120` and `02-components/link.md:230-236` — `searchParams` Promise; `scroll={false}`.
[35] — `docs/ARCHITECTURE.md:40-46` — no page or action touches `lib/db`.
[36][37][38][39] — `node_modules/recharts/package.json` (3.10.1); `types/cartesian/XAxis.d.ts:35,101,117-136`; `types/util/types.d.ts:738,744,760,784,793,859`; `types/cartesian/Bar.d.ts:73-75,117`.
[40][41] — `node_modules/recharts/types/component/ResponsiveContainer.d.ts:59-62,66-72`; `es6/component/ResponsiveContainer.js:97-118` — `onResize`, `ResizeObserver`.
[42][43][44] — `es6/cartesian/getTicks.js:119-171`; `es6/util/getEveryNth.js:12-27`; `es6/util/DOMUtils.js:66-91` — interval, every-N, measurement.
[45][46] — `es6/cartesian/CartesianAxis.js:315-373,447`; `es6/cartesian/XAxis.js:90-105` and `es6/util/XAxisUtils.js:11-40` — `finalTicks`, `hide`, `height="auto"`.
[47][48][49] — `es6/state/selectors/tooltipSelectors.js:91-146,149`; `es6/cartesian/Bar.js:100,126-131`; `es6/chart/BarChart.js:15` — tooltip ticks, active index, axis tooltip.
[50][51][52] — `components/admin/revenue-chart.tsx:28-32,57-88`; issue #962 body; `components/ui/use-mobile.ts:5-20` — current chart, ~305 px ticket measurement, viewport hook.
