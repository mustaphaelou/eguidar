import Link from "next/link"

export interface Crumb {
  name: string
  href?: string
}

export function AppleBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="border-b border-foreground/10">
      <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 px-4 py-3 text-[14px] leading-[1.4286] tracking-[-0.016em] text-muted-foreground sm:px-6">
        {crumbs.map((crumb, index) => (
          <li key={index} className="flex items-center gap-x-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-muted-foreground/60">
                ›
              </span>
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="transition-colors hover:text-foreground"
              >
                {crumb.name}
              </Link>
            ) : (
              <span className="text-foreground">{crumb.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
