"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { HugeiconsIcon } from "@hugeicons/react"
import { Logout03Icon } from "@hugeicons/core-free-icons"

import { signOut } from "@/lib/client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
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
      size="icon"
      aria-label="Déconnexion"
      title="Déconnexion"
      disabled={pending}
      onClick={() => {
        void handleSignOut()
      }}
    >
      <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
    </Button>
  )
}
