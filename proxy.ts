import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

import { validateNextPath } from "@/lib/validate-next-path"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/connexion" || pathname === "/inscription") {
    const url = new URL("/", request.url)
    url.searchParams.set("open", pathname === "/connexion" ? "login" : "signup")
    const next = validateNextPath(request.nextUrl.searchParams.get("next"))
    if (next) url.searchParams.set("next", next)
    return NextResponse.redirect(url)
  }

  if (!getSessionCookie(request)) {
    const signInUrl = new URL("/connexion", request.url)
    signInUrl.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/compte/:path*", "/connexion", "/inscription"],
}
