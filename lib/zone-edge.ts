import { site } from "@/lib/site"

export const HOTE_EDGE = new URL(site.url).hostname

export function urlEdge(chemin: string): string {
  return new URL(
    chemin.startsWith("/") ? chemin : `/${chemin}`,
    site.url
  ).toString()
}
