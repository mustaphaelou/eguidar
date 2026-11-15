import { spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import type { Server } from "node:http"
import { createRequire } from "node:module"
import type { Duplex } from "node:stream"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

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

function undiciEntry(): string {
  return createRequire(import.meta.url).resolve("undici")
}

describe("an unrequested subprotocol fails the connection", () => {
  let server: Server
  let sockets: Set<Duplex>
  let url: string

  beforeEach(async () => {
    sockets = new Set()
    server = createServer((_request, response) => {
      response.writeHead(426).end()
    })
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
