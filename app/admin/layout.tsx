import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { AppSidebar } from "@/components/layout/admin/app-sidebar"
import { SiteHeader } from "@/components/layout/admin/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AuthSessionLayer } from "@/components/auth/auth-session-layer"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"
import { loginUrl } from "@/lib/lien-de-connexion"
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
  const session = await getAdminSession()
  if (!session) redirect(loginUrl("/admin"))

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <AuthSessionLayer>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          userName={session.user.name ?? ""}
          userEmail={session.user.email}
        />
        <SidebarInset className="@container/content">
          <SiteHeader
            userName={session.user.name ?? ""}
            userEmail={session.user.email}
          />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthSessionLayer>
  )
}
