import { beforeEach, describe, expect, it, vi } from "vitest"

import { portAuthentificationClient } from "./port-authentification-client"

const client = vi.hoisted(() => ({
  connexion: vi.fn(),
  inscription: vi.fn(),
  sociale: vi.fn(),
  envoi: vi.fn(),
  verification: vi.fn(),
}))

vi.mock("@/lib/client", () => ({
  authClient: {
    signIn: { email: client.connexion, social: client.sociale },
    signUp: { email: client.inscription },
    emailOtp: {
      sendVerificationOtp: client.envoi,
      verifyEmail: client.verification,
    },
  },
}))

describe("le port d'authentification par défaut", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("traduit le statut du limiteur en code et garde la forme du port (code, message)", async () => {
    client.connexion.mockResolvedValue({
      data: null,
      error: {
        message: "Too many requests. Please try again later.",
        status: 429,
        statusText: "Too Many Requests",
      },
    })

    await expect(
      portAuthentificationClient.connexionParMotDePasse({
        email: "jane@example.com",
        motDePasse: "MotDePasse!12345",
      })
    ).resolves.toEqual({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: "Too many requests. Please try again later.",
      },
    })
  })

  it("garde le code et le message du refus tels que le port les declare", async () => {
    client.inscription.mockResolvedValue({
      data: null,
      error: {
        code: "PASSWORD_COMPROMISED",
        message:
          "The password you entered has been compromised. Please choose a different password.",
        status: 400,
        statusText: "Bad Request",
      },
    })

    await expect(
      portAuthentificationClient.inscription({
        nom: "Jane Doe",
        email: "jane@example.com",
        motDePasse: "MotDePasse!12345",
      })
    ).resolves.toEqual({
      error: {
        code: "PASSWORD_COMPROMISED",
        message:
          "The password you entered has been compromised. Please choose a different password.",
      },
    })
  })

  it("ne rend aucun refus quand la bibliothèque n'en signale pas", async () => {
    client.connexion.mockResolvedValue({ data: {}, error: null })

    await expect(
      portAuthentificationClient.connexionParMotDePasse({
        email: "jane@example.com",
        motDePasse: "MotDePasse!12345",
      })
    ).resolves.toEqual({ error: null })
  })
})
