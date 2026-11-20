import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const BUDGET = 2000

export type MeasuredFile = {
  path: string
  added: number
  removed: number
}

const GENERATED = [/^package-lock\.json$/, /^lib\/generated\//] as const

export function isGenerated(filePath: string): boolean {
  return GENERATED.some((pattern) => pattern.test(filePath))
}

export function countChangedLines(files: readonly MeasuredFile[]): number {
  let total = 0
  for (const file of files) {
    if (isGenerated(file.path)) continue
    total += file.added + file.removed
  }
  return total
}

export function parseNumstat(output: string): MeasuredFile[] {
  const files: MeasuredFile[] = []
  for (const line of output.split("\n")) {
    if (line.trim() === "") continue
    const [added, removed, ...rest] = line.split("\t")
    files.push({
      path: renamedTarget(rest.join("\t")),
      added: lineCount(added),
      removed: lineCount(removed),
    })
  }
  return files
}

function lineCount(field: string | undefined): number {
  if (field === "-") return 0
  if (field === undefined) {
    throw new Error("a numstat row that carries no line count at all")
  }
  const value = Number.parseInt(field, 10)
  if (String(value) !== field) {
    throw new Error(`a numstat row carrying \`${field}\` where a count belongs`)
  }
  return value
}

function renamedTarget(filePath: string): string {
  const braced = /\{[^{}]* => ([^{}]*)\}/.exec(filePath)
  if (braced) return filePath.replace(braced[0], braced[1] ?? "")
  const arrow = filePath.lastIndexOf(" => ")
  return arrow === -1 ? filePath : filePath.slice(arrow + 4)
}

export type SizeVerdict = "within the budget" | "too large for a cold read"

export function verdictFor(lines: number): SizeVerdict {
  return lines > BUDGET ? "too large for a cold read" : "within the budget"
}

function numstat(base: string, head: string): string {
  const execution = spawnSync(
    "git",
    ["diff", "--numstat", "-M", `${base}...${head}`],
    { cwd: process.cwd(), encoding: "utf8" }
  )
  if (execution.status !== 0) {
    const diagnostic = (execution.stderr ?? "").trim()
    throw new Error(
      `git diff --numstat ${base}...${head} : ${diagnostic || "no diagnostic"}`
    )
  }
  return execution.stdout
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [base, head = "HEAD"] = process.argv.slice(2)
  if (base === undefined) {
    process.stderr.write(
      "usage: diff-size <base> [head]  e.g. diff-size origin/main FETCH_HEAD\n"
    )
    process.exitCode = 1
  } else {
    try {
      const lines = countChangedLines(parseNumstat(numstat(base, head)))
      process.stdout.write(`${lines} changed lines — ${verdictFor(lines)}\n`)
    } catch (erreur) {
      process.stderr.write(`${(erreur as Error).message}\n`)
      process.exitCode = 1
    }
  }
}
