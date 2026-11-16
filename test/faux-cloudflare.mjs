
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
