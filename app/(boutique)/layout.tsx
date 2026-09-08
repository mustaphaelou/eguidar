import { AuthSessionLayer } from "@/components/auth/auth-session-layer"
import { StorefrontFooter } from "@/components/storefront/footer"
import { StorefrontHeader } from "@/components/storefront/header"
import { hasAppleOAuth, hasGoogleOAuth } from "@/lib/oauth-providers"

export default function BoutiqueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthSessionLayer hasGoogle={hasGoogleOAuth} hasApple={hasAppleOAuth}>
      <div className="flex min-h-svh flex-col">
        <StorefrontHeader />
        <main className="flex-1">{children}</main>
        <StorefrontFooter />
      </div>
    </AuthSessionLayer>
  )
}
