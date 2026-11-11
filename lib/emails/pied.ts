import { html, type HtmlSûr } from "@/lib/emails/html"
import {
  COULEUR_BORDURE,
  COULEUR_BLANC,
  COULEUR_FILET,
  COULEUR_TEXTE,
  COULEUR_TEXTE_ATTÉNUÉ,
  LARGEUR_LETTRE,
  MOT_SYMBOLE,
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
    ({ href, label }, index) =>
      html`${
          index > 0
            ? html`<span style="color: ${COULEUR_BORDURE};"> · </span>`
            : html``
        }<a
          href="${urlAbsolue(href)}"
          style="color: ${COULEUR_TEXTE_ATTÉNUÉ}; text-decoration: underline;"
          >${label}</a
        >`
  )
  return html`<table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    width="100%"
    bgcolor="${COULEUR_BLANC}"
    style="width: 100%; border-collapse: collapse; background: ${COULEUR_BLANC};"
  >
    <tbody>
      <tr>
        <td align="center" style="padding: 0;">
          <table
            role="presentation"
            cellpadding="0"
            cellspacing="0"
            width="${LARGEUR_LETTRE}"
            class="eguidar-contenu"
            style="width: 100%; max-width: ${LARGEUR_LETTRE}; border-collapse: collapse;"
          >
            <tbody>
              <tr>
                <td
                  class="eguidar-pied"
                  style="border-top: 1px solid ${COULEUR_FILET}; padding: 28px 48px 44px; text-align: center; font-family: ${PILE_DE_POLICES}; font-size: 12px; line-height: 20px; color: ${COULEUR_TEXTE_ATTÉNUÉ};"
                >
                  <p
                    style="margin: 0 0 8px; font-size: 14px; line-height: 20px; font-weight: 600; letter-spacing: -0.02em; color: ${COULEUR_TEXTE};"
                  >
                    ${MOT_SYMBOLE}
                  </p>
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
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>`
}

export function lignesPiedTexte(): string[] {
  return [
    RAISON_DE_RECEPTION,
    ...staticPages.map(({ href, label }) => `${label} : ${urlAbsolue(href)}`),
    `Écrivez-nous : ${site.contactEmail}`,
  ]
}
