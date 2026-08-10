import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const signInUrl = new URL("/connexion", request.url)
    signInUrl.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/compte/:path*"],
}
