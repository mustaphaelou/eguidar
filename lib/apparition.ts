export const APPARITION = [
  "transition-opacity duration-300 ease-out",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
  "motion-safe:transition-[opacity,translate] motion-safe:duration-[420ms] motion-safe:ease-out",
  "motion-safe:group-data-[reveal-etat=attente]/panneau:translate-y-4",
].join(" ")

export const APPARITION_FONDU = [
  "transition-opacity duration-[420ms] ease-out",
  "group-data-[reveal-etat=attente]/panneau:opacity-0",
].join(" ")

export const RETARDS = [
  "delay-0",
  "delay-[50ms]",
  "delay-[100ms]",
  "delay-[150ms]",
  "delay-[200ms]",
  "delay-[250ms]",
] as const

export function retard(index: number): string {
  return RETARDS[Math.min(index, RETARDS.length - 1)]!
}
