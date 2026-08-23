import { urlWouldChange } from "@/lib/lien-de-connexion"

export function replaceUrl(rewrite: (current: URL) => string) {
  const current = new URL(window.location.href)
  const updated = rewrite(current)
  if (urlWouldChange(updated, current)) {
    window.history.replaceState(null, "", updated)
  }
}
