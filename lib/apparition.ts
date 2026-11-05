/**
 * Les classes vivent ici, hors du composant client, pour que les composants serveur les lisent :
 * un module `"use client"` ne laisse passer ni ses fonctions ni ses chaînes.
 */

/**
 * `translate` et non `transform` : les utilitaires `translate-*` de Tailwind v4 posent la
 * propriété `translate`, que `transform` n'anime pas.
 *
 * Aucun `starting:*` : une classe `starting:` compile en `@starting-style`, qui rend le
 * texte invisible au premier rendu. Chrome ne compte un élément comme LCP qu'une fois
 * peint : le fondu d'entrée du héros coûtait 900 ms de « element render delay » au LCP
 * mobile (rapport PageSpeed du 2026-11-05, §3). Les Panneaux sous la ligne de flottaison
 * gardent leur révélation au défilement, portée par `data-reveal-etat`, qui n'est jamais
 * `attente` avant l'hydratation.
 */
export const APPARITION = [
  "[transition:opacity_900ms_cubic-bezier(0.455,0.03,0.515,0.955),translate_700ms_cubic-bezier(0.455,0.03,0.515,0.955)]",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
  "group-data-[reveal-etat=attente]/panneau:translate-y-[30px]",
  "motion-reduce:transition-none",
].join(" ")

export const APPARITION_FONDU = [
  "[transition:opacity_900ms_cubic-bezier(0.455,0.03,0.515,0.955)]",
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

export function retard(index: number): string {
  return RETARDS[Math.min(index, RETARDS.length - 1)]!
}
