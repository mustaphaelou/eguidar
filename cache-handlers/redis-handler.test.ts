import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const DETAIL_BUDGET_KEY = "eguidar:cache:detail-budget"

const MAINTENANT = Date.parse("2026-01-01T00:00:00.000Z")
const JOUR_EN_MS = 24 * 60 * 60 * 1000

interface AppelSet {
  cle: string
  charge: string
  options: { EX: number }
}

interface CommandeBudget {
  commande: string
  args: unknown[]
}

const etat = vi.hoisted(() => ({
  entrees: new Map<string, { charge: string; ex: number }>(),
  budget: new Map<string, number>(),
  appelsSet: [] as AppelSet[],
  commandesBudget: [] as CommandeBudget[],
  panneBudget: null as "zAdd" | "zRemRangeByScore" | "zCard" | null,
}))

vi.mock("redis", () => {
  const exigerCleBudget = (cle: string): void => {
    if (cle !== DETAIL_BUDGET_KEY) {
      throw new Error(`clé de budget inattendue : ${cle}`)
    }
  }

  const controlerPanne = (): void => {
    if (etat.panneBudget !== null) {
      throw new Error(`panne Redis simulée sur ${etat.panneBudget}`)
    }
  }

  return {
    createClient: () => ({
      connect: async () => undefined,
      on: (_evenement: string, _ecouteur: () => void) => undefined,
      set: async (cle: string, charge: string, options: { EX: number }) => {
        etat.appelsSet.push({ cle, charge, options })
        etat.entrees.set(cle, { charge, ex: options.EX })
      },
      zAdd: async (cle: string, membre: { score: number; value: string }) => {
        exigerCleBudget(cle)
        etat.commandesBudget.push({ commande: "zAdd", args: [cle, membre] })
        controlerPanne()
        etat.budget.set(membre.value, membre.score)
        return 1
      },
      zRemRangeByScore: async (cle: string, min: string, max: number) => {
        exigerCleBudget(cle)
        etat.commandesBudget.push({
          commande: "zRemRangeByScore",
          args: [cle, min, max],
        })
        controlerPanne()
        let supprimes = 0
        for (const [membre, score] of etat.budget) {
          if (score <= max) {
            etat.budget.delete(membre)
            supprimes += 1
          }
        }
        return supprimes
      },
      zCard: async (cle: string) => {
        exigerCleBudget(cle)
        etat.commandesBudget.push({ commande: "zCard", args: [cle] })
        controlerPanne()
        return etat.budget.size
      },
      zRem: async (cle: string, membre: string) => {
        exigerCleBudget(cle)
        etat.commandesBudget.push({ commande: "zRem", args: [cle, membre] })
        controlerPanne()
        return etat.budget.delete(membre) ? 1 : 0
      },
    }),
  }
})

import handler, * as moduleHandler from "./redis-handler.js"

function flux(contenu: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(contenu))
      controller.close()
    },
  })
}

function entree(tags: string[], expire = 86_400) {
  return {
    value: flux("contenu"),
    tags,
    stale: 0,
    timestamp: Date.now(),
    expire,
    revalidate: 0,
  }
}

async function ecrire(
  cle: string,
  tags: string[],
  expire = 86_400
): Promise<void> {
  await handler.set(cle, Promise.resolve(entree(tags, expire)))
}

function viderLEtat(): void {
  etat.entrees.clear()
  etat.budget.clear()
  etat.appelsSet.length = 0
  etat.commandesBudget.length = 0
  etat.panneBudget = null
}

let redisUrlDOrigine: string | undefined

beforeAll(() => {
  redisUrlDOrigine = process.env.REDIS_URL
  process.env.REDIS_URL = "redis://faux:6379"
})

