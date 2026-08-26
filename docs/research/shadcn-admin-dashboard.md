# The shadcn-admin dashboard (satnaing) — research findings for an eguidar admin

> Research-only document. Every claim is traced to a primary source: the actual source files of `github.com/satnaing/shadcn-admin` (via `raw.githubusercontent.com` and the GitHub API), the HTML/text served by the referenced demo site, official shadcn/ui docs, and the npm registry — plus local files in this repo (`eguidar`). Retrieval date for all remote sources: **26 Aug 2026**. See [Sources](#sources) for the full URL list. One important discrepancy was found up front: **the demo URL supplied as reference is *not* the satnaing/shadcn-admin demo** — see §1.

## Summary

The reference material splits into two different things. (1) The live site `https://nextjs-ecommerce-dashboard.shadcnadmin.com/` is a **separate "ShopHaus" e-commerce admin template** (sidebar: Dashboard/Products/Orders/Customers/Analytics/Apps/Sales Channels…; a dense KPI + chart + leaderboard overview page) whose internals could only be inspected from rendered text — its title tags it as a Next.js/Tailwind/Shadcn template, but its component wiring is not publicly traceable. (2) The open-source project the user wants to model — **satnaing/shadcn-admin** (MIT, 14,021 stars, official demo `https://shadcn-admin.netlify.app/`) — is a Vite + TanStack Router SPA, *not* Next.js: its dashboard feature (`src/features/dashboard/`) renders four stat Cards, a Recharts `<BarChart>` monthly-revenue overview, a Recent-Sales avatar list, and an Analytics tab (Recharts `<AreaChart>` + pure-CSS bar lists), all inside a `SidebarProvider` shell whose collapse state persists in a `sidebar_state` cookie (7-day max-age, Ctrl/Cmd+B shortcut). Its tables are `@tanstack/react-table` v8 compositions (`users-columns.tsx` + shared `src/components/data-table/`: toolbar, faceted filter (Popover+cmdk), view-options (dropdown checkboxes), numbered pagination) with pagination/column-filters synced to the URL through a custom `useTableUrlState` hook. Its dependency stack is Radix-based (`@radix-ui/react-*`, 20 packages), `lucide-react`, `recharts ^3.8.1`, `@tanstack/react-table ^8.21.3`, Tailwind v4, React 19. For eguidar, everything Radix maps onto the `@base-ui/react@^1.7.0` modules already installed (dialog/select/menu/popover/tooltip/collapsible/tabs/checkbox/avatar/alert-dialog all exist in `node_modules`), every lucide glyph has a free Hugeicons counterpart (5,442 icons shipped), and Recharts officially peers with `react ^19.0.0` — so adoption is mostly **new files** (a ported sidebar, a small data-table kit, two chart wrappers) rather than conflicts. Notably, eguidar's `app/globals.css` already defines the full `--chart-1..5` and `--sidebar-*` token sets, and `lib/use-cases/admin-dashboard.ts` already produces most overview-card data.

---

## 1. What the reference actually consists of — and the URL discrepancy

### 1.1 The given demo URL serves a different product ("ShopHaus")

Fetching `https://nextjs-ecommerce-dashboard.shadcnadmin.com/` returns a page titled **"Next.js E-commerce Admin Dashboard Tailwind CSS Template | Shadcn Admin"**, branded "Shadcn Admin" in the sidebar header, but with content that matches **none** of the satnaing/shadcn-admin routes (no Users/Tasks/Settings pages, no TanStack Router). It is a distinct e-commerce dashboard template. Primary source: served page text (webfetch + Exa fetch, 26 Aug 2026). Its JS bundle was **not** analyzed, so its internal component dependencies could not be verified from primary sources — everything below about it is limited to the rendered DOM text.

Inventory of that page (verbatim from served text):

- **Sidebar**: sections "Dashboard / Products / Orders / Filters / Customers / Analytics", an "Apps" group (Messages, Add Apps), a "Sales Channels" group (Online Store, Point of Sale), then Shop / Settings / Help Center / Support / Download. Top bar: breadcrumb "Online Store › Home › Dashboard", a theme Toggle, and a "John Doe" user chip.
- **Dashboard body**: "Welcome Toby" + "Wednesday, August 26 — Here's what's happening at ShopHaus today."; an Export button; a range chip "30 Jul 2026 - 26 Aug 2026".
  - KPI row: Sales performance `$23,127` (+12% vs last month), Total Sales `1,849` (+3%), Average Revenue `$15,239` (+8%), Average Order `2,034` (−3%).
  - Performance Goal radial ("Sales $5.65K", View Reports); Monthly Earning `32.46K +12.4%`.
  - Sales by Countries list (US +27.4%/+$1,999.00, Brazil, India −5%, Australia, France +2.1%, Greece −0.1%).
  - Sales Report "Monthly $84,994.80 16% from last period" (with chart); Store Overview `$89,585` split into Store Sales `$42,455` / Visits `$38,625` / Avg Earnings `$1,245` / Refunds.
  - Weekly Stats (Total Sales 2,458 Today $5,258; Total Revenue; Revenue target $4,958); Sales History avatar list (Timothy Boyd 14 Dec 2023 $750.00 …).
  - Best Selling list (product + SKU `RWL-H-001…` + review counts); Recent Reviews (name, star rating, blurb); Top Selling Stores table (Rank / Store+category / Score / Revenue / Sales / Orders / Growth).

Primary source: rendered text of the URL above (retrieved twice — webfetch and Exa — 26 Aug 2026).

### 1.2 The actual satnaing/shadcn-admin project

GitHub repository metadata: description **"Admin Dashboard UI built with Shadcn and Vite."**, license MIT, language TypeScript, 14,021 stars, default branch `main` (tree sha `e16c87f213a5ba5e45964e9b67c792105ec74d26`, last push 2026-07-21), and **homepage/demo: `https://shadcn-admin.netlify.app/`**. Primary source: GitHub API `GET /repos/satnaing/shadcn-admin` (26 Aug 2026). The netlify demo itself was not crawled in this session (flagged rather than guessed).

Its README states the stack verbatim: "**UI:** ShadcnUI (TailwindCSS + RadixUI) · **Build Tool:** Vite · **Routing:** TanStack Router · **Auth (partial):** Clerk · **Icons:** Lucide Icons, Tabler Icons (brand icons only)", plus features "Light/dark mode … built-in Sidebar component, Global search command, 10+ pages, RTL support". Several `components/ui/*` files are flagged in the README as customized for RTL. Primary source: `raw.githubusercontent.com/satnaing/shadcn-admin/main/README.md`.

---

## 2. Route/page inventory and layout anatomy (satnaing/shadcn-admin)

### 2.1 Full file-tree shape (routes ↔ features)

From the recursive git tree (`api.github.com/.../git/trees/main?recursive=1`, sha `e16c87f`):

- `src/routes/(auth)/`: `sign-in.tsx`, `sign-in-2.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `otp.tsx`; `src/routes/(errors)/`: `401|403|404|500|503.tsx`.
- `src/routes/_authenticated/`: `route.tsx` (layout), `index.tsx` (dashboard `/`), `apps/index.tsx`, `chats/index.tsx`, `errors/$error.tsx`, `help-center/index.tsx`, `tasks/index.tsx`, `users/index.tsx`, and `settings/{route,index,account,appearance,display,notifications}.tsx`. A separate `src/routes/clerk/*` subtree hosts Clerk-wired sign-in/sign-up/user-management demos.
- Feature implementations live in `src/features/<name>/` mirroring routes: `dashboard/` (`index.tsx`, `components/{overview,recent-sales,analytics,analytics-chart}.tsx`), `users/` (`components/{users-table,users-columns,users-action-dialog,users-delete-dialog,users-invite-dialog,users-multi-delete-dialog,users-dialogs,data-table-row-actions,data-table-bulk-actions,users-primary-buttons}.tsx`, `data/{schema.ts,data.tsx,users.ts}`), `tasks/`, `settings/{profile,account,appearance,display,notifications}/`, `auth/{sign-in,sign-up,forgot-password,otp}/`.
- Shared building blocks: `src/components/layout/` (`app-sidebar.tsx`, `nav-group.tsx`, `nav-user.tsx`, `team-switcher.tsx`, `header.tsx`, `main.tsx`, `top-nav.tsx`, `authenticated-layout.tsx`, `data/sidebar-data.ts`, `types.ts`), `src/components/data-table/` (`toolbar.tsx`, `faceted-filter.tsx`, `view-options.tsx`, `pagination.tsx`, `column-header.tsx`, `bulk-actions.tsx`, `index.ts`), plus app-level widgets (`command-menu.tsx` on cmdk, `theme-switch.tsx`, `profile-dropdown.tsx`, `config-drawer.tsx`, `search.tsx`, `navigation-progress.tsx`, `skip-to-main.tsx`).

### 2.2 The authenticated shell

`src/routes/_authenticated/route.tsx` is one line of routing: `component: AuthenticatedLayout`. The real shell is `src/components/layout/authenticated-layout.tsx`:

```tsx
const defaultOpen = getCookie('sidebar_state') !== 'false'
return (
  <SearchProvider>
    <LayoutProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset className='@container/content …has-data-[layout=fixed]:h-svh…'>
          {children ?? <Outlet />}
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  </SearchProvider>
)
```

Primary source: `raw.githubusercontent.com/satnaing/shadcn-admin/main/src/components/layout/authenticated-layout.tsx` (26 Aug 2026).

### 2.3 Header

`src/components/layout/header.tsx` renders `SidebarTrigger` (hamburger/panel toggle) + a vertical `Separator` + arbitrary children, tracks scroll offset, and when `fixed` becomes sticky with a shadow + `backdrop-blur-lg` scrim after 10 px of scroll. Primary source: same repo path `src/components/layout/header.tsx`.

`app-sidebar.tsx` composes `SidebarHeader(TeamSwitcher)` → `SidebarContent(NavGroup×N)` → `SidebarFooter(NavUser)` → `SidebarRail`, reading `collapsible`/`variant` from a `LayoutProvider` context. Primary source: `src/components/layout/app-sidebar.tsx`.

### 2.4 Nav data and the three nav-item modes

`src/components/layout/data/sidebar-data.ts` defines `navGroups`: "General" (Dashboard `/`, Tasks, Apps, Chats badge '3', Users, a Clerk sub-group), "Pages" (Auth → 5 auth URLs, Errors → 5 error URLs), "Other" (Settings → Profile/Account/Appearance/Notifications/Display, Help Center) — all icons imported from `lucide-react`. Primary source: same path (26 Aug 2026).

`src/components/layout/nav-group.tsx` picks a renderer per item: plain `SidebarMenuButton asChild → Link`; when the sidebar is expanded, a `Collapsible` wrapping trigger + `CollapsibleContent(SidebarMenuSub)` with a rotating `ChevronRight`; when collapsed on desktop, instead a `DropdownMenu` popping the sub-items to the side. Active state is computed from `location.href` prefix matching (`checkIsActive`). Primary source: same path.

### 2.5 What each page uses (dashboard example)

`src/features/dashboard/index.tsx`: `<Header>` containing `TopNav links={topNav}` + `Search` + `ThemeSwitch` + `ConfigDrawer` + `ProfileDropdown`; then `<Main>` with an `h1` + Download `<Button>`, and a vertical-orientation `<Tabs>` (Overview active; Analytics active; Reports/Notifications `disabled`). Overview tab content is described fully in §5. Primary source: `src/features/dashboard/index.tsx`.

---

## 3. Dependencies: what shadcn-admin requires vs what eguidar already has

`package.json` of shadcn-admin (v2.2.1, retrieved 26 Aug 2026) declares these runtime dependencies (verbatim versions):

- UI primitives: **20 `@radix-ui/react-*` packages** (`alert-dialog ^1.1.15, avatar ^1.1.11, checkbox ^1.3.3, collapsible ^1.1.12, dialog ^1.1.15, direction ^1.1.1, dropdown-menu ^2.1.16, icons ^1.3.2, label ^2.1.8, popover ^1.1.15, radio-group ^1.3.8, scroll-area ^1.2.10, select ^2.2.6, separator ^1.1.8, slot ^1.2.4, switch ^1.2.6, tabs ^1.1.13, tooltip ^1.2.8, label, …`).
- Charts/tables/forms: **`recharts ^3.8.1`**, **`@tanstack/react-table ^8.21.3`**, `react-hook-form ^7.72.1` + `@hookform/resolvers ^5.2.2`, `zod ^4.3.6`, `date-fns ^4.1.0`, `react-day-picker 9.14.0`, `input-otp ^1.4.2`.
- Shell/extras: `cmdk 1.1.1` (command palette + faceted filter), `sonner ^2.0.7` (toasts), `lucide-react ^1.8.0` (version string as published), `next-themes` — **absent** (theming is a custom `src/context/theme-provider.tsx`), `zustand ^5.0.12`, `@tanstack/react-query ^5.99.0`, `@tanstack/react-router ^1.168.22`, `axios`, `react-top-loading-bar ^3.0.2`, `class-variance-authority ^0.7.1`, `clsx`, `tailwind-merge ^3.5.0`, `tailwindcss ^4.2.2`, `tw-animate-css ^1.4.0`, `@clerk/react ^6.4.3`, `react/react-dom ^19.2.5`.

eguidar's `package.json` (local, read 26 Aug 2026) already has: `next 16.3.2`, `react/react-dom 19.2.4`, `tailwindcss ^4`, `tw-animate-css`, `cva`, `clsx`, `tailwind-merge`, `zod ^4.4.3`, `next-themes ^0.4.6` (wired via `components/theme-provider` in `app/layout.tsx`), `@base-ui/react ^1.7.0`, `@hugeicons/react ^1.1.9` + `@hugeicons/core-free-icons ^4.2.3`, `better-auth`, Prisma 7.9.1, and the `shadcn` CLI `^4.16.2`.

Gap analysis:

| shadcn-admin dep | Needed for | eguidar status |
|---|---|---|
| `@tanstack/react-table ^8.21.3` | all list pages | **missing — add** |
| `recharts ^3.8.1` (latest 3.10.1) | overview/analytics charts | **missing — add** |
| `cmdk 1.1.1` | command menu, faceted filters | missing — add *or* rebuild faceted filter on Base UI `combobox` |
| `sonner` | toasts | optional (eguidar has none yet) |
| 20 × `@radix-ui/react-*` | dialogs/menus/etc. | **do NOT add** — replaced by `@base-ui/react` (see §4) |
| `lucide-react`, `@radix-ui/react-icons` | icons | **do NOT add** — use `@hugeicons/*` (see §4) |
| `@tanstack/react-router` / `-query`, `axios`, `zustand`, `@clerk/react`, `input-otp`, `react-top-loading-bar` | SPA plumbing, Clerk auth, OTP UI | **do NOT add** — Next.js App Router + server actions + better-auth cover these roles |
| `react-hook-form` + resolvers, `date-fns`, `react-day-picker` | forms/date pickers | optional; eguidar currently uses plain server actions + zod |

Sources: shadcn-admin `package.json` (raw, 26 Aug 2026); eguidar `package.json` (local read, 26 Aug 2026).

---

## 4. Compatibility with eguidar's stack (Base UI, hugeicons, React 19, Next 16, Tailwind v4)

### 4.1 Radix primitive → Base UI module map (verified against the locally installed package)

Every Radix primitive used in the shadcn-admin demo flow has a corresponding module in the **already-installed** `node_modules/@base-ui/react@^1.7.0` (directory listing of that package, 26 Aug 2026): `alert-dialog`, `avatar`, `checkbox`(+`checkbox-group`), `collapsible`, `dialog`, `menu` (this is Base UI's dropdown-menu), `popover`, `scroll-area`, `select`, `separator`, `switch`, `tabs`, `tooltip`, `radio-group`, plus extras eguidar may want later (`combobox`, `autocomplete`, `toast`, `form`, `field`, `menubar`, `context-menu`, `toolbar`, `direction-provider` for RTL).

| shadcn-admin usage (file) | Radix pkg | eguidar equivalent | Evidence |
|---|---|---|---|
| Dialogs (confirm/delete/invite) | `react-dialog` | `@base-ui/react/dialog` | `components/ui/dialog.tsx` exists (Base UI import verified) |
| Select (rows-per-page) | `react-select` | `@base-ui/react/select` | `components/ui/select.tsx` exists, imports `Select as SelectPrimitive from "@base-ui/react/select"` |
| Dropdown menus (view-options, row actions, nav-user, profile-dropdown) | `react-dropdown-menu` | `@base-ui/react/menu` | module directory present; **no `components/ui/dropdown-menu.tsx` yet — create one** |
| Popover (faceted filter) | `react-popover` | `@base-ui/react/popover` | module present; wrapper to create |
| Tooltip (collapsed sidebar buttons) | `react-tooltip` | `@base-ui/react/tooltip` | module present; wrapper to create |
| Collapsible (nav groups) | `react-collapsible` | `@base-ui/react/collapsible` | module present; wrapper to create |
| Tabs (dashboard tab bar) | `react-tabs` | `@base-ui/react/tabs` | module present; wrapper to create |
| Checkbox (select-all rows) | `react-checkbox` | `@base-ui/react/checkbox` | module present; wrapper to create |
| Avatar (recent sales, nav-user) | `react-avatar` | `@base-ui/react/avatar` | module present; wrapper to create |
| Alert dialog (multi-delete) | `react-alert-dialog` | `@base-ui/react/alert-dialog` | module present |
| ScrollArea (sidebar content) | `react-scroll-area` | `@base-ui/react/scroll-area` | module present |
| Separator / Switch | respective pkgs | already wrapped in `components/ui/{separator,switch}.tsx` | local files |
| `Slot` (`asChild`) | `react-slot` | **`render={…}` prop** (Base UI idiom) + `use-render`/`merge-props` modules | eguidar already uses this idiom: `<Button render={<Link href="…" />}>` in `app/admin/page.tsx:21` |
| Mobile sidebar = `Sheet` | `react-dialog` based | no dedicated Base UI module — build `sheet.tsx` on `@base-ui/react/dialog` | Base UI package has no `sheet` dir (listing, 26 Aug 2026) |
| Command palette / faceted filter list | `cmdk` | either add `cmdk` (what shadcn's `command` wraps) or compose on `@base-ui/react/combobox` | both options documented above |

Key mechanical difference to adapt everywhere during a port: Radix's `asChild` polymorphism becomes Base UI's `render` prop (proven in-repo by `button.tsx` importing `Button as ButtonPrimitive from "@base-ui/react/button"` and the `render={<Link/>}` call site). Sources: local `components/ui/button.tsx`, `components/ui/select.tsx`, `app/admin/page.tsx`, `node_modules/@base-ui/react` listing (26 Aug 2026).

### 4.2 Icon mapping: lucide-react → @hugeicons/react

eguidar's convention (from `components/ui/select.tsx`): `import { HugeiconsIcon } from "@hugeicons/react"` + named glyphs from `@hugeicons/core-free-icons`. That package ships **5,442 icon type files**; directory listing of `node_modules/@hugeicons/core-free-icons/dist/types` (26 Aug 2026) confirms free counterparts for the glyphs shadcn-admin's sidebar/nav actually use:

| shadcn-admin (lucide, from `sidebar-data.ts`) | Verified free Hugeicons candidate |
|---|---|
| `LayoutDashboard` | `DashboardSpeed02Icon` (also `DashboardSquareSettingIcon`) |
| `Users` | `UserMultiple02Icon` |
| `Settings` | `Settings03Icon` / `Settings05Icon` |
| `Package` (Apps) | `BoxIcon` or `PackageProcessIcon` |
| `ListTodo` (Tasks) | `TaskDone01Icon` |
| `Bell` (Notifications) | `Notification01Icon` |
| `MessagesSquare` (Chats) | (chat icons exist; exact pick unverified) |
| chevrons/arrows, check, plus-circle, sliders, cross | family exists: `ArrowUp01Icon`, `Tick02Icon`, `PlusSignCircleIcon`, `SlidersHorizontalIcon`, `Sorting02Icon`, `FilterVerticalIcon` (first three already imported somewhere in `components/ui/select.tsx`) |

Ecommerce-specific glyphs for eguidar's own nav are likewise present: `ShoppingBasket02Icon`, `ShoppingCartAdd02Icon`, `StoreManagement02Icon`, `AnalyticsUpIcon`, `ChartNoAxesColumnIncreasingIcon`, `DeliveryTruck01Icon`, `MapsLocation01Icon`, `SaleTagIcon`/`TagsIcon`, `ReceiptDollarIcon`, `Wallet01Icon`. Any glyph not listed here must be verified against the package before use (listing consulted 26 Aug 2026).

### 4.3 React 19 / Next 16 / Tailwind v4 flags

- **Recharts ↔ React 19: compatible.** `registry.npmjs.org/recharts/latest` (v3.10.1, published 2026) declares `peerDependencies: { react: "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0", react-dom: "…|| ^19.0.0", react-is: "…|| ^19.0.0" }`. shadcn-admin itself runs `react ^19.2.5` with `recharts ^3.8.1`, and shadcn/ui's chart docs state the `chart` component "now uses Recharts v3". No React-19 blocker found.
- **Tailwind v4: aligned.** Both projects are on v4 (`tailwindcss ^4.2.2` + `tw-animate-css` there; `^4` + `tw-animate-css` in eguidar). The sidebar's stylesheet relies on logical-property utilities (`inset-s-`, `ms-`, `pe-`, `rtl:` variants) which are standard v4 utilities — and match eguidar's `components.json` `"rtl": true`.
- **Design tokens: already present in eguidar.** `app/globals.css` (read 26 Aug 2026) maps `--color-chart-1..5` and the entire `--sidebar-*` token family in `@theme inline` (values currently an amber oklch ramp for charts, neutral sidebar), so shadcn's sidebar/chart classnames (`bg-sidebar`, `fill-primary`, `text-chart-*`) resolve immediately. Values can be re-pointed without touching components.
- **Next 16 / App Router: structural rewrite required, not a blocker.** shadcn-admin is a Vite SPA (TanStack Router file-routes, `Outlet`, client-side loaders). Adopting its *look* means recreating routes under `app/admin/**` with `"use client"` leaf components (eguidar's existing `components/ui/*` already follow the `"use client"` + server-parent pattern; see `app/admin/page.tsx` being an async server component rendering client primitives).
- **Theming:** shadcn-admin ships its own `ThemeProvider` context; eguidar already has `next-themes` wired in `app/layout.tsx` — reuse eguidar's and skip satnaing's context.
- Nothing in the audited flow depends on APIs removed in Next 16; risk concentrates in the hand-port of `sidebar.tsx` (Sheet/Tooltip/Slot swaps), not the framework.

---

## 5. The dashboard overview page in detail

### 5.1 Composition (`src/features/dashboard/index.tsx`)

Overview tab = 4 stat Cards in `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` — Total Revenue `$45,231.89 / +20.1% from last month`, Subscriptions `+2350`, Sales `+12,234`, Active Now `+573` — each Card using the compact pattern `CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'` with `CardTitle className='text-sm font-medium'`, an inline SVG stroke icon, and `CardContent` holding `text-2xl font-bold` value + `text-xs text-muted-foreground` delta. Below: `grid grid-cols-1 gap-4 lg:grid-cols-7` splitting into the Overview chart card (`lg:col-span-4`) and Recent Sales (`lg:col-span-3`). All numbers are hard-coded demo values. Primary source: `raw.githubusercontent.com/satnaing/shadcn-admin/main/src/features/dashboard/index.tsx`.

### 5.2 The revenue bar chart (`overview.tsx`)

```tsx
<ResponsiveContainer width='100%' height={350}>
  <BarChart data={data}>
    <XAxis dataKey='name' stroke='#888888' fontSize={12} tickLine={false} axisLine={false} />
    <YAxis stroke='#888888' fontSize={12} tickLine={false} axisLine={false}
           tickFormatter={(value) => `$${value}`} />
    <Bar dataKey='total' fill='currentColor' radius={[4, 4, 0, 0]} className='fill-primary' />
  </BarChart>
</ResponsiveContainer>
```

Data is 12 months of `Math.random()` totals. Theming trick: `fill='currentColor'` + Tailwind class (`fill-primary`) so the bars follow CSS variables. Primary source: `src/features/dashboard/components/overview.tsx`.

### 5.3 Recent sales (`recent-sales.tsx`)

A plain `space-y-8` list of five rows: `Avatar h-9 w-9` (image + initials fallback) + name/email column + right-aligned amount (`+$1,999.00`). No table, no card chrome inside. Primary source: `src/features/dashboard/components/recent-sales.tsx`.

### 5.4 Analytics tab (`analytics.tsx` + `analytics-chart.tsx`)

Traffic Overview card wrapping a Recharts `<AreaChart height=300>` with two `<Area type='monotone'>` series styled via `className='text-primary'` / `'text-muted-foreground'`, `stroke='currentColor'`, `fillOpacity 0.15/0.1`; four more stat cards; then Referrers and Devices rendered by a local `SimpleBarList` — pure div bars (`h-2.5 rounded-full bg-muted` track + width-percentage fill), i.e. deliberately *not* Recharts. Primary sources: both files under `src/features/dashboard/components/`.

### 5.5 How this differs from shadcn's official `ChartContainer` recipe

shadcn/ui's chart docs (ui.shadcn.com/docs/components/chart, retrieved 26 Aug 2026) describe a thin composition layer: "`We use Recharts under the hood… You build your charts using Recharts components and only bring in custom components, such as `ChartTooltip`, when and where you need it`", with the canonical shape:

```tsx
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
<ChartContainer>
  <BarChart data={data}><Bar dataKey="value" /><ChartTooltip content={<ChartTooltipContent />} /></BarChart>
</ChartContainer>
```

Doc notes for Recharts v3: reference tokens as `var(--chart-1)` (not `hsl(var(--chart-1))`), and "Keep a height, `min-h-*`, or `aspect-*` on `ChartContainer` so `ResponsiveContainer` can measure on first render". **Important:** satnaing's repo does *not* vendor `components/ui/chart.tsx` — his overview/analytics use raw `ResponsiveContainer` directly (sources in §5.2/§5.4). Either style works in eguidar; the shadcn `chart` component is installable via `pnpm dlx shadcn@latest add chart` and would consume the `--chart-1..5` tokens eguidar already defines.

---

## 6. The data tables: how shadcn-admin wires @tanstack/react-table

### 6.1 Table instance (`src/features/users/components/users-table.tsx`)

`useReactTable({ data, columns, state: { sorting, pagination, rowSelection, columnFilters, columnVisibility }, enableRowSelection: true, onPaginationChange, onColumnFiltersChange, onRowSelectionChange, onSortingChange, onColumnVisibilityChange, getPaginationRowModel(), getCoreRowModel(), getFilteredRowModel(), getSortedRowModel(), getFacetedRowModel(), getFacetedUniqueValues() })`. Row/cell rendering loops `table.getHeaderGroups()` / `row.getVisibleCells()` through `flexRender`, passing per-column `meta?.className / thClassName / tdClassName` and hover/selected styling via `group/row` + `group-data-[state=selected]/row:bg-muted`. Pagination and the three array filters (`status`, `role`) plus a text filter (`username`) are **URL-synced** through `useTableUrlState({ search, navigate, pagination: { defaultPage: 1, defaultPageSize: 10 }, columnFilters: [{ columnId, searchKey, type: 'string'|'array' }, …] })` (custom hook at `src/hooks/use-table-url-state.ts`), with an `ensurePageInRange(table.getPageCount())` effect. Local-only state: sorting, visibility, selection. Primary source: users-table.tsx (26 Aug 2026).

### 6.2 Column defs (`users-columns.tsx`)

`ColumnDef<User>[]` starting with a checkbox select column (header toggles all-page rows, `enableSorting/Hiding: false`, `meta.className` makes it sticky on mobile), `DataTableColumnHeader` sort buttons per column, `LongText` truncation cells, a `status` Badge colored via a `callTypes` map and carrying `filterFn: (row, id, value) => value.includes(row.getValue(id))` (array membership for the faceted filter), a `role` cell rendering the option's lucide icon, and a trailing `actions` cell (`DataTableRowActions` dropdown). Primary source: same path.

### 6.3 The shared `src/components/data-table/` kit

- **`toolbar.tsx`** — props `{ table, searchPlaceholder, searchKey, filters }`; binds an `Input` to `table.getColumn(searchKey)?.setFilterValue(...)` (or globalFilter), maps `filters[]` to `DataTableFacetedFilter`s, shows a Reset button when filtered, and always ends with `DataTableViewOptions`.
- **`faceted-filter.tsx`** — `Popover` + `Command` (cmdk) multi-select over static options; reads counts from `column.getFacetedUniqueValues()`, writes back arrays via `column.setFilterValue(Array.from(selectedValues))`; selected options appear as secondary Badges (count-collapsed beyond 2 on desktop).
- **`view-options.tsx`** — `DropdownMenu modal={false}` listing `getAllColumns().filter(c => c.accessorFn && c.getCanHide())` with `DropdownMenuCheckboxItem checked/onCheckedChange → column.toggleVisibility`.
- **`pagination.tsx`** — rows-per-page `Select` `[10,20,30,40,50]`, first/prev/numbered/next/last Buttons via a `getPageNumbers(currentPage, totalPages)` util, laid out with container queries (`@max-2xl/content:`).
- **`column-header.tsx`** and **`bulk-actions.tsx`** round out the kit (`index.ts` re-exports).

All four fetched verbatim 26 Aug 2026 from `raw.githubusercontent.com/satnaing/shadcn-admin/main/src/components/data-table/*.tsx`. Radix surface in this kit: `Popover`, `Command`(cmdk), `DropdownMenu*`, plus `@radix-ui/react-icons` glyphs (`CheckIcon`, `PlusCircledIcon`, `MixerHorizontalIcon`, `Cross2Icon`, chevrons/double-arrows) — each maps per §4.

---

## 7. The sidebar system (per source, not folklore)

From `src/components/ui/sidebar.tsx` (full file read 26 Aug 2026):

- Constants: `SIDEBAR_COOKIE_NAME = 'sidebar_state'`, `SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7` (one week), widths `16rem` desktop / `18rem` mobile / `3rem` icon mode, keyboard shortcut **Ctrl/Cmd+B**.
- **State & persistence:** `SidebarProvider` owns `{ state: 'expanded'|'collapsed', open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }`; every `setOpen` also executes `document.cookie = \`${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}\``, and the layout seeds `defaultOpen` from that cookie (`authenticated-layout.tsx`, §2.2) so there is no flash-of-wrong-state on load. It also wraps children in `TooltipProvider delayDuration={0}` and sets `--sidebar-width` / `--sidebar-width-icon` CSS vars on the wrapper.
- **Rendering:** `collapsible='none'` → static div; `isMobile` → the whole sidebar renders inside a `Sheet` (Radix dialog) with sr-only header; desktop → a `peer` element with a spacer div (the "gap" that pushes content) plus a `fixed inset-y-0` container, exposing `data-state`, `data-collapsible`, `data-variant`, `data-side` attributes that all inner styling keys off (`group-data-[collapsible=icon]:…` etc.).
- **Variants:** `sidebar` (bordered flush), `floating` (rounded bordered card), `inset` (page content insets via `SidebarInset`'s `md:peer-data-[variant=inset]:m-2 … rounded-xl shadow-sm` classes). **Collapsible modes:** `offcanvas` (slides away, gap collapses to `w-0`), `icon` (shrinks to `3rem`, labels hidden, tooltips shown via `SidebarMenuButton tooltip`), `none`.
- **Parts:** `SidebarTrigger` (PanelLeftIcon ghost button calling `toggleSidebar`), clickable resize `SidebarRail`, `SidebarHeader/Footer/Content/Group/GroupLabel(asChild)/Menu/MenuItem/MenuButton(cva variant+size, active/open data-attrs, tooltip)/MenuAction(showOnHover)/MenuBadge/MenuSkeleton/MenuSub(SubItem/SubButton)` — the last group hidden entirely when `group-data-[collapsible=icon]`.
- Sub-nav behavior when collapsed is handled *outside* the component by `nav-group.tsx` swapping `Collapsible` for a sideways `DropdownMenu` (§2.4).

Port notes for eguidar: the component is framework-light — the only Radix touchpoints are `Slot` (→ `render` prop), `Sheet` (→ Base UI dialog), and `Tooltip` (→ Base UI tooltip). Cookie logic and all markup/classes port verbatim; note `getCookie` lives in satnaing's `src/lib/cookies.ts` (referenced by `authenticated-layout.tsx`; file contents not fetched — trivial utility, write your own).

---

## 8. Adoption plan for THIS repo (eguidar)

### 8.1 Packages

```bash
pnpm add @tanstack/react-table recharts
pnpm add cmdk        # only if adopting shadcn's Command-based faceted filter/command palette
```

Nothing else from shadcn-admin's dependency list is required (§3). Do not add Radix, lucide, TanStack Router/Query, Zustand, Axios, or Clerk. Optional later: `date-fns` if order-date grouping/formatting outgrows `Intl`/`toLocaleDateString("fr-FR")` (already used in `app/admin/page.tsx`).

### 8.2 Files to create

**UI primitives to add under `components/ui/`** (follow the house pattern visible in `select.tsx`: `"use client"`, `import { X as XPrimitive } from "@base-ui/react/x"`, cva variants, `HugeiconsIcon`):
1. `sidebar.tsx` — port of satnaing's §7 component (cookie persistence kept; Sheet→dialog, Tooltip→base-ui, Slot→render).
2. `dropdown-menu.tsx` (on `@base-ui/react/menu`), `popover.tsx`, `tooltip.tsx`, `collapsible.tsx`, `tabs.tsx`, `checkbox.tsx`, `avatar.tsx`, `skeleton.tsx`, `scroll-area.tsx`, `sheet.tsx` (on dialog), `breadcrumb.tsx` (plain markup, no primitive), optionally `chart.tsx` (shadcn recipe, §5.5), `command.tsx` (if cmdk added).

**Data-table kit** under `components/data-table/`: port `column-header`, `faceted-filter`, `view-options`, `pagination`, `toolbar`, `index.ts` from §6.3, swapping `@radix-ui/react-icons` glyphs for hugeicons equivalents (e.g. `MixerHorizontalIcon`→`SlidersHorizontalIcon`, `Cross2Icon`→an ✕ glyph — verify exact export) and `Popover/Command/DropdownMenu` for the Base UI wrappers from 8.2 above.

**Admin shell** under `components/layout/admin/`: `admin-sidebar.tsx`, `nav-group.tsx`, `nav-user.tsx`, `header.tsx`, `main.tsx`, `data/sidebar-data.ts`. French nav entries map 1:1 onto existing routes: Tableau de bord `/admin`, Produits `/admin/produits`, Catégories `/admin/categories`, Commandes `/admin/commandes`, Villes `/admin/villes`, Livraison `/admin/livraison` (these six links already define the IA in `app/admin/layout.tsx:38-55`), plus a Boutique link `/` and the session user in the footer (available server-side via `getAdminSession()`).

Then update `app/admin/layout.tsx`: keep the async `AdminShell` session gate exactly as-is (server), and inside it render `<SidebarProvider><AdminSidebar /><SidebarInset>{children}</SidebarInset></SidebarProvider>` replacing today's flat header — the Provider is a client component but accepts server-rendered children (standard RSC composition already used across this repo).

### 8.3 Pages to build on top

- **`app/admin/page.tsx` (upgrade)**: keep the four existing KPI cards but restyle to the §5.1 compact-card pattern (icon + delta line); feed values from the unchanged `getDashboardStats()` (`lib/use-cases/admin-dashboard.ts` — already returns `productCount`, `categoryCount`, `orderCount`, `pendingOrderCount`). Convert `recentOrders` into a Recent-Sales-style avatar-less list (§5.3) — it already carries `id/status/total/createdAt/itemCount`; convert `lowStockVariants` into a Badge'd list (already done today). Add a revenue bar chart (§5.2 config) fed by a new aggregate — the natural query is `prisma.order.groupBy({ by: ['createdAt'], … })` bucketed by day/month, or `aggregate({_sum:{total}})` per period, over the `Order` model (`prisma/schema.prisma:153`); a "ventes par catégorie" donut can come from `OrderItem → ProductVariant → Product → Category` relations (`schema.prisma:171,115,93,80`).
- **`app/admin/commandes/`**: TanStack table over `admin-orders.ts` use-case data — columns: id, date, customer, items count, total (`formatPrice`), `status` Badge with `filterFn: value.includes` driving a Status faceted filter (options from the `OrderStatus` enum, `schema.prisma:144`); URL-synced pagination via a trimmed `useTableUrlState` (drop the TanStack-Router-specific parts; sync with `useSearchParams`/`router.replace`).
- **`app/admin/produits/`**: same kit over `admin-catalog.ts`; faceted filters for Category (model `Category`, `schema.prisma:80`) and featured flag; low-stock column sourced from `ProductVariant.stock` (`schema.prisma:115`, threshold constant `LOW_STOCK_THRESHOLD` already exported).

### 8.4 Adaptation checklist (Base UI / hugeicons / conventions)

- Replace every `asChild` with `render={…}`; every `DropdownMenu*` import with the new `menu`-based wrapper; every `onCheckedChange` with Base UI's checked-change handler name (check each wrapper as you write it — naming differs per primitive).
- Swap icons per §4.2; keep sizes consistent (`size={16}` inline icons, matching `[&>svg]:size-4` defaults).
- Keep French labels + `formatPrice` + `fr-FR` dates; sidebar labels in `sidebar-data.ts` stay French.
- Recolor `--chart-1..5` in `app/globals.css` if the current amber ramp clashes with the Apple palette (`--primary #0071e3`) before shipping charts.
- Preserve RTL-readiness (`rtl:` classes in the ported sidebar) since `components.json` declares `"rtl": true`.

---

## Reusable for an eguidar implementation — condensed spec

1. Shell: `SidebarProvider(defaultOpen ← cookie 'sidebar_state')` → `AdminSidebar` → `SidebarInset(@container/content)`; sticky 64px `Header` = `SidebarTrigger` + separator + breadcrumbs/theme/user; Ctrl/Cmd+B toggles; cookie max-age 7 days. (Source: §2.2, §7.)
2. Overview grid: `sm:grid-cols-2 lg:grid-cols-4` stat cards → `lg:grid-cols-7` split (4-col Recharts BarChart `height=350`, `fill-primary` currentColor trick; 3-col recent-orders list). (Source: §5.1–5.3.)
3. Tables: shared kit (toolbar/search input + faceted filters + view-options + numbered pagination) around one `useReactTable` configured with core/filtered/sorted/pagination/faceted models; array filters via `filterFn: value.includes`; URL-sync pagination+filters. (Source: §6.)
4. Charts theming: either raw Recharts + `fill-primary` (satnaing) or shadcn `ChartContainer` + `var(--chart-N)` tokens (official docs) — tokens already mapped in `app/globals.css`. (Source: §5.5.)
5. New npm deps total: `@tanstack/react-table`, `recharts` (+ optional `cmdk`). Everything else is already in the repo. (Source: §3, §8.1.)

## Sources

All remote sources retrieved on **26 Aug 2026** (raw file fetches via HTTP GET/webfetch; registry + GitHub API via HTTPS GET; local files read from the working tree the same day).

satnaing/shadcn-admin repository (primary):
1. `https://api.github.com/repos/satnaing/shadcn-admin` — metadata: MIT, TypeScript, 14,021 stars, homepage `https://shadcn-admin.netlify.app/`, description, pushed_at 2026-07-21.
2. `https://api.github.com/repos/satnaing/shadcn-admin/git/trees/main?recursive=1` — complete file tree @ sha `e16c87f213a5ba5e45964e9b67c792105ec74d26` (routes, features, components inventories in §2.1).
3. `https://raw.githubusercontent.com/satnaing/shadcn-admin/main/package.json` — v2.2.1 dependency list quoted in §3.
4. `https://raw.githubusercontent.com/satnaing/shadcn-admin/main/README.md` — stack statement, RTL-modified component list, feature list.
5. `.../main/src/features/dashboard/index.tsx` — §5.1 card/tab composition, TopNav/Header wiring.
6. `.../main/src/features/dashboard/components/overview.tsx` — §5.2 BarChart config (quoted).
7. `.../main/src/features/dashboard/components/recent-sales.tsx` — §5.3 list anatomy.
8. `.../main/src/features/dashboard/components/analytics.tsx` — §5.4 stat cards + `SimpleBarList` CSS bars.
9. `.../main/src/features/dashboard/components/analytics-chart.tsx` — §5.4 AreaChart config.
10. `.../main/src/features/users/components/users-table.tsx` — §6.1 `useReactTable` options, URL-state hook usage.
11. `.../main/src/features/users/components/users-columns.tsx` — §6.2 column defs, `filterFn`, meta.className patterns.
12. `.../main/src/components/data-table/faceted-filter.tsx` — §6.3 Popover+Command faceted filter.
13. `.../main/src/components/data-table/view-options.tsx` — §6.3 column-visibility dropdown.
14. `.../main/src/components/data-table/pagination.tsx` — §6.3 rows-per-page Select + page-number buttons.
15. `.../main/src/components/data-table/toolbar.tsx` — §6.3 toolbar composition.
16. `.../main/src/components/ui/sidebar.tsx` — §7 full sidebar implementation incl. cookie constants/logic (quoted).
17. `.../main/src/components/layout/authenticated-layout.tsx` — §2.2 shell (quoted), cookie-seeded `defaultOpen`.
18. `.../main/src/components/layout/header.tsx` — §2.3 sticky/scrim header.
19. `.../main/src/components/layout/app-sidebar.tsx` — §2.3 sidebar composition.
20. `.../main/src/components/layout/nav-group.tsx` — §2.4 three nav-item render modes.
21. `.../main/src/components/layout/data/sidebar-data.ts` — §2.4 nav groups + lucide icon usage.
22. `.../main/src/routes/_authenticated/route.tsx` — §2.2 route→layout binding.

Live demo referenced by the requester (primary, text-only inspection):
23. `https://nextjs-ecommerce-dashboard.shadcnadmin.com/` — full rendered-text inventory in §1.1 (title, sidebar sections, all dashboard figures). Internal JS/componentry not analyzed — explicitly out of scope of what could be verified.

Official documentation (primary for shadcn/ui claims):
24. `https://ui.shadcn.com/docs/components/chart` — Recharts-v3 statement, `ChartContainer`/`ChartTooltipContent` composition example (quoted), `var(--chart-1)` token guidance, sizing requirement.

Registry (primary for compatibility claims):
25. `https://registry.npmjs.org/recharts/latest` — recharts 3.10.1 manifest: `peerDependencies` including `react ^19.0.0` (React-19 support evidence).

Local eguidar files (primary for this repo; read 26 Aug 2026):
26. `package.json`, `components.json` — installed deps, `style: base-maia`, `iconLibrary: hugeicons`, `rtl: true`.
27. `app/globals.css` — `@theme inline` mappings incl. `--color-chart-1..5` and full `--sidebar-*` set; Apple-palette values.
28. `components/ui/` directory listing + `select.tsx`, `button.tsx` excerpts — Base UI import/`render`-prop idioms, hugeicons usage.
29. `components/ui` presence list (badge/button/card/dialog/field/input/label/select/separator/switch/table/textarea) — basis of the missing-components list in §4.1/§8.2.
30. `node_modules/@base-ui/react` directory listing — availability of `menu`, `popover`, `tooltip`, `collapsible`, `tabs`, `checkbox`, `avatar`, `alert-dialog`, `scroll-area`, `combobox`, `direction-provider`, etc.
31. `node_modules/@hugeicons/core-free-icons/dist/types` listing (5,442 icons) — verified glyph names used in §4.2.
32. `app/admin/layout.tsx`, `app/admin/page.tsx` — current admin IA, session gate, `render={<Link/>}` call site, existing dashboard content.
33. `lib/use-cases/admin-dashboard.ts` — `getDashboardStats()` shape feeding §8.3; `LOW_STOCK_THRESHOLD`.
34. `lib/use-cases/` listing (`admin-orders.ts`, `admin-catalog.ts`, `admin-gate.ts`, …) — server-side data sources for the planned tables.
35. `prisma/schema.prisma` (model lines) — `Category`(80), `Product`(93), `ProductVariant`(115), `OrderStatus`(144), `Order`(153), `OrderItem`(171), `DeliveryCity`(185), `ShippingSettings`(194).
36. `app/layout.tsx` — `ThemeProvider` (next-themes) already mounted.

Not retrieved / explicitly unknown (stated rather than guessed): the rendered demo at `https://shadcn-admin.netlify.app/` (repo-declared official demo) was not crawled; `src/lib/cookies.ts` and `src/components/layout/main.tsx` contents were not fetched (referenced only by path/tree entry); the ShopHaus template's internal dependencies (§1.1); any blog/tutorial coverage — none was relied upon.
