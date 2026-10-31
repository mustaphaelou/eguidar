// @vitest-environment happy-dom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CommandesTable } from "@/app/admin/commandes/commandes-table"
import { parseCommandeListingParams } from "@/lib/commande-listing"
import { ORDER_STATUS_LABELS } from "@/lib/statut-de-commande"
import type { AdminOrdersPage } from "@/lib/use-cases/orders"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const PAGE: AdminOrdersPage = {
  orders: [
    {
      id: "commande-12345678",
      status: "pending",
      total: 100000,
      shippingFee: 0,
      totalPayable: 100000,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      itemCount: 2,
      customerName: "Alix Martin",
      customerEmail: "alix@example.test",
    },
  ],
  totalCount: 37,
  pageCount: 4,
}

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

function rendre() {
  root = createRoot(container)
  act(() => {
    root!.render(
      <CommandesTable
        params={parseCommandeListingParams({
          page: "1",
          pageSize: "10",
          statut: "pending",
        })}
        page={PAGE}
      />
    )
  })
}

function regionDeStatut(): HTMLElement {
  const regions = document.querySelectorAll<HTMLElement>('[role="status"]')
  expect(regions).toHaveLength(1)
  return regions[0]!
}

describe("CommandesTable — la grille étiquetée", () => {
  it("nomme le champ de recherche et annonce le total de la vue", () => {
    rendre()

    const champ = container.querySelector<HTMLInputElement>("input")
    expect(champ).not.toBeNull()
    expect(
      document.querySelector(`label[for="${champ!.id}"]`)?.textContent
    ).toBe("Rechercher une commande par nom ou email")

    const region = regionDeStatut()
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.textContent).toContain("37 commandes")
  })

  it("nomme le sélecteur de taille de page", () => {
    rendre()

    const selecteur = container.querySelector<HTMLElement>(
      '[data-slot="select-trigger"]'
    )
    expect(selecteur?.getAttribute("aria-label")).toBe("Lignes par page")
  })

  it("annonce le Statut de commande filtré comme pressé", async () => {
    rendre()

    const declencheur = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((bouton) => bouton.textContent?.includes("Statut de commande"))
    expect(declencheur).toBeDefined()
    expect(declencheur!.getAttribute("aria-label")).toContain("En attente")

    await act(async () => {
      declencheur!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const options = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((bouton) =>
      [ORDER_STATUS_LABELS.pending, ORDER_STATUS_LABELS.confirmed].includes(
        bouton.textContent ?? ""
      )
    )
    const parLibelle = new Map(
      options.map((option) => [option.textContent, option])
    )

    expect(
      parLibelle.get(ORDER_STATUS_LABELS.pending)?.getAttribute("aria-pressed")
    ).toBe("true")
    expect(
      parLibelle
        .get(ORDER_STATUS_LABELS.confirmed)
        ?.getAttribute("aria-pressed")
    ).toBe("false")
  })

  it("ne laisse aucun bouton ni champ sans nom accessible", () => {
    rendre()

    for (const bouton of document.querySelectorAll<HTMLButtonElement>(
      "button"
    )) {
      expect(
        bouton.getAttribute("aria-label")?.trim() || bouton.textContent?.trim(),
        bouton.outerHTML
      ).toBeTruthy()
    }

    for (const champ of document.querySelectorAll<HTMLInputElement>("input")) {
      if (champ.getAttribute("aria-hidden") === "true") continue
      const label = champ.id
        ? document.querySelector(`label[for="${champ.id}"]`)
        : null
      expect(
        champ.getAttribute("aria-label") || label?.textContent,
        champ.outerHTML
      ).toBeTruthy()
    }
  })
})
