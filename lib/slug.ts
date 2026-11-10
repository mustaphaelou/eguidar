/**
 * La grammaire d'un slug : des minuscules ASCII, des chiffres et des tirets
 * simples, jamais en tête ni en fin, jamais doublés. C'est le seul propriétaire
 * de cette expression, pour que le contrat d'import comme la Structure la
 * lisent au même endroit.
 */
export const GRAMMAIRE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
