import "server-only"

import { prisma } from "@/lib/db"
import {
  hacherMotDePasse,
  motDePasseDoitEtreRehache,
  verifierMotDePasse,
} from "@/lib/mot-de-passe-hache"

/**
 * Vérifie le mot de passe et, si l'empreinte stockée est plus faible que la
 * cible, la réécrit en PHC sans interrompre la Connexion. C'est la migration :
 * chaque Connexion réussie amène un Compte client de plus au format courant,
 * sans lot ni remise à zéro.
 */
export async function verifierMotDePasseEtRehacher({
  hash,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  if (!(await verifierMotDePasse({ hash, password }))) return false
  if (!motDePasseDoitEtreRehache(hash)) return true

  try {
    const compte = await prisma.account.findFirst({
      where: { providerId: "credential", password: hash },
      select: { id: true },
    })
    if (!compte) return true

    const nouveau = await hacherMotDePasse(password)
    await prisma.account.update({
      where: { id: compte.id },
      data: { password: nouveau },
    })
  } catch (erreur) {
    // Une migration opportuniste qui échoue ne doit pas fermer la Connexion.
    console.error(
      "[auth] rehachage du mot de passe impossible",
      erreur instanceof Error ? erreur.message : "erreur inconnue"
    )
  }

  return true
}
