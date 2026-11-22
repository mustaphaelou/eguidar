import type { Metadata } from "next"

import { site } from "@/lib/site"

export const defaultShareImage = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
  alt: `${site.legalName} — ${site.tagline}`,
} as const

const LONGUEUR_EXTRAIT = 155

export function extraitDescription(description: string): string | undefined {
  const texte = description.replace(/\s+/g, " ").trim()
  if (texte.length === 0) return undefined
  if (texte.length <= LONGUEUR_EXTRAIT) return texte

  const tronque = texte.slice(0, LONGUEUR_EXTRAIT)
  const dernierEspace = tronque.lastIndexOf(" ")
  const debut = dernierEspace > 0 ? tronque.slice(0, dernierEspace) : tronque
  return `${debut.trimEnd()}…`
}

type PageMetadataInput = {
  title: string
  description?: string
  path: string
  images?: string[]
  noindex?: boolean
}

export function pageMetadata({
  title,
  description,
  path,
  images,
  noindex = false,
}: PageMetadataInput): Metadata {
  const avecDescription =
    description !== undefined && description.trim().length > 0

  return {
    title,
    ...(avecDescription ? { description } : {}),
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    ...(!noindex ? { alternates: { canonical: path } } : {}),
    openGraph: {
      title,
      ...(avecDescription ? { description } : {}),
      url: path,
      siteName: site.name,
      locale: "fr_MA",
      type: "website",
      images: images?.length ? images : [defaultShareImage],
    },
  }
}
