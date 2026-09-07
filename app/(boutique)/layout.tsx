import { AuthSessionLayer } from "@/components/auth/auth-session-layer"
import { StorefrontFooter } from "@/components/storefront/footer"
import { StorefrontHeader } from "@/components/storefront/header"

export default function BoutiqueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthSessionLayer>
      <div className="flex min-h-svh flex-col">
        <StorefrontHeader />
        <main className="flex-1">{children}</main>
        <StorefrontFooter />
      </div>
    </AuthSessionLayer>
  )
}
