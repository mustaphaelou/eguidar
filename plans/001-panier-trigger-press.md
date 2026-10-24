# 001 — The Panier trigger answers the press

- **Status**: DONE — PR #764 (`plan/001-panier-press` @ e30d9d7)
- **Commit**: f066e0b
- **Severity**: HIGH
- **Category**: 3 — Physicality & origin (feedback)
- **Estimated scope**: 1 file, three small wrappers

## Problem

Clicking the bag produces no motion on the control that was clicked. The shared
button's only press feedback is a one-pixel downward nudge:

```tsx
// components/ui/button.tsx:7 — current (excerpt)
"group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px ..."
```

The trigger itself is a 36px ghost icon whose glyph never changes:

```tsx
// components/storefront/global-nav-bar.tsx:141-153 — current
<Button
  ref={panierRef}
  variant="ghost"
  size="icon"
  aria-label="Panier"
  aria-expanded={ouvert}
  aria-controls={ID_APERCU_DU_PANIER}
  className="relative"
  onClick={basculerLApercu}
>
  <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} />
  {panierBadge}
</Button>
```

One pixel on a 36px button is imperceptible. Meanwhile the panel's own entrance is a
320ms height reveal whose scrim waits 80ms (`app/globals.css:259-288`), so for the
first ~100ms after the click nothing in the interface has visibly moved. The click
reads as dead, and the control that owns the panel never acknowledges it.

The same is true of the other two icon controls in the Bandeau: Recherche
(`components/storefront/global-nav-bar.tsx:121-139`) and Menu (`:155-168`).

## Target

The glyph compresses to 90% while the pointer is down and returns to 100% on release.
The 36px hit area, the ghost pill and the badge are not scaled (they keep the shared
button's pre-existing 1px nudge). Timing is asymmetric:
**100ms into the press** (the interface answering), **160ms out** (it settling), on the
repo's strong ease-out curve `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
(`app/globals.css:58`, already exposed as the `ease-out` utility).

```tsx
// components/storefront/global-nav-bar.tsx — target, Panier button
<Button
  ref={panierRef}
  variant="ghost"
  size="icon"
  aria-label="Panier"
  aria-expanded={ouvert}
  aria-controls={ID_APERCU_DU_PANIER}
  className="relative"
  onClick={basculerLApercu}
>
  {/* Le badge reste hors du span : `scale` en fait le bloc conteneur du badge absolu. */}
  <span className="flex items-center justify-center group-active/button:duration-[100ms] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out motion-safe:group-active/button:scale-90">
    <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} />
  </span>
  {panierBadge}
</Button>
```

Why a wrapper instead of `active:scale-90` on the `Button`:

- `Button` already carries `active:not-aria-[haspopup]:translate-y-px`; two press
  effects on one element fight each other.
- Scaling the `Button` would also scale its ghost background (`aria-expanded:bg-muted`)
  and the badge. A 36px pill that shrinks under the cursor reads as a layout bug, not a
  press.
- The wrapper scales the glyph only; the surface and the badge stay put.

Why `{panierBadge}` stays outside the wrapper: a non-`none` `scale` makes the span the
containing block for absolutely positioned descendants, so the badge (which is
`absolute -top-1 -right-1` against the `Button`) would jump to the icon's corner
instead of the button's corner.

## Repo conventions to follow

- Motion is gated site by site with `motion-safe:` / `motion-reduce:`; there is no
  global `*` motion rule. Exemplar: `components/storefront/article-du-panier.tsx:193`.
- `group/button` is already on every `Button` (`components/ui/button.tsx:7`), so
  `group-active/button:` needs no new prop on the button. Named-group precedent:
  `components/ui/accordion.tsx:49` uses `group-aria-expanded/accordion-trigger:`.
- `ease-out` is the repo's curve, not Tailwind's default: `--ease-out` is overridden in
  `app/globals.css:58`.
- Class strings are written inline and repeated rather than extracted into constants
  (see the two steppers in `components/storefront/article-du-panier.tsx:193,210`).
- Tailwind class order is owned by `prettier-plugin-tailwindcss`, and `npm run
  format:check` is a CI job. Write the class string in the order Prettier emits (the
  order in the Target block above), or run `npx prettier --write
  components/storefront/global-nav-bar.tsx` afterwards. Hand-ordering it fails the
  format job even though the utilities are identical.

## Steps

1. `components/storefront/global-nav-bar.tsx:121-139` (Recherche): wrap the
   `<HugeiconsIcon … />` in the span string above. Leave every prop, including the
   conditional icon, untouched.
2. `components/storefront/global-nav-bar.tsx:141-153` (Panier): wrap the
   `<HugeiconsIcon icon={ShoppingBag01Icon} … />` in the same span. Keep
   `{panierBadge}` a sibling **after** the span, and add the one comment shown above.
3. `components/storefront/global-nav-bar.tsx:155-168` (Menu): wrap the
   `<HugeiconsIcon … />` in the same span.

The exact class string to reuse three times:

```
flex items-center justify-center group-active/button:duration-[100ms] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out motion-safe:group-active/button:scale-90
```

## Boundaries

- Do NOT change `components/ui/button.tsx` or `app/globals.css`. The 1px nudge and the
  shared transition-property list are app-wide and are handled by separate plans.
- Do NOT wrap the badge inside the span, and do NOT add `relative` to the span.
- Do NOT change icon choices, `aria-*` attributes, labels, or open/close logic.
- Do NOT add dependencies.
- If these lines no longer match the file, STOP and report instead of improvising.

## Verification

- **Mechanical**: `bash scripts/checks.sh` (the repo's gate — it runs the same checks
  as CI). Targeted: `npm run format:check` (it owns the class order and is a CI job),
  `npm run typecheck`, and
  `npx vitest run components/storefront/global-nav-bar.test.tsx`. The tests assert
  behaviour, not classes, so they should pass untouched.
- **Feel check** (`npm run dev`), on the bag first and then Recherche and Menu:
  - Clicking compresses the glyph visibly at the moment of the press, and it is back to
    full size by the time the panel finishes opening.
  - Holding the button keeps the glyph at 90% for as long as it is held.
  - The ghost pill behind the icon does not change size; the badge does not move.
  - Pressing with the mouse, dragging off the button, then releasing does not leave the
    glyph stuck small.
  - DevTools → Animations → 10% playback: the compression is smooth, with no snap on
    the first frame.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: no compression at
    all, while the panel still opens.
- **Done when**: all three header icon controls compress on press, no layout shift
  occurs, reduced motion drops the compression, and `scripts/checks.sh` is green.
