export interface PriceBucket {
  id: string
  label: string
  minCents: number
  maxCents: number | null
}

export const PRICE_BUCKETS: PriceBucket[] = [
  { id: "0-1000", label: "Moins de 1 000 MAD", minCents: 0, maxCents: 100000 },
  {
    id: "1000-2500",
    label: "1 000 – 2 500 MAD",
    minCents: 100000,
    maxCents: 250000,
  },
  {
    id: "2500-5000",
    label: "2 500 – 5 000 MAD",
    minCents: 250000,
    maxCents: 500000,
  },
  {
    id: "5000-10000",
    label: "5 000 – 10 000 MAD",
    minCents: 500000,
    maxCents: 1000000,
  },
  {
    id: "10000-plus",
    label: "Plus de 10 000 MAD",
    minCents: 1000000,
    maxCents: null,
  },
]

export function getPriceBucket(
  id: string | undefined
): PriceBucket | undefined {
  return PRICE_BUCKETS.find((bucket) => bucket.id === id)
}

export function priceBucketIdFor(priceCents: number): string {
  const bucket = PRICE_BUCKETS.find(
    (candidate) =>
      priceCents >= candidate.minCents &&
      (candidate.maxCents === null || priceCents < candidate.maxCents)
  )
  return bucket ? bucket.id : PRICE_BUCKETS[PRICE_BUCKETS.length - 1].id
}
