import { describe, expect, it } from "vitest"

import { extraitDescription, pageMetadata } from "@/lib/metadata"

describe("extraitDescription", () => {
  it("écroule les espaces et coupe les bords", () => {
    expect(extraitDescription("  Une   description\n\n écrite  ")).toBe(
      "Une description écrite"
    )
  })

  it("ne rend rien pour une Description vide", () => {
    expect(extraitDescription("")).toBeUndefined()
    expect(extraitDescription("  \n\t  ")).toBeUndefined()
  })

  it("garde une Description courte entière", () => {
    const description = "Une courte description du Produit."
    expect(extraitDescription(description)).toBe(description)
  })

  it("coupe au dernier mot entier avant 155 caractères et ajoute une ellipse", () => {
    const description = Array.from(
      { length: 60 },
      (_, index) => `mot${index.toString().padStart(2, "0")}`
    ).join(" ")

    const extrait = extraitDescription(description)

    expect(extrait).toBeDefined()
    expect(extrait?.endsWith("…")).toBe(true)
    expect(extrait?.length ?? 0).toBeLessThanOrEqual(156)
    const motsGardes = extrait?.slice(0, -1).split(" ") ?? []
    expect(motsGardes.length).toBeGreaterThan(0)
    expect(motsGardes.every((mot) => /^mot\d{2}$/.test(mot))).toBe(true)
    expect(extrait).not.toBe(description)
  })

  it("coupe à 155 caractères quand aucun mot ne borne la Description", () => {
    const extrait = extraitDescription("x".repeat(200))

    expect(extrait).toBe(`${"x".repeat(155)}…`)
  })
})

describe("pageMetadata", () => {
  it("publie la Description dans la métadonnée et l'aperçu de partage", () => {
    const metadonnee = pageMetadata({
      title: "Titre",
      description: "Une description",
      path: "/page",
    })

    expect(metadonnee.description).toBe("Une description")
    expect(metadonnee.openGraph?.description).toBe("Une description")
  })

  it("omet la Description et l'aperçu de partage quand le texte est absent", () => {
    const metadonnee = pageMetadata({ title: "Titre", path: "/page" })

    expect(metadonnee.description).toBeUndefined()
    expect(metadonnee.openGraph?.description).toBeUndefined()
    expect(metadonnee.openGraph?.title).toBe("Titre")
  })

  it("omet une Description vide", () => {
    const metadonnee = pageMetadata({
      title: "Titre",
      description: "  \n ",
      path: "/page",
    })

    expect(metadonnee.description).toBeUndefined()
    expect(metadonnee.openGraph?.description).toBeUndefined()
  })
})
