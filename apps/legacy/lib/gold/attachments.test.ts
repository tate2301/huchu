import { describe, it, expect } from "vitest"
import { goldPurchaseAttachmentsSchema } from "@/lib/gold/attachments"

const validAttachment = {
  url: "https://example.com/receipt.pdf",
  filename: "receipt.pdf",
  mimeType: "application/pdf",
  sizeBytes: 204800,
  uploadedById: crypto.randomUUID(),
  uploadedAt: new Date().toISOString(),
}

describe("goldPurchaseAttachmentsSchema", () => {
  it("accepts a valid attachment array", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([validAttachment])
    expect(result.success).toBe(true)
  })

  it("accepts an empty array", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([])
    expect(result.success).toBe(true)
  })

  it("rejects missing url", () => {
    const { url: _url, ...rest } = validAttachment
    const result = goldPurchaseAttachmentsSchema.safeParse([rest])
    expect(result.success).toBe(false)
  })

  it("rejects non-url string in url field", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([{ ...validAttachment, url: "not-a-url" }])
    expect(result.success).toBe(false)
  })

  it("rejects non-uuid uploadedById", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([{ ...validAttachment, uploadedById: "not-a-uuid" }])
    expect(result.success).toBe(false)
  })

  it("rejects negative sizeBytes", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([{ ...validAttachment, sizeBytes: -1 }])
    expect(result.success).toBe(false)
  })

  it("rejects fractional sizeBytes", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([{ ...validAttachment, sizeBytes: 1.5 }])
    expect(result.success).toBe(false)
  })

  it("rejects invalid uploadedAt datetime", () => {
    const result = goldPurchaseAttachmentsSchema.safeParse([{ ...validAttachment, uploadedAt: "not-a-date" }])
    expect(result.success).toBe(false)
  })

  it("rejects missing filename", () => {
    const { filename: _filename, ...rest } = validAttachment
    const result = goldPurchaseAttachmentsSchema.safeParse([rest])
    expect(result.success).toBe(false)
  })
})