afterAll(() => {
  if (redisUrlDOrigine === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = redisUrlDOrigine
})

beforeEach(() => {
  viderLEtat()
  delete process.env.CACHE_DETAIL_KEYS_MAX
  vi.useFakeTimers()
  vi.setSystemTime(MAINTENANT)
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.CACHE_DETAIL_KEYS_MAX
})

describe("Le budget du cache de détail", () => {
  it("écrit une entrée de détail sous le plafond, avec le TTL et l'encodage d'aujourd'hui", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "10"

    await ecrire("produit:chaise", ["product:chaise", "products", "home"])

    expect(etat.appelsSet).toEqual([
      expect.objectContaining({
        cle: "produit:chaise",
        options: { EX: 86_400 },
      }),
    ])
    expect(JSON.parse(etat.appelsSet[0].charge)).toEqual({
      value: Buffer.from("contenu").toString("base64"),
      tags: ["product:chaise", "products", "home"],
      stale: 0,
      timestamp: MAINTENANT,
      expire: 86_400,
      revalidate: 0,
    })
    expect(etat.commandesBudget).toEqual([
      {
        commande: "zAdd",
        args: [
          DETAIL_BUDGET_KEY,
          { score: MAINTENANT + JOUR_EN_MS, value: "produit:chaise" },
        ],
      },
      {
        commande: "zRemRangeByScore",
        args: [DETAIL_BUDGET_KEY, "-inf", MAINTENANT],
      },
      { commande: "zCard", args: [DETAIL_BUDGET_KEY] },
    ])
    expect(etat.budget.get("produit:chaise")).toBe(MAINTENANT + JOUR_EN_MS)
  })

  it("admet les N premières clés de détail puis refuse la N+1ᵉ sans toucher aux admises", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "2"

    await ecrire("detail:1", ["product:un"])
    await ecrire("detail:2", ["category:deux"])
    await expect(ecrire("detail:3", ["blog:trois"])).resolves.toBeUndefined()

    expect(etat.appelsSet.map(({ cle }) => cle)).toEqual([
      "detail:1",
      "detail:2",
    ])
    expect(etat.entrees.has("detail:3")).toBe(false)
    expect([...etat.budget.keys()].sort()).toEqual(["detail:1", "detail:2"])
    expect(etat.commandesBudget.at(-1)).toEqual({
      commande: "zRem",
      args: [DETAIL_BUDGET_KEY, "detail:3"],
    })
  })

  it("n'émet aucune commande de budget pour une écriture sans tag de détail, même budget plein", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "1"
    await ecrire("detail:plein", ["product:plein"])
    etat.commandesBudget.length = 0

    await ecrire("accueil", ["home"])
    await ecrire("liste-produits", ["products", "categories"])
    await ecrire("administration", ["admin"])

    expect(etat.commandesBudget).toEqual([])
    expect([...etat.entrees.keys()].sort()).toEqual([
      "accueil",
      "administration",
      "detail:plein",
      "liste-produits",
    ])
    expect(etat.budget.size).toBe(1)
  })

  it("relit CACHE_DETAIL_KEYS_MAX à chaque écriture, dans la même instance de module", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "1"
    await ecrire("detail:1", ["product:un"])
    await ecrire("detail:2", ["product:deux"])
    expect(etat.entrees.has("detail:2")).toBe(false)

    process.env.CACHE_DETAIL_KEYS_MAX = "2"
    await ecrire("detail:2", ["product:deux"])

    expect(etat.entrees.has("detail:2")).toBe(true)
    expect(etat.budget.size).toBe(2)
  })

  it("planche une valeur positive décimale", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "1.9"
    await ecrire("detail:1", ["product:un"])
    await ecrire("detail:2", ["product:deux"])

    expect(etat.entrees.has("detail:1")).toBe(true)
    expect(etat.entrees.has("detail:2")).toBe(false)
  })

  it("garde le TTL de 24 h du catalogue et le plafond de 30 jours", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "10"

    await ecrire("catalogue", ["category:catalogue"], 86_400)
    await ecrire("au-dela", ["blog:au-dela"], 60 * 86_400)

    expect(etat.appelsSet.map(({ options }) => options)).toEqual([
      { EX: 86_400 },
      { EX: 2_592_000 },
    ])
    expect(etat.budget.get("catalogue")).toBe(MAINTENANT + JOUR_EN_MS)
    expect(etat.budget.get("au-dela")).toBe(MAINTENANT + 30 * JOUR_EN_MS)
  })

  it("réécrit une clé de détail sans doubler le membre et avec un score neuf", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "1"
    await ecrire("detail:1", ["product:un"])

    vi.setSystemTime(MAINTENANT + 60_000)
    await ecrire("detail:1", ["product:un"])

    expect(etat.budget.size).toBe(1)
    expect(etat.budget.get("detail:1")).toBe(MAINTENANT + 60_000 + JOUR_EN_MS)
    expect(etat.entrees.size).toBe(1)
  })

  it("purge les membres échus avant de compter et leur rend leur place", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "1"
    await ecrire("detail:1", ["product:un"])

    vi.setSystemTime(MAINTENANT + JOUR_EN_MS)
    etat.commandesBudget.length = 0
    await ecrire("detail:2", ["product:deux"])

    expect(etat.entrees.has("detail:2")).toBe(true)
    expect(etat.budget.has("detail:1")).toBe(false)
    expect([...etat.budget.keys()]).toEqual(["detail:2"])
    expect(etat.commandesBudget).toEqual([
      {
        commande: "zAdd",
        args: [
          DETAIL_BUDGET_KEY,
          { score: MAINTENANT + 2 * JOUR_EN_MS, value: "detail:2" },
        ],
      },
      {
        commande: "zRemRangeByScore",
        args: [DETAIL_BUDGET_KEY, "-inf", MAINTENANT + JOUR_EN_MS],
      },
      { commande: "zCard", args: [DETAIL_BUDGET_KEY] },
    ])
  })

  it("avale une panne Redis du budget et écrit quand même l'entrée", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "10"

    for (const commande of ["zAdd", "zRemRangeByScore", "zCard"] as const) {
      viderLEtat()
      etat.panneBudget = commande

      await expect(
        ecrire("detail:panne", ["product:panne"])
      ).resolves.toBeUndefined()

      expect(etat.entrees.has("detail:panne"), commande).toBe(true)
    }
  })

  it("fige le plafond par défaut exporté à 10 000", () => {
    expect(moduleHandler.DETAIL_KEYS_MAX_DEFAULT).toBe(10_000)
  })

  it("retombe sur le défaut quand la variable est absente, vide, non numérique ou non positive", async () => {
    for (const valeur of [null, "", "abc", "0", "-5", "Infinity"]) {
      viderLEtat()
      if (valeur === null) delete process.env.CACHE_DETAIL_KEYS_MAX
      else process.env.CACHE_DETAIL_KEYS_MAX = valeur

      for (let i = 0; i < 9_999; i += 1) {
        etat.budget.set(`deja-admis:${i}`, MAINTENANT + JOUR_EN_MS)
      }

      await ecrire("detail:defaut", ["product:defaut"])
      await ecrire("detail:defaut-bis", ["product:defaut-bis"])

      expect(etat.entrees.has("detail:defaut"), String(valeur)).toBe(true)
      expect(etat.entrees.has("detail:defaut-bis"), String(valeur)).toBe(false)
    }
  })

  it("reproduit l'observation : 300 slugs inconnus avec un petit plafond restent bornés", async () => {
    process.env.CACHE_DETAIL_KEYS_MAX = "5"

    for (let i = 0; i < 300; i += 1) {
      await ecrire(`slug-inconnu-${i}`, [`product:inconnu-${i}`])
    }

    expect(etat.appelsSet.length).toBeLessThanOrEqual(5)
    expect(etat.entrees.size).toBeLessThanOrEqual(5)
    expect(etat.budget.size).toBeLessThanOrEqual(5)
    expect([...etat.entrees.keys()]).toEqual([
      "slug-inconnu-0",
      "slug-inconnu-1",
      "slug-inconnu-2",
      "slug-inconnu-3",
      "slug-inconnu-4",
    ])
  })
})
