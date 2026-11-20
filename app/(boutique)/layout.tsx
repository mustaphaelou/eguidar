import { AuthSessionLayer } from "@/components/auth/auth-session-layer"
import { StorefrontFooter } from "@/components/storefront/footer"
import { StorefrontHeader } from "@/components/storefront/header"
import { hasFacebookOAuth, hasGoogleOAuth } from "@/lib/oauth-providers"
import { getNavCategories } from "@/lib/use-cases/storefront"

export default async function BoutiqueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const structures = await getNavCategories()

  return (
    <AuthSessionLayer hasGoogle={hasGoogleOAuth} hasFacebook={hasFacebookOAuth}>
      <div className="flex min-h-svh flex-col">
        <StorefrontHeader />
        <main className="flex-1">{children}</main>
        <StorefrontFooter structures={structures} />
      </div>
    </AuthSessionLayer>
  )
}
