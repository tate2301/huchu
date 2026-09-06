const MB = 1024 * 1024

export const uploadPolicies = {
  "employee-passport": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * MB,
    folder: "employee-passports",
  },
  "employee-national-id": {
    allowedTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    maxBytes: 5 * MB,
    folder: "employee-national-ids",
  },
  "scrap-purchase-ticket-photo": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * MB,
    folder: "scrap-purchase-ticket-photos",
  },
  "scrap-sale-ticket-photo": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * MB,
    folder: "scrap-sale-ticket-photos",
  },
  "crm-intake-photo": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * MB,
    folder: "crm-intake-photos",
  },
  "crm-attachment": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxBytes: 10 * MB,
    folder: "crm-attachments",
  },
  // A file question on a public form. Same allowance as an attachment, but a
  // separate folder — anything a stranger uploaded should be identifiable as
  // such without reading the row that references it.
  "crm-template-upload": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxBytes: 10 * MB,
    folder: "crm-template-uploads",
  },
  // A birth certificate, a transfer letter, an immunisation card. The campus
  // module had a Files tab on every record and no way to put anything in it,
  // because there was no context here and `crm-attachment` would have filed a
  // child's paperwork under the CRM's folder.
  "school-document": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxBytes: 10 * MB,
    folder: "school-documents",
  },
} as const

export type UploadContext = keyof typeof uploadPolicies

export const uploadContextValues = Object.keys(uploadPolicies) as UploadContext[]

export function isUploadContext(value: string): value is UploadContext {
  return value in uploadPolicies
}

export function getUploadPolicy(context: UploadContext) {
  return uploadPolicies[context]
}
