const VARIANTS = ["A", "B", "C"] as const

export type PrototypeVariant = (typeof VARIANTS)[number]

export const PROTOTYPE_VARIANT_NAMES: Record<PrototypeVariant, string> = {
  A: "Rythme classique",
  B: "Promos en duo",
  C: "Accent noir",
}

export function parsePrototypeVariant(
  value: string | null | undefined
): PrototypeVariant {
  return value === "A" || value === "B" || value === "C" ? value : "A"
}

export function stepPrototypeVariant(
  current: PrototypeVariant,
  delta: number
): PrototypeVariant {
  const index = VARIANTS.indexOf(current)
  return VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]
}
