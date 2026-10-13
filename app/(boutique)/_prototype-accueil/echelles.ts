/**
 * Prototype : les échelles et les champs d'un panneau.
 *
 * transcrites de `docs/research/apple-homepage.md` (§2.2 les deux échelles, §3 les champs,
 * §2.3 les boutons, §1.4 les hauteurs). Les valeurs y sont verbatim ; les noms de classes
 * Tailwind ne changent pas les nombres.
 *
 * Les media queries Tailwind ne sont pas celles d'Apple : `sm:` vaut 640 px là où la
 * feuille d'apple.com bascule à 735 px, `lg:` vaut 1024 px là où elle bascule à 1069 px.
 * L'écart est à trancher si cette structure est retenue.
 */

/** Échelle « hero » : 56 / 48 / 32, graisse 600. */
export const TITRE_HERO = [
  "text-[32px] leading-[1.125] tracking-[0.002em]",
  "sm:text-[48px] sm:leading-[1.0835] sm:tracking-[-0.002em]",
  "lg:text-[56px] lg:leading-[1.0714] lg:tracking-[-0.005em]",
].join(" ")

/** Échelle « hero » : sous-titre 28 / 24 / 19, graisse 400. */
export const SURTITRE_HERO = [
  "text-[19px] leading-[1.2105] tracking-[0.012em]",
  "sm:text-[24px] sm:leading-[1.1667] sm:tracking-[0.009em]",
  "lg:text-[28px] lg:leading-[1.1429] lg:tracking-[0.007em]",
].join(" ")

/** Échelle « promo » : 40 / 32, graisse 600. */
export const TITRE_PROMO = [
  "text-[32px] leading-[1.125] tracking-[0.002em]",
  "sm:text-[40px] sm:leading-[1.1]",
].join(" ")

/** Échelle « promo » : sous-titre 21 / 19. */
export const SURTITRE_PROMO = [
  "text-[19px] leading-[1.2105] tracking-[0.012em]",
  "sm:text-[21px] sm:leading-[1.1905] sm:tracking-[0.011em]",
].join(" ")

/** Le callout : 19 / 17 / 14. */
export const CALLOUT = [
  "text-[14px] leading-[1.2858] tracking-[-0.016em]",
  "sm:text-[17px] sm:leading-[1.2354] sm:tracking-[-0.022em]",
].join(" ")

/**
 * Les hauteurs de panneau sont des constantes, pas des ratios d'image (§1.4) :
 * hero 580 / 570 / 500, promo 580 / 490 / 500.
 */
export const HAUTEUR_HERO = "min-h-[500px] sm:min-h-[570px] lg:min-h-[580px]"
export const HAUTEUR_HERO_HAUT =
  "min-h-[500px] sm:min-h-[650px] lg:min-h-[692px]"
export const HAUTEUR_PROMO = "min-h-[500px] sm:min-h-[490px] lg:min-h-[580px]"

/**
 * Les champs : le blanc de la page, le gris du catalogue, et le noir comme accent (§3).
 * Le noir est celui du dépôt (`--foreground`, « presque noir ») et non le `#000` d'Apple.
 */
export const CHAMP = {
  blanc: {
    panneau: "bg-background",
    second: "text-muted-foreground",
    lien: "text-link",
    art: "border-foreground/15 bg-foreground/[0.03] text-muted-foreground",
  },
  muted: {
    panneau: "bg-muted",
    second: "text-muted-foreground",
    lien: "text-link",
    art: "border-foreground/15 bg-foreground/[0.03] text-muted-foreground",
  },
  noir: {
    panneau: "bg-foreground text-background",
    second: "text-background/70",
    lien: "text-[#2997ff]",
    art: "border-background/25 bg-background/[0.06] text-background/60",
  },
} as const

export type Champ = keyof typeof CHAMP

/** La gouttière d'apple.com : 12 px de fond de page entre les panneaux (§3). */
export const GOUTTIERE = "gap-3"
