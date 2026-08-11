import { headers } from "next/headers"
import Link from "next/link"

import { UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"

export async function SignInStatus() {
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <Button
      render={<Link href={session ? "/profil" : "/connexion"} />}
      variant="ghost"
      size="icon"
      aria-label={session ? "Mon profil" : "Connexion"}
      title={session ? session.user.name : "Connexion"}
    >
      <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
    </Button>
  )
}
