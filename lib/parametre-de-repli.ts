/**
 * Paramètre de repli des routes dynamiques du catalogue.
 *
 * Avec `cacheComponents`, une fonction `generateStaticParams` doit rendre au
 * moins un paramètre : un tableau vide fait échouer le build. Un catalogue
 * vide ne doit pourtant pas empêcher de construire : chaque route rend donc
 * un slug de repli, que la page traite comme une route inconnue. La valeur est
 * neutre — elle ne nomme ni un produit, ni une catégorie, ni un article — et
 * `slugify` ne peut pas la produire, donc aucun slug réel ne peut la percuter.
 *
 * `estLeSlugDeRepli` laisse #760 distinguer un repli d'un slug réellement
 * inconnu, s'il doit leur donner deux réponses différentes.
 */
export const SLUG_DE_REPLI = "__placeholder__"

export interface ParametresDeSlug {
  slug: string
}

export function parametresDeSlug(slugs: readonly string[]): ParametresDeSlug[] {
  if (slugs.length === 0) return [{ slug: SLUG_DE_REPLI }]
  return slugs.map((slug) => ({ slug }))
}

export function estLeSlugDeRepli(slug: string): boolean {
  return slug === SLUG_DE_REPLI
}
