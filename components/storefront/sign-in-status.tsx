import { headers } from "next/headers"
import Link from "next/link"

import { UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"

export async function SignInStatus() {
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <Button render={<Link href="/connexion" />} variant="ghost" size="lg" className="gap-1.5">
      <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
      <span className="max-w-28 truncate">{session ? session.user.name : "Connexion"}</span>
    </Button>
  )
}
