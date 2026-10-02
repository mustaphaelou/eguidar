import { spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { createRequire } from "node:module"
import type { Duplex } from "node:stream"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

const UNDICI_PATCH_FLOOR = "7.29.1"

const RFC6455_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

const SUBPROTOCOL_NON_DEMANDE = "x-never-requested"

const DEADLINE_CLIENT_MS = 5000

const CLIENT_SCRIPT = `
const { WebSocket } = await import(process.env.UNDICI_ENTRY)
const ws = new WebSocket(process.env.HOSTILE_WS_URL)
ws.addEventListener("error", () => {})
ws.addEventListener("close", (event) => {
  console.log("close:" + event.code)
  process.exit(0)
})
setTimeout(() => {
  console.log("neither crashed nor closed")
  process.exit(3)
}, ${DEADLINE_CLIENT_MS})
`

function releaseParts(version: string): number[] {
  const release = version.split("-", 1)[0] ?? ""
  return release.split(".").map((part) => Number.parseInt(part, 10))
}

function satisfiesPatchFloor(version: string, floor: string): boolean {
  if (version.includes("-")) return false
  const [major = 0, minor = 0, patch = 0] = releaseParts(version)
  const [floorMajor = 0, floorMinor = 0, floorPatch = 0] = releaseParts(floor)
  if (major !== floorMajor) return major > floorMajor
  if (minor !== floorMinor) return minor > floorMinor
  return patch >= floorPatch
}

function undiciEntry(): string {
  return createRequire(import.meta.url).resolve("undici")
}

function installedUndiciVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "undici/package.json"
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: unknown
    }
    return typeof manifest.version === "string" ? manifest.version : null
  } catch {
    return null
  }
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floor itself", () => {
    expect(satisfiesPatchFloor("7.29.1", UNDICI_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("7.29.2", UNDICI_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("7.30.0", UNDICI_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("8.10.2", UNDICI_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("7.29.0", UNDICI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("7.27.2", UNDICI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("6.28.0", UNDICI_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("7.29.1-beta.1", UNDICI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", UNDICI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", UNDICI_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed undici (GHSA-rfgv-xxqx-mfg5)", () => {
  it("sits at or above the patch floor when present in the tree", () => {
    const version = installedUndiciVersion()
    if (version === null) return
    expect(satisfiesPatchFloor(version, UNDICI_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json overrides", () => {
  it("pins undici to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.undici
    expect(range, "undici override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, UNDICI_PATCH_FLOOR)).toBe(true)
  })
})

describe("an unrequested subprotocol fails the connection (CVE-2026-19534)", () => {
  let server: Server
  let sockets: Set<Duplex>
  let url: string

  beforeEach(async () => {
    sockets = new Set()
    server = createServer((_request, response) => {
      response.writeHead(426).end()
    })
    // Un 101 handshake par ailleurs correct — `Sec-WebSocket-Accept` juste, pour
    // que le client ne puisse pas légitimement s'en prendre à lui — qui nomme un
    // sous-protocole que le client n'a jamais demandé. C'est le seul élément
    // hostile ; la RFC 6455 §4.1 impose alors d'échouer la connexion.
    server.on("upgrade", (request, socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
      const key = request.headers["sec-websocket-key"] ?? ""
      const accept = createHash("sha1")
        .update(key + RFC6455_GUID)
        .digest("base64")
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          `Sec-WebSocket-Protocol: ${SUBPROTOCOL_NON_DEMANDE}\r\n` +
          "\r\n"
      )
    })
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("the hostile server has no TCP address")
    }
    url = `ws://127.0.0.1:${address.port}/${randomBytes(4).toString("hex")}`
  })

  afterEach(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  it("does not terminate the process that opened the socket", async () => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", CLIENT_SCRIPT],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          UNDICI_ENTRY: undiciEntry(),
          HOSTILE_WS_URL: url,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    )

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))

    const code = await new Promise<number | string>((resolve) => {
      child.on("close", (exitCode, signal) => resolve(signal ?? exitCode ?? -1))
    })

    expect(
      code,
      `le client a rendu ${String(code)}\nstdout:\n${stdout}\nstderr:\n${stderr}`
    ).toBe(0)
    expect(stderr).not.toMatch(/Uncaught|TypeError/)
  }, 30_000)
})
