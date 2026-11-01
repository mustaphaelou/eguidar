import { hashPassword } from "better-auth/crypto"
import { describe, expect, it } from "vitest"

import {
  PARAMETRES_SCRYPT,
  hacherMotDePasse,
  motDePasseDoitEtreRehache,
  verifierMotDePasse,
} from "@/lib/mot-de-passe-hache"
const MOT_DE_PASSE = "MotDePasse!1234"

describe("Hachage des mots de passe — format auto-descriptif", () => {
  it("écrit un PHC scrypt qui porte ses paramètres et vérifie le mot de passe", async () => {
    const hash = await hacherMotDePasse(MOT_DE_PASSE)

    expect(hash).toMatch(
      new RegExp(
        `^\\$scrypt\\$N=${PARAMETRES_SCRYPT.N},r=${PARAMETRES_SCRYPT.r},p=${PARAMETRES_SCRYPT.p}\\$[A-Za-z0-9_-]+\\$[A-Za-z0-9_-]+$`
      )
    )
    await expect(
      verifierMotDePasse({ hash, password: MOT_DE_PASSE })
    ).resolves.toBe(true)
    await expect(
      verifierMotDePasse({ hash, password: "MauvaisMotDePasse!1" })
    ).resolves.toBe(false)
  })

  it("tire un sel neuf à chaque hachage", async () => {
    const premier = await hacherMotDePasse(MOT_DE_PASSE)
    const second = await hacherMotDePasse(MOT_DE_PASSE)

    expect(premier).not.toBe(second)
    await expect(
      verifierMotDePasse({ hash: premier, password: MOT_DE_PASSE })
    ).resolves.toBe(true)
    await expect(
      verifierMotDePasse({ hash: second, password: MOT_DE_PASSE })
    ).resolves.toBe(true)
  })

  it("accepte l'ancien format salt:hex produit par la bibliothèque et le juge à rehacher", async () => {
    const ancien = await hashPassword(MOT_DE_PASSE)

    expect(ancien).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    await expect(
      verifierMotDePasse({ hash: ancien, password: MOT_DE_PASSE })
    ).resolves.toBe(true)
    await expect(
      verifierMotDePasse({ hash: ancien, password: "MauvaisMotDePasse!1" })
    ).resolves.toBe(false)
    expect(motDePasseDoitEtreRehache(ancien)).toBe(true)
  })

  it("juge à rehacher un PHC dont les paramètres sont sous la cible", () => {
    const sousLaCible = `$scrypt$N=16384,r=8,p=1$c2Vs$aGFjaGU`

    expect(motDePasseDoitEtreRehache(sousLaCible)).toBe(true)
  })

  it("ne rehashe pas un hash déjà à la cible", async () => {
    const hash = await hacherMotDePasse(MOT_DE_PASSE)

    expect(motDePasseDoitEtreRehache(hash)).toBe(false)
  })

  it("refuse un hash malformé sans lever", async () => {
    for (const hash of [
      "",
      "pas-un-hash",
      "$scrypt$N=abc,r=8,p=1$c2Vs$aGFjaGU",
      "$scrypt$N=16384,r=8,p=1$c2Vs",
      "c2Vs:zz",
      `$scrypt$N=1048576,r=32,p=1$c2Vs$aGFjaGU`,
      "$scrypt$N=131072,r=8,p=99$c2Vs$aGFjaGU",
      "a".repeat(2000) + ":00",
    ]) {
      await expect(
        verifierMotDePasse({ hash, password: MOT_DE_PASSE })
      ).resolves.toBe(false)
      expect(motDePasseDoitEtreRehache(hash)).toBe(false)
    }
  })
})
