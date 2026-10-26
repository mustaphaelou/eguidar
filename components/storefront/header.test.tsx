import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const LECTURE_DE_REQUETE_INTERDITE =
  "Le Bandeau de navigation a lu une donnée de requête pendant son rendu."

vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error(LECTURE_DE_REQUETE_INTERDITE)
  },
  headers: () => {
    throw new Error(LECTURE_DE_REQUETE_INTERDITE)
  },
}))

import { StorefrontHeader } from "./header"

describe("StorefrontHeader — coquille statique", () => {
  it("rend le Bandeau sans lire cookies() ni headers()", async () => {
    const flux = await renderToReadableStream(<StorefrontHeader />)
    await flux.allReady
    const html = await new Response(flux).text()

    expect(html).toContain('aria-label="Panier"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("Navigation principale")
    expect(html).not.toContain("Menu mobile")
  })

  it("ne porte aucune entrée vers les pages de la boutique", async () => {
    const flux = await renderToReadableStream(<StorefrontHeader />)
    await flux.allReady
    const html = await new Response(flux).text()

    for (const page of [
      "/a-propos",
      "/contact",
      "/faq",
      "/blog",
      "/conditions",
    ]) {
      expect(html).not.toContain(`href="${page}"`)
    }
    expect(html).toContain('href="/"')
  })

  it("ne porte ni compte, ni Panier, ni corps d'Aperçu dans son document", async () => {
    const flux = await renderToReadableStream(<StorefrontHeader />)
    await flux.allReady
    const html = await new Response(flux).text()

    expect(html).not.toContain("Votre panier est vide")
    expect(html).not.toContain("Mon panier")
    expect(html).not.toContain("Connectez-vous pour retrouver le panier")
    expect(html).not.toContain("Commandes")
    expect(html).not.toContain("Mon profil")
    expect(html).not.toContain("Déconnexion")
    expect(html).not.toMatch(/>\s*\d+\s*<\/span>/)
  })
})
