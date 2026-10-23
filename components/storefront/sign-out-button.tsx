"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { signOut } from "@/lib/client"
import { Button } from "@/components/ui/button"

export function SignOutButton({
  className,
  onAvant,
}: {
  className?: string
  onAvant?: () => void
}) {
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

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Déconnexion"
      title="Déconnexion"
      disabled={pending}
      className={className}
      onClick={() => {
        onAvant?.()
        void handleSignOut()
      }}
    >
      Déconnexion
    </Button>
  )
}
