/**
 * L'apparition des panneaux de l'accueil.
 *
 * Le vocabulaire est celui de `StaggeredFadeIn`, le composant de la page produit d'apple.com
 * relevé dans `docs/research/apple-product-page-ui.md` §9.2 : un item passe de l'opacité 0 à 1
 * en 0,9 s et monte de 30 px en 0,7 s, même courbe pour les deux, décalé de 0,15 s par index.
 * Le déclencheur d'apple.com (`t - 85vh`) devient un `IntersectionObserver` qui coupe les 15 %
 * du bas de la fenêtre.
 *
 * Les classes vivent ici, hors du composant client, pour que les composants serveur les lisent :
 * un module `"use client"` ne laisse passer ni ses fonctions ni ses chaînes.
 */

/**
 * L'item qui entre : fondu 0,9 s, montée 0,7 s de 30 px, sur `easeInOutQuad`.
 * `starting:` joue l'entrée au chargement ; `group-data-[reveal-etat=attente]/panneau:`
 * porte l'état d'attente des panneaux que l'observateur surveille.
 *
 * `translate` et non `transform` : les utilitaires `translate-*` de Tailwind v4 posent la
 * propriété `translate`, que `transform` n'anime pas.
 */
export const APPARITION = [
  "[transition:opacity_900ms_cubic-bezier(0.455,0.03,0.515,0.955),translate_700ms_cubic-bezier(0.455,0.03,0.515,0.955)]",
  "starting:opacity-0",
  "starting:translate-y-[30px]",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
  "group-data-[reveal-etat=attente]/panneau:translate-y-[30px]",
  "motion-reduce:transition-none",
].join(" ")

/** L'art qui entre : le même fondu, sans la montée — `data-staggered-item-no-translate`. */
export const APPARITION_FONDU = [
  "[transition:opacity_900ms_cubic-bezier(0.455,0.03,0.515,0.955)]",
  "starting:opacity-0",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
  "motion-reduce:transition-none",
].join(" ")

/** 0,15 s par index, écrit en clair pour que Tailwind lise les littéraux. */
export const RETARDS = [
  "delay-0",
  "delay-[150ms]",
  "delay-[300ms]",
  "delay-[450ms]",
  "delay-[600ms]",
  "delay-[750ms]",
] as const

/** Le retard d'un item : 0,15 s par index, plafonné à la dernière marche. */
export function retard(index: number): string {
  return RETARDS[Math.min(index, RETARDS.length - 1)]!
}
