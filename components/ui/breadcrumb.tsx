import * as React from "react"
import { useRender } from "@base-ui/react/use-render"
import { mergeProps } from "@base-ui/react/merge-props"

import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronRightIcon } from "@hugeicons/core-free-icons"

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="Fil d'Ariane" data-slot="breadcrumb" className={cn("flex flex-1 items-center", className)} {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="breadcrumb-list" className={cn("flex items-center gap-1.5 text-sm text-muted-foreground [&>li]:flex [&>li]:items-center [&>li]:gap-1.5", className)} {...props} />
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="breadcrumb-item" className={cn("shrink-0", className)} {...props} />
}

function BreadcrumbSeparator({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      aria-hidden="true"
      className={cn("text-muted-foreground/60", className)}
      {...props}
    >
      <HugeiconsIcon icon={ChevronRightIcon} strokeWidth={2} className="size-3.5" />
    </li>
  )
}

function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"span">) {
  const { renderElement } = useRender<"span">({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn("me-1.5 transition-colors hover:text-foreground", className),
      },
      props
    ),
    render,
  })
  return renderElement
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-medium text-foreground", className)}
      {...props}
    />
  )
}

export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
}
