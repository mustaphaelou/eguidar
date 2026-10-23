import { site } from "@/lib/site"

/**
 * Le seul nom d'hôte de la zone servie par l'edge. Dérivé de `site.url` pour
 * qu'une adresse de purge et une règle de cache ne puissent pas désigner deux
 * hôtes différents.
 */
export const HOTE_EDGE = new URL(site.url).hostname

export function urlEdge(chemin: string): string {
  return new URL(
    chemin.startsWith("/") ? chemin : `/${chemin}`,
    site.url
  ).toString()
}
