import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { AppSidebar } from "@/components/layout/admin/app-sidebar"
import { SiteHeader } from "@/components/layout/admin/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AuthSessionLayer } from "@/components/auth/auth-session-layer"
import { loginUrl } from "@/lib/lien-de-connexion"
import { hasFacebookOAuth, hasGoogleOAuth } from "@/lib/oauth-providers"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: {
    default: "Administration",
    template: `%s — Administration — ${site.name}`,
  },
  robots: { index: false, follow: false },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="min-h-svh" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  )
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const client = await lireSession()
  if (!estAdmin(client)) redirect(loginUrl("/admin"))

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <AuthSessionLayer hasGoogle={hasGoogleOAuth} hasFacebook={hasFacebookOAuth}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <a
          href="#contenu-admin"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring focus:outline-none"
        >
          Aller au contenu
        </a>
        <AppSidebar userName={client.name ?? ""} userEmail={client.email} />
        <SidebarInset className="@container/content">
          <SiteHeader userName={client.name ?? ""} userEmail={client.email} />
          <main
            id="contenu-admin"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthSessionLayer>
  )
}
