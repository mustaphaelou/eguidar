// @vitest-environment happy-dom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DataTableToolbar } from "@/components/data-table"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

interface Ligne {
  id: string
  statut: string
}

const LIGNES: Ligne[] = [
  { id: "commande-1", statut: "pending" },
  { id: "commande-2", statut: "shipped" },
]

const COLONNES: ColumnDef<Ligne>[] = [{ id: "statut", accessorKey: "statut" }]

const FILTRES = [
  {
    columnId: "statut",
    title: "Statut de commande",
    options: [
      { value: "pending", label: "En attente" },
      { value: "shipped", label: "Expédiée" },
    ],
  },
]

const ETIQUETTES = {
  singulier: "commande",
  pluriel: "commandes",
  feminin: true,
} as const

let container: HTMLDivElement
let root: ReturnType<typeof createRoot> | null = null

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = null
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
})

function Tableau({
  selection = {},
  selectedCount,
}: {
  selection?: Record<string, boolean>
  selectedCount?: number
}) {
  const table = useReactTable({
    data: LIGNES,
    columns: COLONNES,
    getRowId: (ligne) => ligne.id,
    state: {
      rowSelection: selection,
      columnFilters: [{ id: "statut", value: ["pending"] }],
    },
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DataTableToolbar
      table={table}
      searchLabel="Rechercher une commande"
      resultCount={42}
      selectedCount={selectedCount}
      statusLabels={ETIQUETTES}
      filters={FILTRES}
    />
  )
}

function rendre(selection?: Record<string, boolean>, selectedCount?: number) {
  if (!root) {
    root = createRoot(container)
  }
  act(() => {
    root!.render(
      <Tableau selection={selection} selectedCount={selectedCount} />
    )
  })
}

function zoneDeStatut(): HTMLElement {
  const zones = document.querySelectorAll<HTMLElement>('[role="status"]')
  expect(zones).toHaveLength(1)
  return zones[0]!
}

async function ouvrirLeFiltre() {
  const declencheur = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((bouton) => bouton.textContent?.includes("Statut de commande"))
  if (!declencheur) throw new Error("déclencheur du filtre absent")
  await act(async () => {
    declencheur.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("DataTableToolbar — la grille étiquetée", () => {
  it("donne au champ de recherche un nom accessible, pas seulement un placeholder", () => {
    rendre()

    const champ = container.querySelector<HTMLInputElement>("input")
    expect(champ).not.toBeNull()
    expect(champ!.placeholder).toBeTruthy()

    const etiquette = document.querySelector<HTMLLabelElement>(
      `label[for="${champ!.id}"]`
    )
    expect(etiquette?.textContent).toBe("Rechercher une commande")
  })

  it("annonce le nombre de résultats dans une seule région polie", () => {
    rendre()

    const zone = zoneDeStatut()
    expect(zone.getAttribute("aria-live")).toBe("polite")
    expect(zone.textContent).toContain("42 commandes")
    expect(zone.textContent).not.toContain("sélectionnée")
  })

  it("annonce le nombre de résultats et la sélection dans la même région", () => {
    rendre({ "commande-1": true, "commande-2": true })

    const zone = zoneDeStatut()
    expect(zone.textContent).toContain("42 commandes")
    expect(zone.textContent).toContain("2 commandes sélectionnées")
  })

  it("annonce chaque option de filtre comme pressée ou non", async () => {
    rendre()
    await ouvrirLeFiltre()

    const options = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((bouton) =>
      ["En attente", "Expédiée"].includes(bouton.textContent ?? "")
    )

    expect(options).toHaveLength(2)
    const parLibelle = new Map(
      options.map((option) => [option.textContent, option])
    )
    expect(parLibelle.get("En attente")!.getAttribute("aria-pressed")).toBe(
      "true"
    )
    expect(parLibelle.get("Expédiée")!.getAttribute("aria-pressed")).toBe(
      "false"
    )
  })
})
