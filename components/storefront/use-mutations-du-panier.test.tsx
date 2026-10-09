// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { MotifRefusPanier, ResultatPanier } from "@/lib/panier"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { useMutationsDuPanier } from "./use-mutations-du-panier"

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

async function rejouerTransition() {
  await act(async () => {})
  await act(async () => {})
}

const REFUS: { motif: MotifRefusPanier; message: string }[] = [
  {
    motif: "cap-atteinte",
    message: "Votre panier est plein : 20 articles maximum.",
  },
  {
    motif: "quantite-invalide",
    message:
      "Quantité invalide : la quantité doit être un entier d'au moins 1.",
  },
  {
    motif: "variante-inconnue",
    message: "Cet article n'est plus disponible.",
  },
  {
    motif: "article-inconnu",
    message: "Cet article est introuvable dans votre panier.",
  },
]

const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

describe("useMutationsDuPanier", () => {
  it("passe par le port, marque l'attente puis accuse la réception d'un ajout", async () => {
    const port = creerPortPanierEnMemoire()
    const hook = renderHook(() => useMutationsDuPanier(port))

    expect(hook.current.enAttente).toBe(false)
    expect(hook.current.ajoute).toBe(false)
    expect(hook.current.messageRefus).toBeUndefined()

    act(() => {
      hook.current.ajouter("variante-a", 1)
    })
    expect(hook.current.enAttente).toBe(true)

    await rejouerTransition()

    expect(hook.current.enAttente).toBe(false)
    expect(hook.current.ajoute).toBe(true)
    expect(hook.current.messageRefus).toBeUndefined()
    expect(port.appels).toEqual([
      { operation: "ajouter", variantId: "variante-a", quantity: 1 },
    ])
  })

  it("ne pose pas d'accusé après un modifier réussi", async () => {
    const port = creerPortPanierEnMemoire()
    const hook = renderHook(() => useMutationsDuPanier(port))

    act(() => {
      hook.current.modifier("variante-a", 3)
    })
    await rejouerTransition()

    expect(hook.current.ajoute).toBe(false)
    expect(hook.current.messageRefus).toBeUndefined()
    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-a", quantity: 3 },
    ])
  })

  it("ne pose pas d'accusé après un retirer réussi", async () => {
    const port = creerPortPanierEnMemoire()
    const hook = renderHook(() => useMutationsDuPanier(port))

    act(() => {
      hook.current.retirer("variante-a")
    })
    await rejouerTransition()

    expect(hook.current.ajoute).toBe(false)
    expect(hook.current.messageRefus).toBeUndefined()
    expect(port.appels).toEqual([
      { operation: "retirer", variantId: "variante-a" },
    ])
  })

  it.each(REFUS)(
    "relaie le message du refus $motif verbatim",
    async ({ motif, message }) => {
      const port = creerPortPanierEnMemoire(() => ({
        ok: false,
        motif,
        message,
      }))
      const hook = renderHook(() => useMutationsDuPanier(port))

      act(() => {
        hook.current.ajouter("variante-a", 1)
      })
      await rejouerTransition()

      expect(hook.current.messageRefus).toBe(message)
      expect(hook.current.ajoute).toBe(false)
      expect(port.appels).toEqual([
        { operation: "ajouter", variantId: "variante-a", quantity: 1 },
      ])
    }
  )

  it("relaie aussi les refus de modifier et retirer", async () => {
    const port = creerPortPanierEnMemoire((appel) =>
      appel.operation === "modifier"
        ? {
            ok: false,
            motif: "article-inconnu",
            message: MESSAGE_ARTICLE_INCONNU,
          }
        : {
            ok: false,
            motif: "variante-inconnue",
            message: "Cet article n'est plus disponible.",
          }
    )
    const hook = renderHook(() => useMutationsDuPanier(port))

    act(() => {
      hook.current.modifier("variante-a", 2)
    })
    await rejouerTransition()
    expect(hook.current.messageRefus).toBe(MESSAGE_ARTICLE_INCONNU)

    act(() => {
      hook.current.retirer("variante-a")
    })
    await rejouerTransition()
    expect(hook.current.messageRefus).toBe("Cet article n'est plus disponible.")
  })

  it("efface l'accusé et le refus dès qu'une opération suivante démarre", async () => {
    let resoudreModification!: (resultat: ResultatPanier) => void
    const port = creerPortPanierEnMemoire((appel) =>
      appel.operation === "modifier"
        ? new Promise<ResultatPanier>((resoudre) => {
            resoudreModification = resoudre
          })
        : { ok: true }
    )
    const hook = renderHook(() => useMutationsDuPanier(port))

    act(() => {
      hook.current.ajouter("variante-a", 1)
    })
    await rejouerTransition()
    expect(hook.current.ajoute).toBe(true)

    act(() => {
      hook.current.modifier("variante-a", 2)
    })
    expect(hook.current.enAttente).toBe(true)
    expect(hook.current.ajoute).toBe(false)
    expect(hook.current.messageRefus).toBeUndefined()

    act(() => {
      resoudreModification({
        ok: false,
        motif: "article-inconnu",
        message: MESSAGE_ARTICLE_INCONNU,
      })
    })
    await rejouerTransition()
    expect(hook.current.messageRefus).toBe(MESSAGE_ARTICLE_INCONNU)

    act(() => {
      hook.current.retirer("variante-a")
    })
    expect(hook.current.messageRefus).toBeUndefined()

    await rejouerTransition()
    expect(hook.current.messageRefus).toBeUndefined()
    expect(hook.current.ajoute).toBe(false)
  })
})
