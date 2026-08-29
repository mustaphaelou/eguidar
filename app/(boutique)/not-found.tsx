import Link from "next/link"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"

export default function BoutiqueNotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="size-6 text-muted-foreground"
        />
      </div>
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <div className="mt-2 flex gap-3">
        <Button render={<Link href="/produits" />}>
          Découvrir les produits
        </Button>
        <Button variant="outline" render={<Link href="/" />}>
          Retour à l&apos;accueil
        </Button>
      </div>
    </div>
  )
}
