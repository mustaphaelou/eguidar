// PROTOTYPE — Three variants of the login page, switchable via ?variant=, on /prototype/connexion.
// Throwaway route to evaluate login page shapes.

import { Suspense } from "react"
import type { Metadata } from "next"

import { LoginPrototypeShell } from "@/components/auth/login-prototype"
import { PrototypeVariantSwitcher } from "@/components/prototype-variant-switcher"
import {
  LOGIN_PROTOTYPE_VARIANT_NAMES,
  parsePrototypeVariant,
} from "@/lib/prototype-variant"

export const metadata: Metadata = {
  title: "Prototype — Page de Connexion Eguidar",
  description: "Prototype interactif de la page de connexion pour Eguidar.",
  robots: { index: false, follow: false },
}

interface PrototypeConnexionPageProps {
  searchParams: Promise<{ variant?: string }>
}

export default async function PrototypeConnexionPage({
  searchParams,
}: PrototypeConnexionPageProps) {
  const { variant } = await searchParams
  const activeVariant = parsePrototypeVariant(variant)

  return (
    <main className="relative min-h-svh w-full bg-background">
      <LoginPrototypeShell variant={activeVariant} />
      <Suspense fallback={null}>
        <PrototypeVariantSwitcher names={LOGIN_PROTOTYPE_VARIANT_NAMES} />
      </Suspense>
    </main>
  )
}
