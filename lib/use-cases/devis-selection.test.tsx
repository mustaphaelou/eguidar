// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatPrice } from "@/lib/money"
import {
  useDevisSelection,
  type DevisChargé,
} from "@/lib/use-cases/devis-selection"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison-prix"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function renderHook<T>(hook: () => T): { readonly current: T } {
  let current!: T
  function Probe() {
    current = hook()
    return null
  }
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Probe />))
  return {
    get current() {
      return current
    },
  }
}

const CASA: DeliveryCityOption = {
  id: "c1",
  slug: "casablanca",
  name: "Casablanca",
  fee: 3500,
}
const RABAT: DeliveryCityOption = {
  id: "c2",
  slug: "rabat",
  name: "Rabat",
  fee: 5000,
}

const QUOTE_CASA: ShippingQuote = {
  subtotal: 50000,
  shippingFee: 3500,
  total: 53500,
}
const QUOTE_RABAT: ShippingQuote = {
  subtotal: 50000,
  shippingFee: 5000,
  total: 55000,
}

const VILLES = [CASA, RABAT]
const QUOTES: Record<string, ShippingQuote> = {
  c1: QUOTE_CASA,
  c2: QUOTE_RABAT,
}

function devisValide(): DevisChargé {
  return {
    cities: VILLES,
    threshold: 100000,
    quotes: QUOTES,
    sousTotal: 50000,
    villeInitiale: "c1",
  }
}

function devisAucune(): DevisChargé {
  return {
    cities: VILLES,
    threshold: 100000,
    quotes: QUOTES,
    sousTotal: 50000,
    villeInitiale: null,
  }
}

