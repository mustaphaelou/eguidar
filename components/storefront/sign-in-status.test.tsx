// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { renderToReadableStream } from "react-dom/server"
import { Suspense } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const { getSession, signOut, push, refresh } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}))

vi.mock("@/lib/client", () => ({
  signOut,
  useSession: () => ({ data: null, isPending: false }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({ push, replace: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import { AuthDialogsProvider } from "@/components/auth/auth-dialogs-context"
import { SignInStatus } from "./sign-in-status"
import { SignOutButton } from "./sign-out-button"

function renderSignInStatus() {
  return renderToReadableStream(
    <AuthDialogsProvider>
      <Suspense fallback={null}>
        <SignInStatus />
      </Suspense>
    </AuthDialogsProvider>
  ).then((stream) => new Response(stream).text())
}

describe("SignInStatus", () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  it("renders a sign-in button when there is no session", async () => {
    getSession.mockResolvedValue(null)

    const html = await renderSignInStatus()

    expect(html).toContain('aria-label="Connexion"')
    expect(html).toContain("<button")
    expect(html).not.toContain('href="/connexion"')
    expect(html).not.toContain('href="/profil"')
    expect(html).not.toContain('aria-label="Déconnexion"')
  })

  it("renders a link to /profil when a session exists", async () => {
    getSession.mockResolvedValue({
      user: { name: "Ada Lovelace", email: "ada@example.com" },
      session: {},
    })

    const html = await renderSignInStatus()

    expect(html).toContain('href="/profil"')
    expect(html).toContain('aria-label="Mon profil"')
    expect(html).toContain('title="Ada Lovelace"')
  })

  it("renders a Déconnexion button next to the profile link when a session exists", async () => {
    getSession.mockResolvedValue({
      user: { name: "Ada Lovelace", email: "ada@example.com" },
      session: {},
    })

    const html = await renderSignInStatus()

    expect(html).toContain('aria-label="Déconnexion"')
    expect(html).toContain('href="/profil"')
  })
})

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  signOut.mockReset()
  push.mockReset()
  refresh.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function render(element: () => ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element()))
}

function signOutButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Déconnexion"]'
  )!
}

async function clickAndFlush(target: HTMLElement) {
  await act(async () => {
    target.click()
  })
  await act(async () => {})
}

describe("SignOutButton", () => {
  it("signs out, redirects to the home page and refreshes on click", async () => {
    signOut.mockResolvedValue(undefined)
    render(() => <SignOutButton />)

    await clickAndFlush(signOutButton())

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/")
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("navigates only after signOut has completed", async () => {
    let resolveSignOut: (() => void) | undefined
    signOut.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignOut = resolve
      })
    )
    render(() => <SignOutButton />)

    await act(async () => {
      signOutButton().click()
    })
    await act(async () => {})

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOutButton().disabled).toBe(true)
    expect(push).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      resolveSignOut?.()
    })
    await act(async () => {})

    expect(push).toHaveBeenCalledWith("/")
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(signOutButton().disabled).toBe(false)
  })
})
