import { html, type HtmlSûr } from "@/lib/emails/html"
import {
  COULEUR_TEXTE_ATTÉNUÉ,
  LARGEUR_CARTE,
  PILE_DE_POLICES,
} from "@/lib/emails/marque"
import { site, staticPages } from "@/lib/site"

export const RAISON_DE_RECEPTION =
  "Vous recevez cet e-mail parce que vous avez une Commande ou un Compte client sur Eguidar."

export function urlAbsolue(chemin: string): string {
  return `${site.url}${chemin}`
}

export function piedLettre(): HtmlSûr {
  const liens = staticPages.map(
    ({ href, label }) =>
      html`<a
          href="${urlAbsolue(href)}"
          style="color: ${COULEUR_TEXTE_ATTÉNUÉ}; text-decoration: underline;"
          >${label}</a
        ><br />`
  )
  return html`<div
    style="max-width: ${LARGEUR_CARTE}; margin: 16px auto 0; padding: 0 20px; text-align: center; font-family: ${PILE_DE_POLICES}; font-size: 12px; line-height: 20px; color: ${COULEUR_TEXTE_ATTÉNUÉ};"
  >
    <p style="margin: 0 0 8px; font-weight: 600;">${site.legalName}</p>
    <p style="margin: 0 0 8px;">${RAISON_DE_RECEPTION}</p>
    <p style="margin: 0 0 8px;">${liens}</p>
    <p style="margin: 0;">
      Écrivez-nous :
      <a
        href="mailto:${site.contactEmail}"
        style="color: ${COULEUR_TEXTE_ATTÉNUÉ}; text-decoration: underline;"
        >${site.contactEmail}</a
      >
    </p>
  </div>`
}

export function lignesPiedTexte(): string[] {
  return [
    RAISON_DE_RECEPTION,
    ...staticPages.map(({ href, label }) => `${label} : ${urlAbsolue(href)}`),
    `Écrivez-nous : ${site.contactEmail}`,
  ]
}
