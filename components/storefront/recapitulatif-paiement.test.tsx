// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { RecapitulatifPaiement } from "./recapitulatif-paiement"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount())
  }
  roots.length = 0
  container.remove()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

describe("RecapitulatifPaiement", () => {
  it("passes className through to the dl container", () => {
    render(
      <RecapitulatifPaiement
        className="bg-muted/40 px-5 py-4"
        commande={{
          total: 10000,
          shippingFee: 2000,
          totalPayable: 12000,
          cityName: "Rabat",
        }}
      />
    )

    const dl = container.querySelector("dl")
    expect(dl?.className).toContain("bg-muted/40")
    expect(dl?.className).toContain("px-5")
    expect(dl?.className).toContain("py-4")
    expect(dl?.className).toContain("flex")
    expect(dl?.className).toContain("flex-col")
  })

  it("renders Devis rows without total as À choisir with muted tone", () => {
    render(
      <RecapitulatifPaiement
        rows={[
          {
            label: "Sous-total (TVA incluse)",
            value: "150,00 MAD",
            kind: "detail",
          },
          {
            label: "Livraison",
            value: "À choisir",
            kind: "detail",
            tone: "muted",
          },
        ]}
      />
    )

    const dts = Array.from(container.querySelectorAll("dt")).map(
      (el) => el.textContent
    )
    const dds = container.querySelectorAll("dd")
    expect(dts).toEqual(["Sous-total (TVA incluse)", "Livraison"])
    expect(dds[1].textContent).toBe("À choisir")
    expect(dds[1].className).toContain("text-muted-foreground")

    // Total omis quand aucune Ville de livraison n'est choisie
    expect(container.querySelectorAll("dl > div")).toHaveLength(2)
  })

  it("renders Devis rows with Livraison (Ville), fee and total", () => {
    render(
      <RecapitulatifPaiement
        rows={[
          {
            label: "Sous-total (TVA incluse)",
            value: "250,00 MAD",
            kind: "detail",
          },
          {
            label: "Livraison (Casablanca)",
            value: "30,00 MAD",
            kind: "detail",
          },
          {
            label: "Total à payer à la livraison",
            value: "280,00 MAD",
            kind: "total",
          },
        ]}
      />
    )

    const dts = Array.from(container.querySelectorAll("dt")).map(
      (el) => el.textContent
    )
    const dds = Array.from(container.querySelectorAll("dd")).map(
      (el) => el.textContent
    )
    expect(dts).toEqual([
      "Sous-total (TVA incluse)",
      "Livraison (Casablanca)",
      "Total à payer à la livraison",
    ])
    expect(dds[0]).toContain("250,00")
    expect(dds[1]).toContain("30,00")
    expect(dds[2]).toContain("280,00")

    const rowDivs = container.querySelectorAll("dl > div")
    expect(rowDivs).toHaveLength(3)
    const totalDiv = rowDivs[rowDivs.length - 1]
    expect(totalDiv.classList.contains("border-t")).toBe(true)
    expect(totalDiv.classList.contains("text-base")).toBe(true)
  })

  it("renders Devis rows with free shipping using the offered tone", () => {
    render(
      <RecapitulatifPaiement
        rows={[
          {
            label: "Sous-total (TVA incluse)",
            value: "300,00 MAD",
            kind: "detail",
          },
          {
            label: "Livraison (Rabat)",
            value: "Livraison offerte",
            kind: "detail",
            tone: "offered",
          },
          {
            label: "Total à payer à la livraison",
            value: "300,00 MAD",
            kind: "total",
          },
        ]}
      />
    )

    const dts = Array.from(container.querySelectorAll("dt")).map(
      (el) => el.textContent
    )
    expect(dts[1]).toBe("Livraison (Rabat)")

    const dds = container.querySelectorAll("dd")
    expect(dds[1].textContent).toBe("Livraison offerte")
    expect(dds[1].className).toContain("text-emerald-600")
  })

  it("passes Devis À choisir rows through without a total", () => {
    render(
      <RecapitulatifPaiement
        rows={[
          {
            label: "Sous-total (TVA incluse)",
            value: "150,00 MAD",
            kind: "detail",
          },
          {
            label: "Livraison",
            value: "À choisir",
            kind: "detail",
            tone: "muted",
          },
        ]}
      />
    )

    const dts = Array.from(container.querySelectorAll("dt")).map(
      (el) => el.textContent
    )
    const dds = container.querySelectorAll("dd")
    expect(dts).toEqual(["Sous-total (TVA incluse)", "Livraison"])
    expect(dds[1].textContent).toBe("À choisir")
    expect(dds[1].className).toContain("text-muted-foreground")
    expect(container.querySelectorAll("dl > div")).toHaveLength(2)
  })

  it("renders a Commande with city and consumes the precomputed Total à payer", () => {
    render(
      <RecapitulatifPaiement
        commande={{
          total: 20000,
          shippingFee: 3000,
          // Volontairement distinct de total + shippingFee (23000) :
          // le module d'affichage consomme totalPayable tel quel.
          totalPayable: 25000,
          cityName: "Casablanca",
        }}
      />
    )

    const dts = Array.from(container.querySelectorAll("dt")).map(
      (el) => el.textContent
    )
    const dds = Array.from(container.querySelectorAll("dd")).map(
      (el) => el.textContent
    )
    expect(dts).toEqual([
      "Sous-total (TVA incluse)",
      "Livraison (Casablanca)",
      "Total à payer à la livraison",
    ])
    expect(dds[0]).toContain("200,00")
    expect(dds[1]).toContain("30,00")
    expect(dds[2]).toContain("250,00")
  })
})
