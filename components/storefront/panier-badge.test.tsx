// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { PanierBadge } from "./panier-badge"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function reponseJson(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200 })
}

function differe<T>(): { promesse: Promise<T>; resoudre: (valeur: T) => void } {
  let resoudre!: (valeur: T) => void
  const promesse = new Promise<T>((resoudreLaPromesse) => {
    resoudre = resoudreLaPromesse
  })
  return { promesse, resoudre }
}

function rendreSansAttendre(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

async function rendreEtAttendre(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(element))
}

async function rejouer() {
  await act(async () => {})
  await act(async () => {})
}

function boutonAjout(port: PortMutationsDuPanier) {
  function AjoutDeTest() {
    const { ajouter } = useMutationsDuPanier(port)
    return (
      <button type="button" onClick={() => ajouter("variante-a", 1)}>
        Ajouter
      </button>
    )
  }
  return <AjoutDeTest />
}

/** Le déclencheur du Bandeau, seul endroit où le badge est monté. */
function DeclencheurDuPanier() {
  return (
    <button type="button" aria-label="Panier">
      <PanierBadge />
    </button>
  )
}

function declencheurDuPanier(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-label='Panier']"
  )!
}

function badge(): HTMLElement | null {
  return declencheurDuPanier().querySelector("span")
}

function bouton(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === label
  )!
}

describe("PanierBadge", () => {
  it("n'affiche le badge qu'une fois le compteur arrivé, dans le déclencheur du Panier", async () => {
    const attente = differe<Response>()
    const fetchMock = vi.fn(() => attente.promesse)
    vi.stubGlobal("fetch", fetchMock)

    rendreSansAttendre(<DeclencheurDuPanier />)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/panier",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    )
    expect(badge()).toBeNull()

    await act(async () => {
      attente.resoudre(reponseJson({ itemCount: 5 }))
    })

    expect(badge()?.textContent).toBe("5")
  })

  it("reste absent pour un Panier vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponseJson({ itemCount: 0 }))
    )

    await rendreEtAttendre(<DeclencheurDuPanier />)

    expect(badge()).toBeNull()
  })

  it("reste absent quand la lecture échoue, sans laisser de trace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 }))
    )

    await rendreEtAttendre(<DeclencheurDuPanier />)

    expect(badge()).toBeNull()
  })

  it("relit le compteur après un ajout réussi, sans rechargement de document", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reponseJson({ itemCount: 2 }))
      .mockResolvedValueOnce(reponseJson({ itemCount: 3 }))
    vi.stubGlobal("fetch", fetchMock)
    const port = creerPortPanierEnMemoire()

    await rendreEtAttendre(
      <>
        <DeclencheurDuPanier />
        {boutonAjout(port)}
      </>
    )
    expect(badge()?.textContent).toBe("2")

    await act(async () => {
      bouton("Ajouter").click()
    })
    await rejouer()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(badge()?.textContent).toBe("3")
  })

  it("ne relit pas le compteur quand la mutation est refusée", async () => {
    const fetchMock = vi.fn(async () => reponseJson({ itemCount: 2 }))
    vi.stubGlobal("fetch", fetchMock)
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "variante-inconnue",
      message: "Cet article n'est plus disponible.",
    }))

    await rendreEtAttendre(
      <>
        <DeclencheurDuPanier />
        {boutonAjout(port)}
      </>
    )

    await act(async () => {
      bouton("Ajouter").click()
    })
    await rejouer()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(badge()?.textContent).toBe("2")
  })
})
