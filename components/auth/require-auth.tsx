"use client"

import { useEffect } from "react"
import Link from "next/link"

import { LockKeyIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { validateNextPath } from "@/lib/validate-next-path"

function syncLoginUrl() {
  const url = new URL(window.location.href)
  let changed = false
  if (!validateNextPath(url.searchParams.get("next"))) {
    const params = new URLSearchParams(url.search)
    params.delete("open")
    params.delete("next")
    const query = params.toString()
    url.searchParams.set("next", query ? `${url.pathname}?${query}` : url.pathname)
    changed = true
  }
  if (url.searchParams.get("open") !== "login") {
    url.searchParams.set("open", "login")
    changed = true
  }
  if (changed) {
    window.history.replaceState(null, "", url.toString())
  }
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
