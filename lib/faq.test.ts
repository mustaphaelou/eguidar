import { describe, expect, it } from "vitest"

import { faqs } from "@/lib/faq"
import { site } from "@/lib/site"

describe("faqs", () => {
  it("provides the canonical 10 FAQ entries", () => {
    expect(faqs).toHaveLength(10)
    for (const faq of faqs) {
      expect(faq.question.trim().length).toBeGreaterThan(0)
      expect(faq.answer.trim().length).toBeGreaterThan(0)
    }
  })

  it("includes contact details matching site constants", () => {
    const contactFaq = faqs.find((f) =>
      f.question.includes("Comment vous contacter")
    )
    expect(contactFaq).toBeDefined()
    expect(contactFaq?.answer).toContain(site.contactPhone)
    expect(contactFaq?.answer).toContain(site.contactEmail)
  })
})
