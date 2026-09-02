// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { ajouterArticleAuPanierActionMock } = vi.hoisted(() => ({
  ajouterArticleAuPanierActionMock: vi.fn(),
}))

vi.mock("@/app/(boutique)/actions", () => ({
  ajouterArticleAuPanierAction: ajouterArticleAuPanierActionMock,
}))

import { formatPrice } from "@/lib/money"
import { useAjoutAuPanier } from "./use-ajout-au-panier"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const varianteStandard = {
  id: "variante-a",
  name: "Standard",
  sku: "UAP-A",
  prix: 100000,
  priceDelta: 0,
  stock: 4,
}
const variantePremium = {
  id: "variante-b",
  name: "Premium",
  sku: "UAP-B",
  prix: 125000,
  priceDelta: 25000,
  stock: 2,
}
const varianteEpuisee = {
  id: "variante-c",
  name: "Épuisée",
  sku: "UAP-C",
  prix: 100000,
  priceDelta: 0,
  stock: 0,
}

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function Harness({ variants }: Parameters<typeof useAjoutAuPanier>[0]) {
  const ajout = useAjoutAuPanier({ variants })
  return (
    <div
      data-variant-id={ajout.variantId}
      data-prix={ajout.prix}
      data-stock={ajout.stock}
      data-out-of-stock={String(ajout.outOfStock)}
      data-en-attente={String(ajout.enAttente)}
      data-ajoute={String(ajout.ajoute)}
      data-cap-atteint={String(ajout.capAtteint)}
      data-desactive={String(ajout.desactive)}
      data-variant-nom={ajout.variantNom ?? ""}
    >
      <button
        type="button"
        data-choisir="variante-a"
        onClick={() => ajout.setVariantId("variante-a")}
      >
        choisir standard
      </button>
      <button
        type="button"
        data-choisir="variante-b"
        onClick={() => ajout.setVariantId("variante-b")}
      >
        choisir premium
      </button>
      <button type="button" data-ajouter onClick={ajout.ajouter}>
        ajouter
      </button>
    </div>
  )
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  ajouterArticleAuPanierActionMock.mockReset()
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function monter(props?: Parameters<typeof useAjoutAuPanier>[0]) {
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      <Harness
        variants={props?.variants ?? [varianteStandard, variantePremium]}
      />
    )
  )
}

function etat() {
  const el = container.firstElementChild as HTMLElement
  return {
    variantId: el.getAttribute("data-variant-id")!,
    prix: el.getAttribute("data-prix")!,
    stock: Number(el.getAttribute("data-stock")),
    outOfStock: el.getAttribute("data-out-of-stock") === "true",
    enAttente: el.getAttribute("data-en-attente") === "true",
    ajoute: el.getAttribute("data-ajoute") === "true",
    capAtteint: el.getAttribute("data-cap-atteint") === "true",
    desactive: el.getAttribute("data-desactive") === "true",
    variantNom: el.getAttribute("data-variant-nom") || undefined,
  }
}

function cliquerAjouter() {
  act(() => {
    container
      .querySelector<HTMLButtonElement>("[data-ajouter]")!
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
  })
}

async function rejouerTransition() {
  await act(async () => {})
  await act(async () => {})
}

function choisir(id: string) {
  act(() => {
    container
      .querySelector<HTMLButtonElement>(`[data-choisir="${id}"]`)!
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
  })
}

describe("useAjoutAuPanier", () => {
  it("sélectionne la première Variante et lit son état", () => {
    monter({ variants: [varianteStandard] })

    expect(etat().variantId).toBe("variante-a")
    expect(etat().prix).toBe(formatPrice(100000))
    expect(etat().stock).toBe(4)
    expect(etat().outOfStock).toBe(false)
    expect(etat().desactive).toBe(false)
    expect(etat().enAttente).toBe(false)
    expect(etat().variantNom).toBeUndefined()
  })

  it("lit le prix et le nom de la Variante quand la sélection change", () => {
    monter()

    expect(etat().variantNom).toBe("Standard")
    choisir("variante-b")

    expect(etat().variantId).toBe("variante-b")
    expect(etat().prix).toBe(formatPrice(125000))
    expect(etat().stock).toBe(2)
    expect(etat().outOfStock).toBe(false)
    expect(etat().variantNom).toBe("Premium")
  })

  it("confirms the addition when the action succeeds", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({ ok: true })
    monter()

    cliquerAjouter()
    expect(etat().enAttente).toBe(true)

    await rejouerTransition()

    expect(ajouterArticleAuPanierActionMock).toHaveBeenCalledTimes(1)
    expect(ajouterArticleAuPanierActionMock).toHaveBeenCalledWith(
      "variante-a",
      1
    )
    expect(etat().ajoute).toBe(true)
    expect(etat().capAtteint).toBe(false)
    expect(etat().enAttente).toBe(false)
  })

  it("shows the explicit cap state when the Visiteur's Panier is full", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({
      ok: false,
      motif: "cap-atteinte",
    })
    monter()

    cliquerAjouter()
    await rejouerTransition()

    expect(ajouterArticleAuPanierActionMock.mock.calls[0]).toHaveLength(2)
    expect(etat().capAtteint).toBe(true)
    expect(etat().ajoute).toBe(false)
  })

  it("stays silent on any other refusal", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({
      ok: false,
      motif: "quantite-invalide",
    })
    monter()

    cliquerAjouter()
    await rejouerTransition()

    expect(etat().ajoute).toBe(false)
    expect(etat().capAtteint).toBe(false)
  })

  it("resets the previous outcome when a new addition starts", async () => {
    ajouterArticleAuPanierActionMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, motif: "cap-atteinte" })
    monter()

    cliquerAjouter()
    await rejouerTransition()
    expect(etat().ajoute).toBe(true)

    cliquerAjouter()
    await rejouerTransition()
    expect(etat().ajoute).toBe(false)
    expect(etat().capAtteint).toBe(true)
  })

  it("does not call the action while the selected Variante is out of stock", () => {
    monter({ variants: [varianteEpuisee, variantePremium] })

    expect(etat().outOfStock).toBe(true)
    expect(etat().desactive).toBe(true)
    cliquerAjouter()

    expect(ajouterArticleAuPanierActionMock).not.toHaveBeenCalled()

    choisir("variante-b")
    expect(etat().desactive).toBe(false)
  })

  it("handles a product without Variante and refuses to add", () => {
    monter({ variants: [] })

    expect(etat().prix).toBe("")
    expect(etat().outOfStock).toBe(true)
    expect(etat().desactive).toBe(true)
    expect(etat().variantNom).toBeUndefined()
    cliquerAjouter()

    expect(ajouterArticleAuPanierActionMock).not.toHaveBeenCalled()
  })
})
