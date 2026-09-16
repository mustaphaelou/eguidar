import Link from "next/link"

import { UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { lireSession } from "@/lib/use-cases/session-courante"
import { SignInButton } from "./sign-in-button"
import { SignOutButton } from "./sign-out-button"

export async function SignInStatus() {
  const client = await lireSession()

  if (!client) {
    return <SignInButton />
  }

  return (
    <>
      <Button
        render={<Link href="/profil" />}
        variant="ghost"
        size="icon"
        aria-label="Mon profil"
        title={client.name}
      >
        <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
      </Button>
      <SignOutButton />
    </>
  )
}
