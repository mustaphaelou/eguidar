# Motion plans

Audit run with the `improve-animations` method against commit `f066e0b`, focused on the
Panier trigger in the Bandeau de navigation. These plans are self-contained: an executor
with no context from the audit can run one without re-deciding anything.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [The Panier trigger answers the press](001-panier-trigger-press.md) | HIGH | DONE — PR [#764](https://github.com/mustaphaelou/eguidar/pull/764) |

## Recommended order

1. **001** — the click currently has no answer at 0ms; everything else is polish by
   comparison.

## Dependencies

None. 001 touches only `components/storefront/global-nav-bar.tsx` and deliberately
leaves `components/ui/button.tsx` and `app/globals.css` to the plans that own them
(closing motion, badge motion, button transition-property list).
