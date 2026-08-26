"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<"span"> & AvatarPrimitive.Root.Props) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      render={<span className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)} />}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<"img">) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      render={<img aria-hidden="true" className={cn("aspect-square size-full object-cover", className)} />}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      render={
        <span
          className={cn(
            "flex size-full items-center justify-center rounded-full bg-muted text-xs",
            className
          )}
        />
      }
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }
