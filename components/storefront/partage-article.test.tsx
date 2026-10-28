// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PartageArticle } from "./partage-article"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const URL_ARTICLE = "https://eguidar.com/blog/choisir-son-casque"

let container: HTMLDivElement
const roots: { unmount: () => void }[] = []

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
  retirerDeNavigator("share")
  retirerDeNavigator("clipboard")
  vi.restoreAllMocks()
})

function retirerDeNavigator(propriete: string) {
  delete (navigator as unknown as Record<string, unknown>)[propriete]
}

function definirSurNavigator(propriete: string, valeur: unknown) {
  Object.defineProperty(navigator, propriete, {
    configurable: true,
    value: valeur,
  })
}

function partage() {
  return <PartageArticle titre="Choisir son casque" slug="choisir-son-casque" />
}

function rendre() {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(partage()))
}

function bouton(texte: string): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === texte
  )!
}

function cliquer(element: Element) {
  act(() => {
    ;(element as HTMLElement).click()
  })
}

function statut(): HTMLElement {
  return container.querySelector<HTMLElement>('[role="status"]')!
}

describe("PartageArticle", () => {
  it("sans feuille native, ouvre les options et confirme la copie hors de la région masquée", async () => {
    const writeText = vi.fn(async () => {})
    definirSurNavigator("clipboard", { writeText })
    rendre()

    const declencheur = bouton("Partager")
    expect(declencheur.getAttribute("aria-haspopup")).toBeNull()
    expect(declencheur.getAttribute("aria-expanded")).toBe("false")

    const options = document.getElementById(
      declencheur.getAttribute("aria-controls") ?? ""
    )!
    expect(options.hidden).toBe(true)
    expect(options.contains(statut())).toBe(false)
    expect(statut().closest("[hidden]")).toBeNull()

    cliquer(declencheur)
    expect(declencheur.getAttribute("aria-expanded")).toBe("true")
    expect(options.hidden).toBe(false)

    cliquer(bouton("Copier le lien"))
    await act(async () => {})

    expect(writeText).toHaveBeenCalledWith(URL_ARTICLE)
    expect(statut().textContent).toBe("Lien copié dans le presse-papiers.")
  })

  it("avec la feuille native, annonce son ouverture et ne déplie pas les options", async () => {
    const share = vi.fn(async () => {})
    definirSurNavigator("share", share)
    rendre()

    const declencheur = bouton("Partager")
    expect(declencheur.getAttribute("aria-haspopup")).toBe("dialog")
    expect(declencheur.getAttribute("aria-expanded")).toBe("false")

    const options = document.getElementById(
      declencheur.getAttribute("aria-controls") ?? ""
    )!
    expect(options.hidden).toBe(true)
    expect(options.contains(statut())).toBe(false)

    cliquer(declencheur)

    expect(share).toHaveBeenCalledWith({
      title: "Choisir son casque",
      url: URL_ARTICLE,
    })
    expect(statut().textContent).toBe("Feuille de partage ouverte.")
    expect(options.hidden).toBe(true)
  })

  it("hydrate le rendu serveur sans divergence et n'active la feuille native qu'après", async () => {
    const share = vi.fn(async () => {})
    definirSurNavigator("share", share)
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {})

    container.innerHTML = renderToString(partage())
    expect(bouton("Partager").getAttribute("aria-haspopup")).toBeNull()

    const root = hydrateRoot(container, partage())
    roots.push(root)
    await act(async () => {})

    expect(
      erreurs.mock.calls.filter(([message]) =>
        String(message).toLowerCase().includes("hydrat")
      )
    ).toEqual([])
    expect(bouton("Partager").getAttribute("aria-haspopup")).toBe("dialog")
  })
})
