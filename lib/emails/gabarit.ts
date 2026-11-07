import { etapeDe, ETAPES } from "@/lib/emails/etapes"
import { html, type HtmlSûr } from "@/lib/emails/html"
import {
  COULEUR_ACCENT,
  COULEUR_BORDURE,
  COULEUR_CARTE,
  COULEUR_FOND,
  COULEUR_TEXTE,
  COULEUR_TEXTE_ATTÉNUÉ,
  LARGEUR_CARTE,
  PILE_DE_POLICES,
} from "@/lib/emails/marque"
import { piedLettre } from "@/lib/emails/pied"
import { site } from "@/lib/site"
import type { OrderStatus } from "@/lib/statut-de-commande"

export { html, type HtmlSûr } from "@/lib/emails/html"

export interface LigneDeLettre {
  label: string
  value: string
  kind?: "detail" | "total"
  tone?: "offered" | "muted"
  note?: string
}

export type Bloc =
  | { type: "titre"; texte: string }
  | { type: "paragraphe"; texte: string }
  | { type: "lignes"; lignes: readonly LigneDeLettre[] }
  | { type: "encart"; titre?: string; texte?: string }
  | { type: "bouton"; libellé: string; url: string }
  | { type: "etapes"; statut: OrderStatus }
  | { type: "code"; code: string }

export interface Lettre {
  préEnTête: string
  noteEnTête?: string
  blocs: readonly Bloc[]
}

function blocTitre(texte: string): HtmlSûr {
  return html`<h1
    style="margin: 0 0 16px; font-family: ${PILE_DE_POLICES}; font-size: 24px; line-height: 32px; font-weight: 600; color: ${COULEUR_TEXTE};"
  >
    ${texte}
  </h1>`
}

function blocParagraphe(texte: string): HtmlSûr {
  return html`<p
    style="margin: 0 0 16px; font-family: ${PILE_DE_POLICES}; font-size: 15px; line-height: 24px; color: ${COULEUR_TEXTE};"
  >
    ${texte}
  </p>`
}

function styleValeurLigne(ligne: LigneDeLettre): string {
  const poids = ligne.kind === "total" ? " font-weight: 600;" : ""
  const couleur =
    ligne.tone === "offered"
      ? COULEUR_ACCENT
      : ligne.tone === "muted"
        ? COULEUR_TEXTE_ATTÉNUÉ
        : COULEUR_TEXTE
  return `padding: 6px 0; text-align: right; white-space: nowrap; color: ${couleur};${poids}`
}

function blocLignes(lignes: readonly LigneDeLettre[]): HtmlSûr {
  if (lignes.length === 0) return html``
  const lignesRendues = lignes.map(
    (ligne) =>
      html`<tr>
        <td
          style="padding: 6px 0; font-family: ${PILE_DE_POLICES}; font-size: 14px; line-height: 22px; color: ${COULEUR_TEXTE};"
        >
          ${ligne.label}
          ${
            ligne.note
              ? html`<span
                  style="display: block; font-size: 12px; line-height: 18px; color: ${COULEUR_TEXTE_ATTÉNUÉ};"
                  >${ligne.note}</span
                >`
              : html``
          }
        </td>
        <td
          style="font-family: ${PILE_DE_POLICES}; font-size: 14px; line-height: 22px; ${styleValeurLigne(ligne)}"
        >
          ${ligne.value}
        </td>
      </tr>`
  )
  return html`<table
    role="presentation"
    style="width: 100%; margin: 0 0 16px; border-collapse: collapse;"
  >
    <tbody>
      ${lignesRendues}
    </tbody>
  </table>`
}

function blocEncart(encart: { titre?: string; texte?: string }): HtmlSûr {
  if (!encart.titre && !encart.texte) return html``
  return html`<div
    style="margin: 0 0 20px; padding: 14px 16px; background: ${COULEUR_FOND}; border-left: 4px solid ${COULEUR_ACCENT}; border-radius: 8px; font-family: ${PILE_DE_POLICES};"
  >
    ${
      encart.titre
        ? html`<p
            style="margin: 0 0 4px; font-size: 15px; line-height: 22px; font-weight: 600; color: ${COULEUR_TEXTE};"
          >
            ${encart.titre}
          </p>`
        : html``
    }
    ${
      encart.texte
        ? html`<p
            style="margin: 0; font-size: 14px; line-height: 22px; color: ${COULEUR_TEXTE};"
          >
            ${encart.texte}
          </p>`
        : html``
    }
  </div>`
}

