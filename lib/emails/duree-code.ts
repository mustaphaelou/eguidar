export const DUREE_VIE_CODE_SECONDS = 5 * 60

function accorder(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre <= 1 ? singulier : pluriel}`
}

export function libelleDureeCode(secondes: number): string {
  const minutes = Math.floor(secondes / 60)
  const reste = secondes % 60
  const morceaux: string[] = []
  if (minutes > 0) morceaux.push(accorder(minutes, "minute", "minutes"))
  if (reste > 0 || minutes === 0) {
    morceaux.push(accorder(reste, "seconde", "secondes"))
  }
  return morceaux.join(" ")
}
