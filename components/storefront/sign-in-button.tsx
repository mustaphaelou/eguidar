"use client"

import { useAuthDialogs } from "@/components/auth/auth-dialogs"
import { Button } from "@/components/ui/button"

export function SignInButton({
  className,
  onAvant,
}: {
  className?: string
  onAvant?: () => void
}) {
  const { openLogin } = useAuthDialogs()

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Connexion"
      className={className}
      onClick={() => {
        onAvant?.()
        openLogin()
      }}
    >
      Connexion
    </Button>
  )
}
