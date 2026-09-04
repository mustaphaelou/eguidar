// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { formatPrice } from "@/lib/money"
import {
  useDevisSelection,
  type Devis,
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

/**
 * Harness minimal au niveau de l'interface : monte le hook sans toucher
 * aux coutures internes (`selectionnerDevis` / `lignesDevis` ne sont ni
 * importées ni moquées ici) et expose le dernier rendu via `.current`.
 */
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

const CASA: DeliveryCityOption = { id: "c1", name: "Casablanca", fee: 3500 }
const RABAT: DeliveryCityOption = { id: "c2", name: "Rabat", fee: 5000 }

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

function devisValide(): Devis {
  return {
    cities: VILLES,
    threshold: 100000,
    quotes: QUOTES,
    sousTotal: 50000,
    cas: "validée",
    ville: CASA,
    devis: QUOTE_CASA,
  }
}

function devisAucune(): Devis {
  return {
    cities: VILLES,
    threshold: 100000,
    quotes: QUOTES,
    sousTotal: 50000,
    cas: "aucune",
  }
}

describe("useDevisSelection", () => {
  it("expose la Sélection initiale du Devis chargé, avec ses lignes chiffrées", () => {
    const hook = renderHook(() => useDevisSelection(devisValide()))

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
    expect(
      hook.current.rows.find((row) => row.kind === "total")
    ).toMatchObject({
      label: "Total à payer à la livraison",
      value: formatPrice(53500),
    })
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
    expect(
      hook.current.rows.find((row) => row.kind === "total")
    ).toMatchObject({
      label: "Total à payer à la livraison",
      value: formatPrice(55000),
    })
  })

  it("choisir(\"\") retombe sur « aucune »", () => {
    const hook = renderHook(() => useDevisSelection(devisValide()))

    expect(hook.current.selection.cas).toBe("validée")

    act(() => {
      hook.current.choisir("")
    })

    expect(hook.current.selection).toStrictEqual({ cas: "aucune" })
    expect(hook.current.rows[1]).toEqual({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(hook.current.rows.some((row) => row.kind === "total")).toBe(false)
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
})
