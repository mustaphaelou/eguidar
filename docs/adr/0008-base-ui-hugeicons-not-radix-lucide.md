# Base UI and hugeicons instead of Radix and lucide in the Administration shell

The shadcn ecosystem's reference implementations (including satnaing/shadcn-admin, our dashboard reference) are built on Radix primitives and lucide-react, but this repo standardises on `@base-ui/react` wrappers (`components/ui/*`) and `@hugeicons/react`. We therefore hand-port the admin sidebar, data-table kit, and chart wrappers onto Base UI modules using the `render={…}` prop instead of `asChild`, and never add `@radix-ui/*` or `lucide-react` dependencies — copy-pasting official shadcn components wholesale would introduce a second primitive stack. See `docs/research/shadcn-admin-dashboard.md` §4 for the verified module/icon mappings.

## Considered options

- Adopting Radix + lucide for the admin area only — rejected: splits the component foundation and duplicates wrappers that already exist.
