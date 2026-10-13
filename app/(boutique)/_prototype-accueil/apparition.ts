/**
 * Prototype : les classes de l'apparition, séparées du composant client pour que les
 * composants serveur puissent les lire (`retard()` est une fonction : un module `"use client"`
 * ne la laisse pas passer la frontière).
 *
 * Le vocabulaire est celui de `StaggeredFadeIn` (`apple-product-page-ui.md` §9.2) : opacité
 * 0 → 1 en 0,9 s, montée de 30 px en 0,7 s, même courbe, 0,15 s par item.
 */

/**
 * L'item : fondu 0,9 s + montée 0,7 s, 30 px, sur `easeInOutQuad`.
 * `starting:` joue l'entrée au chargement ; `group-data-[reveal-etat=attente]/panneau:`
 * porte l'état d'attente des panneaux que l'observateur surveille.
 */
export const APPARITION = [
  "[transition:opacity_900ms_cubic-bezier(0.455,0.03,0.515,0.955),translate_700ms_cubic-bezier(0.455,0.03,0.515,0.955)]",
  "starting:opacity-0",
  "starting:translate-y-[30px]",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
  "group-data-[reveal-etat=attente]/panneau:translate-y-[30px]",
  "motion-reduce:transition-none",
].join(" ")

/** L'art : même fondu, sans la montée — l'équivalent de `data-staggered-item-no-translate`. */
export const APPARITION_FONDU = [
  "[transition:opacity_900ms_cubic-bezier(0.455,0.03,0.515,0.955)]",
  "starting:opacity-0",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
  "motion-reduce:transition-none",
].join(" ")

/** 0,15 s par index — les littéraux sont écrits en clair, Tailwind les lit. */
export const RETARDS = [
  "delay-0",
  "delay-[150ms]",
  "delay-[300ms]",
  "delay-[450ms]",
  "delay-[600ms]",
  "delay-[750ms]",
] as const

export function retard(index: number): string {
  return RETARDS[Math.min(index, RETARDS.length - 1)]!
}
