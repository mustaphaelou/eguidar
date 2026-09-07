import { renderToReadableStream } from "react-dom/server"
import { Suspense } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { AuthDialogsProvider } from "@/components/auth/auth-dialogs-context"
import { SignInStatus } from "./sign-in-status"

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
})
