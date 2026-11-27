export const ANNONCE_MESSAGE_MAX_LENGTH = 160
export const ANNONCE_LIEN_LIBELLE_MAX_LENGTH = 40

export const RUBAN_ANNONCE_SURFACE =
  "border-b border-hairline bg-muted text-foreground"

export const RECETTE_TEXTE_ANNONCE =
  "text-[12px] leading-[1.3334] tracking-[-0.01em] sm:text-[13px]"

export const RUBAN_ANNONCE_CONTENU =
  "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-2.5 text-center"

export const LIEN_ANNONCE =
  "font-medium text-link underline decoration-1 underline-offset-2 hover:text-foreground active:opacity-70 motion-safe:transition-[color,opacity]"

export interface LienAnnonce {
  url: string
  libelle: string
}

export function apparierLienAnnonce(
  lienUrl: string | null | undefined,
  lienLibelle: string | null | undefined
): LienAnnonce | null {
  const url = lienUrl?.trim() ?? ""
  const libelle = lienLibelle?.trim() ?? ""
  if (url === "" || libelle === "") return null
  return { url, libelle }
}
