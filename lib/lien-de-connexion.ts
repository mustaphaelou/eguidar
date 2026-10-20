const OPEN_PARAM = "open"
const NEXT_PARAM = "next"

const URL_BASE = "http://localhost"

const UNSAFE_DESTINATION_CHARS = /[\\\u0000-\u001f\u007f]/
const PERCENT_ESCAPE = /%([0-9a-f]{2})/gi

export type AuthDialogName = "login" | "signup"

export interface AuthParams {
  open: string | null
  dialog: AuthDialogName | null
  next: string | null
}

export interface AuthParamsOptions {
  dialog?: AuthDialogName
  next?: string
}

function decodePercentEscapes(value: string): string {
  return value.replace(PERCENT_ESCAPE, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  )
}

function safeDestination(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null
  const decoded = decodePercentEscapes(raw)
  if (decoded.startsWith("//") || UNSAFE_DESTINATION_CHARS.test(decoded)) {
    return null
  }
  return raw
}

function deleteAuthParams(params: URLSearchParams): void {
  params.delete(OPEN_PARAM)
  params.delete(NEXT_PARAM)
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

export function loginUrl(next?: string): string {
  return withAuthParams("/", { dialog: "login", next })
}

export function signupUrl(next?: string): string {
  return withAuthParams("/", { dialog: "signup", next })
}

export function parseAuthParams(search: string | URLSearchParams): AuthParams {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search
  const open = params.get(OPEN_PARAM)
  const dialog: AuthDialogName | null =
    open === "login" || open === "signup" ? open : null
  return { open, dialog, next: safeDestination(params.get(NEXT_PARAM)) }
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

export function withoutAuthSearchParams(
  search: string | URLSearchParams
): string {
  if (search === "") return ""
  if (typeof search === "string" && !search.startsWith("?")) {
    return rewriteSearchParams(search, deleteAuthParams)
  }
  const params = new URLSearchParams(search)
  deleteAuthParams(params)
  const cleaned = params.toString()
  return cleaned ? `?${cleaned}` : ""
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
