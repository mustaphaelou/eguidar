import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DerniereConnexion } from "./derniere-connexion"

async function rendre(element: React.ReactNode): Promise<string> {
  const flux = await renderToReadableStream(element)
  return new Response(flux).text()
}

describe("la phrase Dernière connexion sur cet appareil", () => {
  it("nomme chaque Moyen de connexion offert", async () => {
    for (const [valeur, phrase] of [
      ["google", "Dernière connexion sur cet appareil : Google."],
      ["facebook", "Dernière connexion sur cet appareil : Facebook."],
      [
        "mot-de-passe",
        "Dernière connexion sur cet appareil : e-mail et mot de passe.",
      ],
    ] as const) {
      const html = await rendre(
        <DerniereConnexion
          valeur={valeur}
          hasGoogle={true}
          hasFacebook={true}
        />
      )
      expect(html).toContain(phrase)
    }
  })

  it("ne rend rien avant la première Connexion de l'appareil", async () => {
    expect(
      await rendre(
        <DerniereConnexion valeur={null} hasGoogle={true} hasFacebook={true} />
      )
    ).toBe("")
  })

  it("ne rend rien quand le dernier moyen n'est plus offert", async () => {
    expect(
      await rendre(
        <DerniereConnexion
          valeur="facebook"
          hasGoogle={true}
          hasFacebook={false}
        />
      )
    ).toBe("")
  })

  it("ne rend rien quand la boutique n'offre qu'un moyen", async () => {
    expect(
      await rendre(
        <DerniereConnexion
          valeur="mot-de-passe"
          hasGoogle={false}
          hasFacebook={false}
        />
      )
    ).toBe("")
  })

  it("ne rend pas les identifiants de la bibliothèque", async () => {
    expect(
      await rendre(
        <DerniereConnexion valeur="email" hasGoogle={true} hasFacebook={true} />
      )
    ).toBe("")
  })

  it("reste une ligne sans icône, ni annonce, ni point de tabulation", async () => {
    const html = await rendre(
      <DerniereConnexion valeur="google" hasGoogle={true} hasFacebook={true} />
    )
    expect(html).toContain("<p")
    expect(html).not.toContain("aria-live")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<a ")
    expect(html).not.toContain("svg")
    expect(html).not.toContain("animate-")
  })
})
