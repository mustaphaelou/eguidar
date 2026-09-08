"use client"

// PROTOTYPE — throwaway gate that swaps the real sign-in dialog for redesign
// variants when ?variant=A|B|C is set (dev builds only), and auto-opens the
// login dialog in prototype mode. Delete when a variant wins.

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { PrototypeSwitcher, type PrototypeVariant } from "./prototype-switcher"
import {
  SignInVariantA,
  SignInVariantB,
  SignInVariantC,
} from "./sign-in-variants"

const VARIANTS: PrototypeVariant[] = [
  { key: "A", name: "Carte épurée" },
  { key: "B", name: "Écran partagé" },
  { key: "C", name: "Google d'abord" },
]

export function SignInDialogGate({
  hasGoogle,
  hasApple,
}: {
  hasGoogle: boolean
  hasApple: boolean
}) {
  return (
    <Suspense fallback={null}>
      <SignInPrototypeSwitch hasGoogle={hasGoogle} hasApple={hasApple} />
    </Suspense>
  )
}

function SignInPrototypeSwitch({
  hasGoogle,
  hasApple,
}: {
  hasGoogle: boolean
  hasApple: boolean
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const variantParam = searchParams.get("variant")
  const activeVariant =
    process.env.NODE_ENV !== "production" &&
    VARIANTS.some((v) => v.key === variantParam)
      ? variantParam
      : null

  useEffect(() => {
    if (!activeVariant) return
    if (searchParams.get("open")) return
    const params = new URLSearchParams(searchParams)
    params.set("open", "login")
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [activeVariant, searchParams, router])

  if (!activeVariant) {
    return <SignInDialog hasGoogle={hasGoogle} hasApple={hasApple} />
  }

  return (
    <>
      {activeVariant === "A" && <SignInVariantA />}
      {activeVariant === "B" && <SignInVariantB />}
      {activeVariant === "C" && <SignInVariantC />}
      <PrototypeSwitcher variants={VARIANTS} current={activeVariant} />
    </>
  )
}
