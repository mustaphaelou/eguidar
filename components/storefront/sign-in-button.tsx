"use client"

import type { ReactNode } from "react"

import { useAuthDialogs } from "@/components/auth/auth-dialogs"
import { Button } from "@/components/ui/button"

export function SignInButton({
  ariaLabel = "Connexion",
  children = "Connexion",
  className,
  icone,
  onAvant,
  variant = "ghost",
}: {
  ariaLabel?: string
  children?: ReactNode
  className?: string
  icone?: ReactNode
  onAvant?: () => void
  variant?: "ghost" | "link"
}) {
  const { openLogin } = useAuthDialogs()

  return (
    <Button
      variant={variant}
      size="sm"
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        onAvant?.()
        openLogin()
      }}
    >
      {icone}
      {children}
    </Button>
  )
}
