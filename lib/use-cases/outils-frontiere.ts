import { readFileSync } from "node:fs"

/**
 * Aides partagées des gardes de frontière client/serveur.
 *
 * `lire` résout un chemin relatif contre l'`import.meta.url` du fichier
 * de test appelant — chaque suite garde ainsi ses chemins relatifs à son
 * propre dossier ; `importeDe` détecte un import ou un réexport statique
 * d'un module nommé dans une source.
 */
export function lire(depuis: string, relatif: string): string {
  return readFileSync(new URL(relatif, depuis), "utf8")
}

export function importeDe(source: string, module: string): boolean {
  return new RegExp(
    `(?:import|export)[^;]*from\\s*["'][^"']*${module}["']`
  ).test(source)
}
