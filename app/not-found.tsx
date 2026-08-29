import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button render={<Link href="/" />} className="mt-2">
        Retour à l&apos;accueil
      </Button>
    </div>
  )
}
