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
