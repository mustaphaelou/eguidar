# Base UI and hugeicons instead of Radix and lucide in the Administration shell

The shadcn ecosystem's reference implementations (including satnaing/shadcn-admin, our dashboard reference) are built on Radix primitives and lucide-react, but this repo standardises on `@base-ui/react` wrappers (`components/ui/*`) and `@hugeicons/react`. We therefore hand-port the admin sidebar, data-table kit, and chart wrappers onto Base UI modules using the `render={…}` prop instead of `asChild`, and never add `@radix-ui/*` or `lucide-react` dependencies — copy-pasting official shadcn components wholesale would introduce a second primitive stack.

The port is realised in `components/ui/*`, which is now the authority for the module and icon mappings rather than any throwaway study: each wrapper imports its Base UI module directly (`@radix-ui/react-dropdown-menu` → `@base-ui/react/menu`, `@radix-ui/react-slot` → the `render={…}` prop and `useRender`) and every glyph comes from `@hugeicons/core-free-icons`. `breadcrumb.tsx` stays plain markup because no primitive was needed for it.

## Considered options

- Adopting Radix + lucide for the admin area only — rejected: splits the component foundation and duplicates wrappers that already exist.
