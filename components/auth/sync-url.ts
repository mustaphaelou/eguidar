import {
  parseAuthParams,
  urlWouldChange,
  withAuthParams,
  withoutAuthParams,
} from "@/lib/lien-de-connexion"

function pageAddressWithoutAuthParams(url: URL): string {
  const addressWithoutNext = withAuthParams(`${url.pathname}${url.search}`, {
    next: "",
  })
  return withoutAuthParams(addressWithoutNext)
}

export function replaceUrl(rewrite: (current: URL) => string) {
  const current = new URL(window.location.href)
  const updated = rewrite(current)
  if (urlWouldChange(updated, current)) {
    window.history.replaceState(null, "", updated)
  }
}

export function syncLoginUrl() {
  const { next } = parseAuthParams(window.location.search)
  replaceUrl((current) => {
    const destination = next ?? pageAddressWithoutAuthParams(current)
    return withAuthParams(current.href, { dialog: "login", next: destination })
  })
}
