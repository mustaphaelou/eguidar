export const formatDateArticle = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
})

export function formatPublishedAt(value: Date | string): string {
  return formatDateArticle.format(new Date(value))
}

export function publishedAtISO(value: Date | string): string {
  return new Date(value).toISOString()
}
