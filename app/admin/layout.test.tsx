import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { sessionCouranteMock, redirectMock } from "@/test/navigation-mocks"

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}))

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const h = await import("@/test/navigation-mocks")
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: h.sessionCouranteMock,
  }
})

vi.mock("@/components/layout/admin/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar-stub" />,
}))

vi.mock("@/components/layout/admin/site-header", () => ({
  SiteHeader: () => <div data-testid="site-header-stub" />,
}))

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-provider-stub">{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-inset-stub">{children}</div>
  ),
}))

vi.mock("@/components/auth/auth-dialogs", () => ({
  AuthDialogs: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-dialogs-stub">{children}</div>
  ),
}))

vi.mock("@/components/auth/session-inactive", () => ({
  SessionInactiveController: () => (
    <div data-testid="session-inactive-controller-stub" />
  ),
}))

import { resetCookieStoreMock } from "@/test/cookie-store"

import AdminLayout from "./layout"

function renderAdminLayout() {
  return renderToReadableStream(
    <AdminLayout>
      <div>Contenu administration</div>
    </AdminLayout>
  ).then((stream) => new Response(stream).text())
}

describe("AdminLayout", () => {
  beforeEach(() => {
    resetCookieStoreMock()
    sessionCouranteMock.mockReset()
    redirectMock.mockClear()
  })

  it("mounts the Session inactive controller and the AuthDialogs around the authenticated admin shell", async () => {
    sessionCouranteMock.mockResolvedValue({
      id: "admin-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "admin",
    })

    const html = await renderAdminLayout()

    expect(html).toContain('data-testid="session-inactive-controller-stub"')
    expect(html).toContain('data-testid="auth-dialogs-stub"')
    expect(html).toContain("Contenu administration")
    expect(html).toContain('data-testid="app-sidebar-stub"')
    expect(html).toContain('data-testid="site-header-stub"')
  })

  it("redirects an unauthenticated visitor to the Connexion modal with /admin as Destination post-connexion", async () => {
    sessionCouranteMock.mockResolvedValue(null)

    try {
      await renderAdminLayout()
    } catch {}

    expect(redirectMock).toHaveBeenCalledWith("/?open=login&next=%2Fadmin")
  })
})
