import { isIP } from "node:net"

export const ADRESSE_CLIENT_PARTAGEE = "client-partage"

/**
 * Les en-têtes qui peuvent nommer l'adresse du Client, dans l'ordre de
 * préférence : Cloudflare pose `cf-connecting-ip`, un proxy peut poser
 * `x-real-ip`, et `x-forwarded-for` porte une chaîne dont le premier relais est
 * forgeable.
 */
export const ORDRE_ENTETES_ADRESSE_CLIENT = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const

export interface EntetesRequete {
  get(nom: string): string | null
}

/**
 * Les plages des proxies qui peuvent précéder l'origine : le bord Cloudflare
 * (https://www.cloudflare.com/ips-v4 et https://www.cloudflare.com/ips-v6,
 * relevées le 29 octobre 2026), puis les plages privées et de boucle d'un proxy
 * d'hébergement (Coolify). Better Auth remonte une chaîne `x-forwarded-for` de
 * droite à gauche et retient le premier relais qui n'appartient pas à ces plages.
 */
export const PROXIES_DE_CONFIANCE = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "::1/128",
] as const

export function adresseClient(entetes: EntetesRequete): string {
  for (const nom of ORDRE_ENTETES_ADRESSE_CLIENT) {
    const valeur = entetes.get(nom)
    if (!valeur) continue
    const candidat =
      nom === "x-forwarded-for"
        ? valeur.split(",").at(-1)?.trim()
        : valeur.trim()
    if (candidat && isIP(candidat) !== 0) return candidat
  }
  return ADRESSE_CLIENT_PARTAGEE
}
