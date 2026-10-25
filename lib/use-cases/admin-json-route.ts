import {
  estAdmin,
  lireSession,
  type Client,
} from "@/lib/use-cases/session-courante"

export interface AdminJsonSchema<Input> {
  safeParse(
    value: unknown
  ): { success: true; data: Input } | { success: false; error: unknown }
}

export type ResultatRouteAdmin<Body, Code extends string> =
  { ok: true; body: Body } | { ok: false; code: Code; message: string }

export interface AdminJsonRouteOptions<Input, Body, Code extends string> {
  schema: AdminJsonSchema<Input>
  label: string
  failureMessage: string
  statuses: Record<Code, number>
  run: (
    input: Input,
    client: Client
  ) => ResultatRouteAdmin<Body, Code> | Promise<ResultatRouteAdmin<Body, Code>>
}

async function adminGate(): Promise<Client | null> {
  const client = await lireSession()
  return estAdmin(client) ? client : null
}

export function adminJsonRoute<Input, Body, Code extends string>(
  options: AdminJsonRouteOptions<Input, Body, Code>
): (request: Request) => Promise<Response> {
  return async (request) => {
    const client = await adminGate()
    if (!client) {
      return Response.json({ error: "Non autorisé" }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: "Corps de requête invalide" },
        { status: 400 }
      )
    }

    const parsed = options.schema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: "Requête invalide" }, { status: 400 })
    }

    try {
      const resultat = await options.run(parsed.data, client)
      if (resultat.ok) return Response.json(resultat.body, { status: 200 })

      return Response.json(
        { error: resultat.message },
        { status: options.statuses[resultat.code] }
      )
    } catch (error) {
      console.error(options.label, error)
      return Response.json({ error: options.failureMessage }, { status: 500 })
    }
  }
}