function blocBouton(bouton: { libellé: string; url: string }): HtmlSûr {
  return html`<div style="margin: 24px 0; text-align: center;">
    <a
      href="${bouton.url}"
      style="display: inline-block; padding: 12px 28px; border-radius: 999px; background: ${COULEUR_ACCENT}; color: ${COULEUR_CARTE}; font-family: ${PILE_DE_POLICES}; font-size: 15px; line-height: 20px; font-weight: 600; text-decoration: none;"
      >${bouton.libellé}</a
    >
  </div>`
}

function blocEtapes(statut: OrderStatus): HtmlSûr {
  const étape = etapeDe(statut)
  if (étape === "arrêté") return html``
  const cellules = ETAPES.map((libellé, index) => {
    const numéro = index + 1
    const atteinte = numéro === étape
    const franchie = numéro < étape
    const couleur =
      atteinte || franchie ? COULEUR_ACCENT : COULEUR_TEXTE_ATTÉNUÉ
    const poids = atteinte ? " font-weight: 600;" : ""
    return html`<td
      ${atteinte ? html`aria-current="step"` : html``}
      style="width: 25%; text-align: center; font-family: ${PILE_DE_POLICES}; font-size: 12px; line-height: 18px; color: ${couleur};${poids}"
    >
      ${libellé}
    </td>`
  })
  return html`<table
    role="presentation"
    style="width: 100%; margin: 0 0 24px; border-collapse: collapse; table-layout: fixed;"
  >
    <tbody>
      <tr>
        ${cellules}
      </tr>
    </tbody>
  </table>`
}

function blocCode(code: string): HtmlSûr {
  return html`<div
    style="margin: 0 0 24px; padding: 18px 12px; border-radius: 8px; background: ${COULEUR_FOND}; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 32px; line-height: 40px; font-weight: 600; letter-spacing: 8px; color: ${COULEUR_TEXTE};"
  >
    ${code}
  </div>`
}

function rendreBloc(bloc: Bloc): HtmlSûr {
  switch (bloc.type) {
    case "titre":
      return blocTitre(bloc.texte)
    case "paragraphe":
      return blocParagraphe(bloc.texte)
    case "lignes":
      return blocLignes(bloc.lignes)
    case "encart":
      return blocEncart(bloc)
    case "bouton":
      return blocBouton(bloc)
    case "etapes":
      return blocEtapes(bloc.statut)
    case "code":
      return blocCode(bloc.code)
  }
}

export function rendreLettre(lettre: Lettre): string {
  const blocTitreLettre = lettre.blocs.find((bloc) => bloc.type === "titre")
  const titre =
    blocTitreLettre?.type === "titre" ? blocTitreLettre.texte : lettre.préEnTête
  const préEnTête =
    lettre.préEnTête.trim() !== ""
      ? lettre.préEnTête
      : titre.trim() !== ""
        ? titre
        : site.legalName
  const noteEnTête = lettre.noteEnTête?.trim() ?? ""

  return html`<!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${titre}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .eguidar-carte {
              width: 100% !important;
            }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background: ${COULEUR_FOND};">
        <div
          style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; font-size: 1px;"
        >
          ${préEnTête}
        </div>
        <div style="padding: 24px 12px;">
          <div
            class="eguidar-carte"
            style="width: ${LARGEUR_CARTE}; max-width: 100%; margin: 0 auto; border: 1px solid ${COULEUR_BORDURE}; border-radius: 16px; background: ${COULEUR_CARTE}; font-family: ${PILE_DE_POLICES}; box-sizing: border-box;"
          >
            <div style="padding: 28px 32px 8px;">
              <div
                style="font-family: ${PILE_DE_POLICES}; font-size: 18px; line-height: 24px; font-weight: 600; color: ${COULEUR_TEXTE};"
              >
                ${site.legalName}
              </div>
              ${
                noteEnTête
                  ? html`<div
                      style="margin-top: 6px; font-family: ${PILE_DE_POLICES}; font-size: 13px; line-height: 20px; color: ${COULEUR_TEXTE_ATTÉNUÉ};"
                    >
                      ${noteEnTête}
                    </div>`
                  : html``
              }
            </div>
            <div style="padding: 8px 32px 32px;">
              ${lettre.blocs.map(rendreBloc)}
            </div>
          </div>
          ${piedLettre()}
        </div>
      </body>
    </html>`.html
}
