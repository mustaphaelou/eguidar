const OPEN_PARAM = "open"
const NEXT_PARAM = "next"

const URL_BASE = "http://localhost"

export type AuthDialogName = "login" | "signup"

export interface AuthParams {
  dialog: AuthDialogName | null
  next: string | null
}

export interface AuthParamsOptions {
  dialog?: AuthDialogName
  next?: string
}

function safeDestination(raw: string | null | undefined): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null
}

function rewriteSearchParams(
  url: string,
  rewrite: (params: URLSearchParams) => void
): string {
  const parsed = new URL(url, URL_BASE)
  rewrite(parsed.searchParams)
  const search = parsed.searchParams.toString()
  return `${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`
}

function authDialogUrl(dialog: AuthDialogName, next?: string): string {
  return rewriteSearchParams("/", (params) => {
    params.set(OPEN_PARAM, dialog)
    const destination = safeDestination(next)
    if (destination) params.set(NEXT_PARAM, destination)
  })
}

export function loginUrl(next?: string): string {
  return authDialogUrl("login", next)
}

export function signupUrl(next?: string): string {
  return authDialogUrl("signup", next)
}

export function parseAuthParams(search: string | URLSearchParams): AuthParams {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search
  const open = params.get(OPEN_PARAM)
  const dialog: AuthDialogName | null =
    open === "login" || open === "signup" ? open : null
  return { dialog, next: safeDestination(params.get(NEXT_PARAM)) }
}

export function withAuthParams(
  url: string,
  options: AuthParamsOptions
): string {
  return rewriteSearchParams(url, (params) => {
    if (options.dialog) params.set(OPEN_PARAM, options.dialog)
    if (options.next !== undefined) {
      const destination = safeDestination(options.next)
      if (destination) params.set(NEXT_PARAM, destination)
      else params.delete(NEXT_PARAM)
    }
  })
}

export function withoutAuthParams(url: string): string {
  return rewriteSearchParams(url, (params) => {
    params.delete(OPEN_PARAM)
  })
}

export function urlWouldChange(updated: string | URL, current: string | URL) {
  const next = new URL(updated, URL_BASE)
  const before = new URL(current, URL_BASE)
  return (
    next.pathname !== before.pathname ||
    next.hash !== before.hash ||
    next.searchParams.toString() !== before.searchParams.toString()
  )
}
