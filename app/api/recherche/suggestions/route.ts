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

  return Response.json(await searchSuggestions(query))
}
