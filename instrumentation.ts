import { avertirConfigurationCritiqueManquante } from "@/lib/configuration-critique"

export function register() {
  avertirConfigurationCritiqueManquante()

  // La boucle des automatisations démarre avec le serveur — jamais pendant le
  // build, jamais sous Vitest, et jamais en l'attendant (ADR-0041).
  if (process.env.NODE_ENV !== "production") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  if (process.env.VITEST) return

  void import("@/lib/automations/file")
    .then(({ demarrerLesAutomations }) => demarrerLesAutomations())
    .catch((error) => {
      console.warn("[automations] démarrage impossible", error)
    })
}
