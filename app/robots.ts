import type { MetadataRoute } from "next"

import { site } from "@/lib/site"

/**
 * Cloudflare gère déjà un `robots.txt` : il préfixe le fichier de l'origine par
 * son bloc « Cloudflare Managed Content » dès que celui-ci répond 200. Cette
 * route lui en donne un, et y ajoute la directive `Sitemap:` qui manquait.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${site.url}/sitemap.xml`,
  }
}
