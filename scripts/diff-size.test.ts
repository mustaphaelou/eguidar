import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, describe, expect, it } from "vitest"

import {
  BUDGET,
  countChangedLines,
  isGenerated,
  parseNumstat,
  verdictFor,
} from "./diff-size"

const LANCEUR = createRequire(import.meta.url).resolve("tsx/cli")
const SCRIPT = path.join(import.meta.dirname, "diff-size.ts")
const DOSSIER = mkdtempSync(path.join(tmpdir(), "diff-size-"))

describe("the size of a diff", () => {
  it("adds every added and removed line", () => {
    expect(
      countChangedLines([
        { path: "app/page.tsx", added: 120, removed: 4 },
        { path: "lib/payment.ts", added: 0, removed: 30 },
      ])
    ).toBe(154)
  })

  it("leaves the lockfile and the generated client out of the count", () => {
    expect(
      countChangedLines([
        { path: "app/page.tsx", added: 10, removed: 0 },
        { path: "package-lock.json", added: 9000, removed: 8000 },
        { path: "lib/generated/prisma/client.ts", added: 4000, removed: 3000 },
      ])
    ).toBe(10)
  })

  it("names the lockfile and the generated client, and nothing that merely starts the same way", () => {
    expect(isGenerated("package-lock.json")).toBe(true)
    expect(isGenerated("lib/generated/prisma/client.ts")).toBe(true)
    expect(isGenerated("lib/generatedness.ts")).toBe(false)
    expect(isGenerated("app/generated/page.tsx")).toBe(false)
  })
})

describe("reading the numstat a diff prints", () => {
  it("reads one file per line, added and removed apart", () => {
    expect(
      parseNumstat("12\t4\tapp/page.tsx\n0\t30\tlib/payment.ts\n")
    ).toEqual([
      { path: "app/page.tsx", added: 12, removed: 4 },
      { path: "lib/payment.ts", added: 0, removed: 30 },
    ])
  })

  it("reads a binary file as no line at all", () => {
    expect(parseNumstat("-\t-\tpublic/logo.png\n")).toEqual([
      { path: "public/logo.png", added: 0, removed: 0 },
    ])
  })

  it("names the file a rename brings into being, not the one it removes", () => {
    expect(
      parseNumstat("0\t0\tlib/{ancien.ts => nouveau.ts}\n1\t1\ta.ts => b.ts\n")
    ).toEqual([
      { path: "lib/nouveau.ts", added: 0, removed: 0 },
      { path: "b.ts", added: 1, removed: 1 },
    ])
  })

  it("reads nothing out of an empty diff", () => {
    expect(parseNumstat("")).toEqual([])
    expect(parseNumstat("\n")).toEqual([])
  })

  it("refuses a line it cannot count, rather than counting it as nothing", () => {
    expect(() => parseNumstat("douze\t4\tapp/page.tsx\n")).toThrow(
      "where a count belongs"
    )
    expect(() => parseNumstat("12\n")).toThrow("no line count at all")
  })
})

describe("the budget a cold read has", () => {
  it("is two thousand changed lines", () => {
    expect(BUDGET).toBe(2000)
  })

  it("calls two thousand lines within the budget and two thousand and one above it", () => {
    expect(verdictFor(2000)).toBe("within the budget")
    expect(verdictFor(2001)).toBe("too large for a cold read")
  })

  it("calls an empty diff within the budget", () => {
    expect(verdictFor(0)).toBe("within the budget")
  })
})

const git = (cwd: string, ...lesArguments: string[]): string => {
  const execution = spawnSync(
    "git",
    [
      "-c",
      "user.email=essai@exemple",
      "-c",
      "user.name=Essai",
      ...lesArguments,
    ],
    { cwd, encoding: "utf8" }
  )
  if (execution.status !== 0) {
    throw new Error(
      `git ${lesArguments.join(" ")} : ${execution.stderr ?? "sans diagnostic"}`
    )
  }
  return execution.stdout
}

