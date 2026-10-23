// Test-only transport: replaces globalThis.fetch before `scripts/purger-edge.mjs`
// is imported, so the purge script is exercised end to end without any network.
// The response is chosen by FAUX_CLOUDFLARE_MODE; every call is appended to the
// file named by FAUX_CLOUDFLARE_CAPTURE, which the test reads back.

import { appendFileSync } from "node:fs"

const mode = process.env.FAUX_CLOUDFLARE_MODE ?? "succes"
const capture = process.env.FAUX_CLOUDFLARE_CAPTURE

globalThis.fetch = async (url, init = {}) => {
  if (capture !== undefined) {
    appendFileSync(
      capture,
      `${JSON.stringify({
        url: String(url),
        method: init.method,
        headers: init.headers ?? {},
        body: init.body,
      })}\n`
    )
  }

  switch (mode) {
    case "succes":
      return new Response(JSON.stringify({ success: true, result: { id: "1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    case "echec-http":
      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Invalid API Token" }],
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      )
    case "echec-metier":
      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Invalid zone identifier" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    case "reseau":
      throw new TypeError("fetch failed")
    default:
      throw new Error(`mode inconnu : ${mode}`)
  }
}
