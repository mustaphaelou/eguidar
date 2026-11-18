import {
  moyenDeConnexionAffichable,
  moyensDeConnexionOfferts,
  phraseDerniereConnexion,
} from "@/lib/moyen-de-connexion"

export function DerniereConnexion({
  valeur,
  hasGoogle,
  hasFacebook,
}: {
  valeur: string | null
  hasGoogle: boolean
  hasFacebook: boolean
}) {
  const moyen = moyenDeConnexionAffichable(
    valeur,
    moyensDeConnexionOfferts({ hasGoogle, hasFacebook })
  )
  if (moyen === null) return null
  return (
    <p className="text-xs text-muted-foreground">
      {phraseDerniereConnexion(moyen)}
    </p>
  )
}
