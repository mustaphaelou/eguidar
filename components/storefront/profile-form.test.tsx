// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuthDialogsProvider,
} from "@/components/auth/auth-dialogs-context"

const { updateProfileMock, searchParamsState } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  searchParamsState: {
    value: new URLSearchParams(),
    sync(query: string) {
      this.value = new URLSearchParams(query)
    },
  },
}))

vi.mock("@/app/(boutique)/profil/actions", () => ({
  updateProfileAction: updateProfileMock,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({
    push: (url: string) => {
      window.history.pushState(null, "", url)
    },
    replace: (url: string) => {
      window.history.replaceState(null, "", url)
    },
  }),
  useSearchParams: () => searchParamsState.value,
}))

vi.mock("@/lib/client", () => ({
  useSession: () => ({ data: null, isPending: false }),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => (
    <div data-slot="select-stub">{children}</div>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}))

import { ProfileForm } from "./profile-form"
import { parseAuthParams } from "@/lib/lien-de-connexion"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let originalReplaceState: typeof window.history.replaceState
let originalPushState: typeof window.history.pushState

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/profil")
  searchParamsState.sync(window.location.search)
  updateProfileMock.mockReset()
  originalReplaceState = window.history.replaceState.bind(window.history)
  originalPushState = window.history.pushState.bind(window.history)
  const syncFromUrl = (url?: string | URL | null) => {
    searchParamsState.sync(
      new URL(url ?? window.location.href, window.location.origin).search
    )
  }
  window.history.replaceState = (data, unused, url) => {
    originalReplaceState(data, unused, url)
    syncFromUrl(url)
  }
  window.history.pushState = (data, unused, url) => {
    originalPushState(data, unused, url)
    syncFromUrl(url)
  }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  window.history.replaceState = originalReplaceState
  window.history.pushState = originalPushState
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
  const { dialog } = parseAuthParams(searchParamsState.value)
  return <div data-dialog={dialog ?? "none"} />
}

function profileHarness() {
  return (
    <AuthDialogsProvider>
      <Probe />
      <ProfileForm
        cities={[{ id: "42", name: "Casablanca", fee: 2500 }]}
        initialCityId=""
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

async function flushDeferredUrlSync() {
  await act(async () => {})
}

describe("ProfileForm", () => {
  it("opens the Connexion modal over /profil with ?next=/profil when the save is refused, leaving the path unchanged", async () => {
    updateProfileMock.mockResolvedValue({ unauthenticated: true })

    render(profileHarness())
    await act(async () => submitForm())
    await flushDeferredUrlSync()
    rerender(profileHarness())

    expect(updateProfileMock).toHaveBeenCalledTimes(1)
    const url = new URL(window.location.href)
    expect(url.pathname).toBe("/profil")
    expect(url.searchParams.get("open")).toBe("login")
    expect(url.searchParams.get("next")).toBe("/profil")
    expect(dialog()).toBe("login")
  })

  it("leaves the URL and dialogs untouched when the save goes through", async () => {
    updateProfileMock.mockResolvedValue({})

    render(profileHarness())
    await act(async () => submitForm())
    await flushDeferredUrlSync()

    expect(updateProfileMock).toHaveBeenCalledTimes(1)
    expect(updateProfileMock.mock.calls[0][1]).toBeInstanceOf(FormData)
    expect(new URL(window.location.href).search).toBe("")
    expect(dialog()).toBe("none")
  })
})
