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
