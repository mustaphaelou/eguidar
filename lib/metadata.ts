import type { Metadata } from "next"

import { site } from "@/lib/site"

export const defaultShareImage = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
  alt: `${site.legalName} — ${site.tagline}`,
} as const

type PageMetadataInput = {
  title: string
  description: string
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
  return {
    title,
    description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    ...(!noindex ? { alternates: { canonical: path } } : {}),
    openGraph: {
      title,
      description,
      url: path,
      siteName: site.name,
      locale: "fr_MA",
      type: "website",
      images: images?.length ? images : [defaultShareImage],
    },
  }
}
