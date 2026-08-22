import { searchSuggestions } from "@/lib/use-cases/search"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim() ?? ""

  if (query.length < 2) {
    return Response.json({ products: [], categories: [] })
  }

  return Response.json(await searchSuggestions(query))
}
