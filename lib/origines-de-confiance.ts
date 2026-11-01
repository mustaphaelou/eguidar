import { site } from "@/lib/site"

/**
 * Les origines que le contrôle d'origine de Better Auth accepte, en plus de
 * l'origine de `BETTER_AUTH_URL` que la bibliothèque ajoute toujours. L'apex
 * vient de `site.url`, et `www` s'en déduit ; une prévisualisation Coolify
 * ajoute la sienne par `BETTER_AUTH_TRUSTED_ORIGINS`, sans qu'un hôte soit
 * inventé dans le dépôt.
 */
const APEX = new URL(site.url).origin
const HOTE = new URL(site.url).hostname

export const ORIGINES_DE_LA_BOUTIQUE = [APEX, `https://www.${HOTE}`] as const

export function originesSupplementaires(
  valeur = process.env.BETTER_AUTH_TRUSTED_ORIGINS
): string[] {
  if (!valeur) return []

  const origines = new Set<string>()
  for (const brute of valeur.split(",")) {
    const candidate = brute.trim()
    if (!candidate) continue

    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      throw new Error(
        `BETTER_AUTH_TRUSTED_ORIGINS : origine invalide « ${candidate} »`
      )
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(
        `BETTER_AUTH_TRUSTED_ORIGINS : origine non HTTP « ${candidate} »`
      )
    }
    origines.add(url.origin)
  }
  return [...origines]
}