const mesurer = (
  cwd: string,
  base: string
): { sortie: string; statut: number | null } => {
  const execution = spawnSync(process.execPath, [LANCEUR, SCRIPT, base], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  })
  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`.trim(),
    statut: execution.status,
  }
}

const commitDepuis = (cwd: string, fichiers: Record<string, string>): void => {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const absolu = path.join(cwd, chemin)
    mkdirSync(path.dirname(absolu), { recursive: true })
    writeFileSync(absolu, contenu)
  }
  git(cwd, "add", "--all", ".")
  git(cwd, "commit", "--quiet", "--message", "etape")
}

const nouveauDepot = (nom: string): { cwd: string; base: string } => {
  const cwd = path.join(DOSSIER, nom)
  mkdirSync(cwd, { recursive: true })
  git(cwd, "init", "--quiet", ".")
  commitDepuis(cwd, { "app.ts": "a\nb\nc\n" })
  return { cwd, base: git(cwd, "rev-parse", "HEAD").trim() }
}

describe("the line a review quotes", () => {
  it("calls a small diff within the budget, and says how many lines it read", () => {
    const { cwd, base } = nouveauDepot("petit")
    commitDepuis(cwd, { "app.ts": "a\nb\nc\nd\ne\n" })

    expect(mesurer(cwd, base)).toEqual({
      sortie: "2 changed lines — within the budget",
      statut: 0,
    })
  })

  it("measures the hand-written lines and ignores the lockfile that dwarfs them", () => {
    const { cwd, base } = nouveauDepot("gros")
    const source =
      Array.from(
        { length: 2001 },
        (_, rang) => `export const l${rang} = ${rang}`
      ).join("\n") + "\n"
    const verrou =
      Array.from({ length: 4000 }, (_, rang) => `\"paquet-${rang}\": {}`).join(
        ",\n"
      ) + "\n"

    commitDepuis(cwd, { "gros.ts": source, "package-lock.json": verrou })

    expect(mesurer(cwd, base)).toEqual({
      sortie: "2001 changed lines — too large for a cold read",
      statut: 0,
    })
  })

  it("refuses a base it cannot read, and names it", () => {
    const { cwd } = nouveauDepot("inconnu")
    const execution = mesurer(cwd, "pas-une-ref")

    expect(execution.statut).toBe(1)
    expect(execution.sortie).toContain("pas-une-ref")
  })

  it("measures a head other than the working tree, so a review can name the pull request", () => {
    const { cwd, base } = nouveauDepot("entete")
    commitDepuis(cwd, { "app.ts": "a\nb\nc\nd\n" })
    const tete = git(cwd, "rev-parse", "HEAD").trim()
    commitDepuis(cwd, { "app.ts": "a\n" })

    const execution = spawnSync(
      process.execPath,
      [LANCEUR, SCRIPT, base, tete],
      { cwd, encoding: "utf8", timeout: 60_000 }
    )

    expect(`${execution.stdout}`.trim()).toBe(
      "1 changed lines — within the budget"
    )
  })

  it("says how to use it when it is given no base at all", () => {
    const { cwd } = nouveauDepot("sans-base")
    const execution = spawnSync(process.execPath, [LANCEUR, SCRIPT], {
      cwd,
      encoding: "utf8",
      timeout: 60_000,
    })

    expect(execution.status).toBe(1)
    expect(`${execution.stderr}`).toContain("usage: diff-size <base> [head]")
  })
})

afterAll(() => {
  rmSync(DOSSIER, { force: true, recursive: true })
})

describe("the budget the review mandate states", () => {
  const mandat = readFileSync(
    path.join(
      import.meta.dirname,
      "..",
      "docs",
      "agents",
      "factory",
      "review.md"
    ),
    "utf8"
  )

  it("prints the number the mandate writes, and the verdict it writes beside it", () => {
    const phrase = /Above ([\d,]+) changed lines/.exec(mandat)

    expect(phrase?.[1]).toBeDefined()
    expect(Number((phrase?.[1] ?? "").replace(/,/g, ""))).toBe(BUDGET)
    expect(mandat).toContain(verdictFor(BUDGET + 1))
  })

  it("leaves out the two paths the mandate prints", () => {
    for (const chemin of [
      "package-lock.json",
      "lib/generated/prisma/client.ts",
    ]) {
      expect(isGenerated(chemin)).toBe(true)
    }
    expect(mandat).toContain("`package-lock.json`")
    expect(mandat).toContain("`lib/generated/**`")
  })
})
