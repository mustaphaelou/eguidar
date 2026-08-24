import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { RequireAuth } from "@/components/auth/require-auth"
import { ProfileForm } from "@/components/storefront/profile-form"
import { Button } from "@/components/ui/button"
import { getProfile } from "@/lib/use-cases/account"
import { listDeliveryCities } from "@/lib/use-cases/livraison"
import { getSessionUser } from "@/lib/use-cases/get-session"

export const metadata: Metadata = {
  title: "Mon profil",
  description:
    "Gérez vos informations personnelles, votre numéro de téléphone et votre adresse de livraison eguidar.com.",
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  )
}

async function ProfileContent() {
  const user = await getSessionUser()
  if (!user) return <RequireAuth />

  const [profile, cities] = await Promise.all([getProfile(user.id), listDeliveryCities()])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Mon profil</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Vos coordonnées pré-remplissent automatiquement le paiement.
      </p>

      <ProfileForm
        cities={cities}
        initialCityId={profile.cityId}
        initialAddress={profile.address ?? ""}
        initialPhone={profile.phone ?? ""}
      />

      <div className="mt-8 border-t pt-6">
        <Button render={<Link href="/commandes" />} variant="outline">
          Voir mes commandes
        </Button>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}
