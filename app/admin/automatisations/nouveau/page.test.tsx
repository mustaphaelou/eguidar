import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/admin/regle-automation-form", () => ({
  RegleAutomationForm: ({
    regle,
    statuts,
  }: {
    regle?: unknown
    statuts: { valeur: string; libelle: string }[]
  }) => (
    <form
      data-testid="formulaire-regle"
      data-regle={JSON.stringify(regle ?? null)}
      data-statuts={JSON.stringify(statuts)}
    />
  ),
}))

import NouvelleReglePage from "./page"

function decoderEntites(texte: string): string {
  return texte
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

describe("la page de création d'une Règle", () => {
  it("rend l'éditeur vide avec le vocabulaire fermé et les statuts de Commande", async () => {
    const stream = await renderToReadableStream(<NouvelleReglePage />)
    const brut = await new Response(stream).text()
    const html = decoderEntites(brut)

    expect(html).toContain("Nouvelle règle")
    expect(html).toContain("vocabulaire fermé")
    expect(html).toContain('data-regle="null"')

    const statuts = JSON.parse(
      decoderEntites(/data-statuts="([^"]*)"/.exec(brut)?.[1] ?? "[]")
    )
    expect(statuts).toContainEqual({ valeur: "shipped", libelle: "Expédiée" })
  })
})
