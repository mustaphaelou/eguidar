import { autoriserRecherche } from "@/lib/acces-recherche"
import { MESSAGE_TROP_DE_RECHERCHES } from "@/lib/limiteur-recherche"
import { parseSearchParams } from "@/lib/search-params"
import { searchSuggestions } from "@/lib/use-cases/search"

const MIN_QUERY_LENGTH = 2

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { query } = parseSearchParams({
    q: url.searchParams.get("q") ?? undefined,
  })

  if (query.length < MIN_QUERY_LENGTH) {
    return Response.json({ products: [], categories: [] })
  }

  if (!(await autoriserRecherche(request.headers))) {
    return Response.json({ error: MESSAGE_TROP_DE_RECHERCHES }, { status: 429 })
  }

  return Response.json(await searchSuggestions(query))
}
