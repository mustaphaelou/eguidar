import { describe, expect, it } from "vitest"

import { lire, sourcesDeProduction } from "@/lib/use-cases/outils-frontiere"

const MODULE = "lib/use-cases/blog.ts"

const ARBORESCENCE_GENEREE = "lib/generated/"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib"
)

const MUTATEURS = [
  "createBrouillon",
  "publier",
  "mettreAJour",
  "archiver",
  "lierProduits",
] as const

const ECRITURE_ARTICLE =
  /(?:prisma|tx|client)\.articleBlog(?:Produit)?\.(?:create|createManyAndReturn|createMany|updateManyAndReturn|updateMany|update|upsert|deleteMany|delete)\b/

const LECTURES_PUBLIQUES = [
  "fetchArticleParSlug",
  "fetchBlogLanding",
  "getBlogLanding",
  "getArticleParSlug",
] as const

function nomme(source: string, nom: string): boolean {
  return new RegExp(`\\b${nom}\\b`).test(source)
}

describe("Blog — la lecture publique ne porte aucune écriture", () => {
  it("le module Blog n'écrit aucun Article et n'expose aucun mutateur", () => {
    const blog = lire(import.meta.url, "./blog.ts")

    expect(blog).not.toMatch(ECRITURE_ARTICLE)
    expect(blog).not.toMatch(/\$transaction/)
    for (const mutateur of MUTATEURS) {
      expect(nomme(blog, mutateur), mutateur).toBe(false)
    }
  })

  it("aucune source écrite à la main n'écrit un Article de blog", () => {
    const ecrivains = SOURCES.filter(
      ({ chemin, source }) =>
        !chemin.startsWith(ARBORESCENCE_GENEREE) &&
        ECRITURE_ARTICLE.test(source)
    ).map(({ chemin }) => chemin)

    expect(ecrivains).toEqual([])
  })

  it("le parcours est non vacuant : le module et ses lectures publiques sont là", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toContain(MODULE)

    const blog = lire(import.meta.url, "./blog.ts")
    for (const lecture of LECTURES_PUBLIQUES) {
      expect(blog, lecture).toContain(lecture)
    }
  })
})
