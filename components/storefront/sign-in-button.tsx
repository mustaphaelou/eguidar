"use client"

import { UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useAuthDialogs } from "@/components/auth/auth-dialogs"
import { Button } from "@/components/ui/button"

export function SignInButton() {
  const { openLogin } = useAuthDialogs()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Connexion"
      title="Connexion"
      onClick={() => openLogin()}
    >
      <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
    </Button>
  )
}
