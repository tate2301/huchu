export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

type FetchInput = RequestInfo | URL

export async function fetchJson<T>(
  input: FetchInput,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  })

  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String(payload.error)
        : `Request failed (${response.status})`
    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong") {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

export function isFeatureDisabledError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status !== 403) return false
  return /feature disabled/i.test(error.message)
}

export function resolveDisplayErrorMessage(
  errors: Array<unknown>,
  fallback = "Something went wrong",
): string | null {
  const candidates = errors.filter(Boolean)
  if (candidates.length === 0) return null

  const visibleError = candidates.find((candidate) => !isFeatureDisabledError(candidate))
  if (visibleError) return getApiErrorMessage(visibleError, fallback)

  return null
}
