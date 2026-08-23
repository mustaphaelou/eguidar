import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

import { loginUrl, signupUrl } from "@/lib/lien-de-connexion"

const LEGACY_DIALOG_PATHS = {
  "/connexion": loginUrl,
  "/inscription": signupUrl,
} as const

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const legacyBuilder =
    LEGACY_DIALOG_PATHS[pathname as keyof typeof LEGACY_DIALOG_PATHS]
  if (legacyBuilder) {
    return NextResponse.redirect(
      new URL(
        legacyBuilder(request.nextUrl.searchParams.get("next") ?? undefined),
        request.url
      )
    )
  }

  if (!getSessionCookie(request)) {
    return NextResponse.redirect(
      new URL(
        loginUrl(request.nextUrl.pathname + request.nextUrl.search),
        request.url
      )
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/compte/:path*", "/connexion", "/inscription"],
}
