import { headers } from "next/headers"
import Link from "next/link"

import { UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { SignInButton } from "./sign-in-button"

export async function SignInStatus() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return <SignInButton />
  }

  return (
    <Button
      render={<Link href="/profil" />}
      variant="ghost"
      size="icon"
      aria-label="Mon profil"
      title={session.user.name}
    >
      <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
    </Button>
  )
}
