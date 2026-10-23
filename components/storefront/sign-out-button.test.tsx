// @vitest-environment happy-dom
import {
  mockNextNavigation,
  navigationSpies,
  resetNavigation,
} from "@/components/auth/test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => mockNextNavigation())

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock("@/lib/client", () => ({ signOut }))

import { SignOutButton } from "./sign-out-button"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  signOut.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
})

function render(element: () => ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element()))
}

function boutonDeconnexion() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Déconnexion"]'
  )!
}

async function cliquerEtAttendre(cible: HTMLElement) {
  await act(async () => {
    cible.click()
  })
  await act(async () => {})
}

describe("SignOutButton", () => {
  it("déconnecte, renvoie à l'accueil et rafraîchit au clic", async () => {
    signOut.mockResolvedValue(undefined)
    render(() => <SignOutButton />)

    await cliquerEtAttendre(boutonDeconnexion())

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(navigationSpies.push).toHaveBeenCalledWith("/", undefined)
    expect(navigationSpies.refresh).toHaveBeenCalledTimes(1)
  })

  it("ne navigue qu'une fois la déconnexion terminée", async () => {
    let resoudreDeconnexion: (() => void) | undefined
    signOut.mockReturnValue(
      new Promise<void>((resolve) => {
        resoudreDeconnexion = resolve
      })
    )
    render(() => <SignOutButton />)

    await act(async () => {
      boutonDeconnexion().click()
    })
    await act(async () => {})

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(boutonDeconnexion().disabled).toBe(true)
    expect(navigationSpies.push).not.toHaveBeenCalled()
    expect(navigationSpies.refresh).not.toHaveBeenCalled()

    await act(async () => {
      resoudreDeconnexion?.()
    })
    await act(async () => {})

    expect(navigationSpies.push).toHaveBeenCalledWith("/", undefined)
    expect(navigationSpies.refresh).toHaveBeenCalledTimes(1)
    expect(boutonDeconnexion().disabled).toBe(false)
  })
})
