"use client"

import { useEffect } from "react"
import Link from "next/link"

import { LockKeyIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import {
  parseAuthParams,
  withAuthParams,
  withoutAuthParams,
} from "@/lib/lien-de-connexion"
import { replaceUrl } from "@/components/auth/sync-url"

function pageAddressWithoutAuthParams(url: URL): string {
  const addressWithoutNext = withAuthParams(`${url.pathname}${url.search}`, {
    next: "",
  })
  return withoutAuthParams(addressWithoutNext)
}

function syncLoginUrl() {
  const { next } = parseAuthParams(window.location.search)
  replaceUrl((current) => {
    const destination = next ?? pageAddressWithoutAuthParams(current)
    return withAuthParams(current.href, { dialog: "login", next: destination })
  })
}

export function RequireAuth() {
  useEffect(() => {
    queueMicrotask(syncLoginUrl)
  }, [])

  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-24 text-center">
      <HugeiconsIcon
        icon={LockKeyIcon}
        strokeWidth={2}
        className="size-12 text-muted-foreground"
      />
      <h1 className="text-2xl font-bold">Connectez-vous pour continuer</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Cette page est réservée à votre espace personnel.
      </p>
      <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={syncLoginUrl}>Se connecter</Button>
        <Button render={<Link href="/" />} variant="outline">
          Découvrir les produits
        </Button>
      </div>
    </div>
  )
}
