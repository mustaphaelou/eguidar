"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon, Logout03Icon } from "@hugeicons/core-free-icons"

import { signOut } from "@/lib/client"
import { getDisplayNameInitials } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"

type UserMenuProps = {
  userName: string
  userEmail: string
  variant?: "full" | "compact"
}

export function UserMenu({ userName, userEmail, variant = "full" }: UserMenuProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function handleSignOut() {
    setPending(true)
    try {
      await signOut()
      router.push("/")
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const displayName = userName || userEmail
  const initials = getDisplayNameInitials(displayName)

  const content = (
    <DropdownMenuContent className="min-w-56">
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={pending}
        onClick={handleSignOut}
      >
        <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
        Se déconnecter
      </DropdownMenuItem>
    </DropdownMenuContent>
  )

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menu utilisateur"
          disabled={pending}
          render={
            <span
              tabIndex={0}
              role="button"
              className="inline-flex cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Avatar className="border">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </span>
          }
        />
        {content}
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={pending}>
        <SidebarMenuButton size="lg" tooltip={displayName}>
          <Avatar className="border">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
          </span>
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            strokeWidth={2}
            className="ms-auto size-4 text-muted-foreground"
          />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      {content}
    </DropdownMenu>
  )
}