describe("useDevisSelection", () => {
  it("expose la Sélection initiale du Devis chargé, avec ses lignes chiffrées", () => {
    const hook = renderHook(() => useDevisSelection(devisValide()))

    expect(hook.current.villeId).toBe("c1")
    expect(hook.current.villes).toEqual(VILLES)
    expect(hook.current.selection).toStrictEqual({
      cas: "validée",
      ville: CASA,
      devis: QUOTE_CASA,
    })
    expect(hook.current.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      value: formatPrice(3500),
      kind: "detail",
    })
    expect(hook.current.rows.find((row) => row.kind === "total")).toMatchObject(
      {
        label: "Total à payer à la livraison",
        value: formatPrice(53500),
      }
    )
  })

  it("démarre à « aucune » quand le Devis chargé ne porte aucune ville", () => {
    const hook = renderHook(() => useDevisSelection(devisAucune()))

    expect(hook.current.selection).toStrictEqual({ cas: "aucune" })
    expect(hook.current.rows[1]).toEqual({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(hook.current.rows.some((row) => row.kind === "total")).toBe(false)
  })

  it("choisir(villeId) re-chiffre les lignes instantanément", () => {
    const hook = renderHook(() => useDevisSelection(devisAucune()))

    expect(hook.current.selection).toStrictEqual({ cas: "aucune" })

    act(() => {
      hook.current.choisir("c2")
    })

    expect(hook.current.selection).toStrictEqual({
      cas: "validée",
      ville: RABAT,
      devis: QUOTE_RABAT,
    })
    expect(hook.current.rows[1]).toMatchObject({
      label: "Livraison (Rabat)",
      value: formatPrice(5000),
      kind: "detail",
    })
    expect(hook.current.rows.find((row) => row.kind === "total")).toMatchObject(
      {
        label: "Total à payer à la livraison",
        value: formatPrice(55000),
      }
    )
  })

  it('choisir("  c2  ") normalise l\'identifiant : Rabat, sélection validée et lignes re-chiffrées', () => {
    const hook = renderHook(() => useDevisSelection(devisAucune()))

    act(() => {
      hook.current.choisir("  c2  ")
    })

    expect(hook.current.villeId).toBe("c2")
    expect(hook.current.selection).toStrictEqual({
      cas: "validée",
      ville: RABAT,
      devis: QUOTE_RABAT,
    })
    expect(hook.current.rows[1]).toMatchObject({
      label: "Livraison (Rabat)",
      value: formatPrice(5000),
      kind: "detail",
    })
    expect(hook.current.rows.find((row) => row.kind === "total")).toMatchObject(
      {
        label: "Total à payer à la livraison",
        value: formatPrice(55000),
      }
    )
  })

  it("choisir(null) exprime « aucune » sans chaîne vide", () => {
    const hook = renderHook(() => useDevisSelection(devisValide()))

    expect(hook.current.selection.cas).toBe("validée")

    act(() => {
      hook.current.choisir(null)
    })

    expect(hook.current.villeId).toBeNull()
    expect(hook.current.selection).toStrictEqual({ cas: "aucune" })
    expect(hook.current.rows[1]).toEqual({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(hook.current.rows.some((row) => row.kind === "total")).toBe(false)
  })

  it('choisir("") retombe aussi sur « aucune » — cas vide encore supporté', () => {
    const hook = renderHook(() => useDevisSelection(devisValide()))

    expect(hook.current.selection.cas).toBe("validée")

    act(() => {
      hook.current.choisir("")
    })

    expect(hook.current.selection).toStrictEqual({ cas: "aucune" })
  })

  it("un identifiant inconnu retombe sur « aucune » — jamais à moitié, ne lève jamais", () => {
    const hook = renderHook(() => useDevisSelection(devisValide()))

    expect(() =>
      act(() => {
        hook.current.choisir("ville-inconnue")
      })
    ).not.toThrow()

    expect(hook.current.selection).toStrictEqual({ cas: "aucune" })
    expect(hook.current.rows[1]).toEqual({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(hook.current.rows.some((row) => row.kind === "total")).toBe(false)
  })

  it("sème l'état initial à la Ville initiale portée (profil résolu au chargement)", () => {
    const hook = renderHook(() =>
      useDevisSelection({
        cities: VILLES,
        threshold: 100000,
        quotes: QUOTES,
        sousTotal: 50000,
        villeInitiale: "c2",
      })
    )

    expect(hook.current.villeId).toBe("c2")
    expect(hook.current.selection).toStrictEqual({
      cas: "validée",
      ville: RABAT,
      devis: QUOTE_RABAT,
    })
  })

  it("local choice wins over the seeded Ville initiale after first choisir", () => {
    const hook = renderHook(() =>
      useDevisSelection({
        cities: VILLES,
        threshold: 100000,
        quotes: QUOTES,
        sousTotal: 50000,
        villeInitiale: "c1",
      })
    )
    expect(hook.current.villeId).toBe("c1")

    act(() => {
      hook.current.choisir("c2")
    })

    expect(hook.current.villeId).toBe("c2")
    expect(hook.current.selection).toStrictEqual({
      cas: "validée",
      ville: RABAT,
      devis: QUOTE_RABAT,
    })
  })

  it("re-projette les faits du Devis courant, sans perdre la Ville choisie localement", () => {
    const premier = devisValide()
    const quoteFraisCasa: ShippingQuote = {
      subtotal: 90000,
      shippingFee: 3500,
      total: 93500,
    }
    const quoteFraisRabat: ShippingQuote = {
      subtotal: 90000,
      shippingFee: 5000,
      total: 95000,
    }
    const second: DevisChargé = {
      cities: VILLES,
      threshold: 100000,
      quotes: { c1: quoteFraisCasa, c2: quoteFraisRabat },
      sousTotal: 90000,
      villeInitiale: "c1",
    }

    let current!: ReturnType<typeof useDevisSelection>
    function Probe({ devis }: { devis: DevisChargé }) {
      current = useDevisSelection(devis)
      return null
    }

    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(<Probe devis={premier} />))

    act(() => {
      current.choisir("c2")
    })
    expect(current.villeId).toBe("c2")

    act(() => root.render(<Probe devis={second} />))

    // Les faits suivent le Devis courant…
    expect(current.villes).toEqual(VILLES)
    expect(current.selection).toStrictEqual({
      cas: "validée",
      ville: RABAT,
      devis: quoteFraisRabat,
    })
    expect(current.rows[1]).toMatchObject({
      label: "Livraison (Rabat)",
      value: formatPrice(5000),
      kind: "detail",
    })
    expect(current.rows.find((row) => row.kind === "total")).toMatchObject({
      label: "Total à payer à la livraison",
      value: formatPrice(95000),
    })
    // …mais le choix local l'emporte sur la Ville initiale re-semée.
    expect(current.villeId).toBe("c2")
  })

  it("choosing at Checkout never writes back to the link or window.history", () => {
    const originalHref = window.location.href
    const replaceSpy = vi.spyOn(window.history, "replaceState")
    const pushSpy = vi.spyOn(window.history, "pushState")

    const hook = renderHook(() => useDevisSelection(devisValide()))
    act(() => {
      hook.current.choisir("c2")
    })

    expect(window.location.href).toBe(originalHref)
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
    replaceSpy.mockRestore()
    pushSpy.mockRestore()
  })
})
