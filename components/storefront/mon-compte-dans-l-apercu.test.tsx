// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  mockNextLink,
  mockNextNavigation,
  navigationSpies,
  resetNavigation,
} from "@/components/auth/test-utils"

vi.mock("next/link", () => mockNextLink())

vi.mock("next/navigation", () => mockNextNavigation())

const { openLogin, signOut } = vi.hoisted(() => ({
  openLogin: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock("@/components/auth/auth-dialogs", () => ({
  useAuthDialogs: () => ({ openLogin }),
}))

vi.mock("@/lib/client", () => ({ signOut }))

import type { Client } from "@/lib/use-cases/session-courante"

import {
  ApercuDuPanierProvider,
  useApercuDuPanier,
} from "./apercu-du-panier-provider"
import { MonCompteDansLApercu } from "./mon-compte-dans-l-apercu"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const CLIENT: Client = {
  id: "client-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
}

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  openLogin.mockReset()
  signOut.mockReset()
  resetNavigation("/")
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

function ApercuDeTest({ client }: { client: Client | null }) {
  const { ouvert, basculer } = useApercuDuPanier()

  return (
    <>
      <button
        type="button"
        aria-label="Panier"
        onClick={(event) => basculer(event.currentTarget)}
      >
        Panier
      </button>
      {ouvert ? (
        <div role="dialog" aria-modal="true">
          <h2>Mon panier</h2>
          <MonCompteDansLApercu client={client} />
        </div>
      ) : null}
    </>
  )
}

function render(client: Client | null) {
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      <ApercuDuPanierProvider>
        <ApercuDeTest client={client} />
      </ApercuDuPanierProvider>
    )
  )
}

function dialogue() {
  return container.querySelector<HTMLElement>("[role='dialog']")
}

function declencheurDuPanier() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-label='Panier']"
  )!
}

function entree(label: string) {
  return [...container.querySelectorAll<HTMLElement>("a, button")].find(
    (element) => element.textContent?.trim() === label
  )!
}

function ouvrirLApercu() {
  act(() => declencheurDuPanier().click())
}

describe("MonCompteDansLApercu", () => {
  it("referme l'Aperçu avant d'ouvrir la Connexion", async () => {
    render(null)
    ouvrirLApercu()
    expect(dialogue()).not.toBeNull()

    await act(async () => {
      entree("Connexion").click()
    })

    expect(dialogue()).toBeNull()
    expect(openLogin).toHaveBeenCalledTimes(1)
  })

  it("referme l'Aperçu quand une entrée de navigation est activée", async () => {
    render(null)
    ouvrirLApercu()
    expect(dialogue()).not.toBeNull()

    const commandes = entree("Commandes")
    expect(commandes.tagName).toBe("A")
    expect(commandes.getAttribute("href")).toBe("/commandes")

    await act(async () => {
      commandes.click()
    })

    expect(dialogue()).toBeNull()
  })

  it("referme l'Aperçu quand l'entrée Mon profil est activée", async () => {
    render(null)
    ouvrirLApercu()

    const profil = entree("Mon profil")
    expect(profil.getAttribute("href")).toBe("/profil")

    await act(async () => {
      profil.click()
    })

    expect(dialogue()).toBeNull()
  })

  it("referme l'Aperçu avant de se déconnecter, puis navigue et rafraîchit", async () => {
    signOut.mockResolvedValue(undefined)
    render(CLIENT)
    ouvrirLApercu()
    expect(dialogue()).not.toBeNull()

    await act(async () => {
      entree("Déconnexion").click()
    })
    await act(async () => {})

    expect(dialogue()).toBeNull()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      navigationSpies.push.mock.invocationCallOrder[0]
    )
    expect(navigationSpies.push).toHaveBeenCalledWith("/", undefined)
    expect(navigationSpies.refresh).toHaveBeenCalledTimes(1)
  })
})
