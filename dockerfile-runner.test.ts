import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

type Instruction = { commande: string; arguments: string }

type Etape = { nom: string; instructions: Instruction[] }

const DOCKERFILE = path.join(import.meta.dirname, "Dockerfile")

function instructionsDuFichier(): Instruction[] {
  return readFileSync(DOCKERFILE, "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"))
    .map((ligne) => {
      const [commande = "", ...reste] = ligne.split(/\s+/)
      return { commande: commande.toUpperCase(), arguments: reste.join(" ") }
    })
}

function etapesDuFichier(): Etape[] {
  const etapes: Etape[] = []
  for (const instruction of instructionsDuFichier()) {
    if (instruction.commande !== "FROM") {
      etapes.at(-1)?.instructions.push(instruction)
      continue
    }
    const nom = /\bAS\s+(\S+)$/i.exec(instruction.arguments)?.[1]
    if (nom === undefined) {
      throw new Error(`FROM sans nom d'étape : ${instruction.arguments}`)
    }
    etapes.push({ nom, instructions: [] })
  }
  return etapes
}

function etape(nom: string): Etape {
  const trouvee = etapesDuFichier().find((etape) => etape.nom === nom)
  if (trouvee === undefined) {
    throw new Error(`le Dockerfile ne définit aucune étape « ${nom} »`)
  }
  return trouvee
}

function indexDe(etape: Etape, commande: string): number {
  return etape.instructions.findIndex(
    (instruction) => instruction.commande === commande
  )
}

describe("l'image de l'application tourne sous un utilisateur non-root", () => {
  it("garde l'étape runner en dernier, celle que la composition exécute", () => {
    const etapes = etapesDuFichier()

    expect(etapes.at(-1)?.nom).toBe("runner")
  })

  it("bascule sur l'utilisateur `node` avant de lancer le serveur", () => {
    const runner = etape("runner")
    const bascule = indexDe(runner, "USER")
    const demarrage = indexDe(runner, "CMD")

    expect(bascule).toBeGreaterThan(-1)
    expect(demarrage).toBeGreaterThan(-1)
    expect(bascule).toBeLessThan(demarrage)
    expect(runner.instructions[bascule]?.arguments).toBe("node")
  })

  it("ne repasse jamais root après la bascule", () => {
    const bascules = etape("runner").instructions.filter(
      (instruction) => instruction.commande === "USER"
    )

    expect(bascules.map((instruction) => instruction.arguments)).toEqual([
      "node",
    ])
  })

  it("laisse le serveur standalone se lancer sans élévation de privilèges", () => {
    const runner = etape("runner")

    expect(runner.instructions[indexDe(runner, "CMD")]?.arguments).toBe(
      '["node", "server.js"]'
    )
  })

  it("ne corrige pas les droits par une couche supplémentaire", () => {
    const runner = etape("runner")
    const copies = runner.instructions.filter(
      (instruction) => instruction.commande === "COPY"
    )

    expect(copies.length).toBeGreaterThan(0)
    for (const copie of copies) {
      expect(copie.arguments).not.toContain("--chown")
    }
    expect(
      runner.instructions.filter(
        (instruction) => instruction.commande === "RUN"
      )
    ).toEqual([])
  })
})
