const MB = 1024 * 1024

export const uploadPolicies = {
  "employee-passport": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * MB,
    folder: "employee-passports",
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
