import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { RACINE } from "./artefact"
import {
  adresseDeConnexion,
  adresseDeLaSession,
  DOSSIER_DE_SESSION,
  FICHIER_DE_SESSION,
  identifiantsDeLaSonde,
} from "./session"

describe("l'état de session de la sonde", () => {
  it("vit dans e2e/.auth, sous un nom fixe et ignoré par git", () => {
    expect(DOSSIER_DE_SESSION).toBe(path.join(RACINE, "e2e", ".auth"))
    expect(FICHIER_DE_SESSION).toBe(
      path.join(DOSSIER_DE_SESSION, "session-courante.json")
    )
    expect(readFileSync(path.join(RACINE, ".gitignore"), "utf8")).toMatch(
      /^e2e\/\.auth\/$/m
    )
  })

  it("vise l'endpoint de connexion et celui de la Session de l'application", () => {
    expect(adresseDeConnexion("http://127.0.0.1:3100")).toBe(
      "http://127.0.0.1:3100/api/auth/sign-in/email"
    )
    expect(adresseDeLaSession("http://127.0.0.1:3100/")).toBe(
      "http://127.0.0.1:3100/api/auth/get-session"
    )
  })

  it("lit les identifiants du compte administrateur semé, et refuse l'absence", () => {
    expect(
      identifiantsDeLaSonde({
        ADMIN_EMAIL: "  admin@eguidar.test  ",
        ADMIN_PASSWORD: "secret-du-compte",
      })
    ).toEqual({ email: "admin@eguidar.test", motDePasse: "secret-du-compte" })

    expect(() => identifiantsDeLaSonde({ ADMIN_EMAIL: "a@b.test" })).toThrow(
      /ADMIN_PASSWORD/
    )
    expect(() => identifiantsDeLaSonde({})).toThrow(/ADMIN_EMAIL/)
  })
})
