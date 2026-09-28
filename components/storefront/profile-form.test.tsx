// @vitest-environment happy-dom
import {
  flush,
  mockNextNavigation,
  resetNavigation,
} from "@/components/auth/test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { useSearchParams } from "next/navigation"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider } from "@/components/auth/auth-dialogs"

const { updateProfileMock } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
}))

vi.mock("@/app/(boutique)/profil/actions", () => ({
  updateProfileAction: updateProfileMock,
}))

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("@/lib/client", () => ({
  useSession: () => ({ data: null, isPending: false }),
}))

import { ProfileForm } from "./profile-form"
import { parseAuthParams } from "@/lib/lien-de-connexion"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/profil")
  updateProfileMock.mockReset()
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function rerender(element: ReactElement) {
  act(() => roots[roots.length - 1].render(element))
}

function Probe() {
  const { dialog } = parseAuthParams(useSearchParams())
  return <div data-dialog={dialog ?? "none"} />
}

const CITY_ID = "cmsp6pvbu000052p6o2m9o8zw"

function profileHarness({
  initialCityId = "",
}: { initialCityId?: string } = {}) {
  return (
    <AuthDialogsProvider>
      <Probe />
      <ProfileForm
        cities={[
          { id: CITY_ID, slug: "casablanca", name: "Casablanca", fee: 2500 },
        ]}
        initialCityId={initialCityId}
        initialAddress=""
        initialPhone=""
      />
    </AuthDialogsProvider>
  )
}

function dialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

async function submitForm() {
  container
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("ProfileForm", () => {
  it("opens the Connexion modal over /profil with ?next=/profil when the save is refused, leaving the path unchanged", async () => {
    updateProfileMock.mockResolvedValue({ unauthenticated: true })

    render(profileHarness())
    await act(async () => submitForm())
    await flush()
    rerender(profileHarness())

    expect(updateProfileMock).toHaveBeenCalledTimes(1)
    const url = new URL(window.location.href)
    expect(url.pathname).toBe("/profil")
    expect(url.searchParams.get("open")).toBe("login")
    expect(url.searchParams.get("next")).toBe("/profil")
    expect(dialog()).toBe("login")
  })

  it("shows the saved city's name in the closed trigger, never its identifier", () => {
    render(profileHarness({ initialCityId: CITY_ID }))

    const trigger = container.querySelector<HTMLElement>(
      '[data-slot="select-trigger"]'
    )!
    expect(trigger.textContent).toBe("Casablanca")
    expect(trigger.textContent).not.toContain(CITY_ID)
  })

  it("leaves the URL and dialogs untouched when the save goes through", async () => {
    updateProfileMock.mockResolvedValue({})

    render(profileHarness())
    await act(async () => submitForm())
    await flush()

    expect(updateProfileMock).toHaveBeenCalledTimes(1)
    expect(updateProfileMock.mock.calls[0][1]).toBeInstanceOf(FormData)
    expect(new URL(window.location.href).search).toBe("")
    expect(dialog()).toBe("none")
  })
})
