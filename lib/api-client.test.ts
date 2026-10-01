/**
 * The app's React Query defaults retry a failed request unless the server
 * refused it: a refused save went out twice before, and the second attempt
 * could only be refused again.
 */
import { describe, expect, it } from "vitest"

import { ApiError, isRefusal } from "./api-client"

describe("isRefusal", () => {
  it("is a refusal when the server answered with a 4xx", () => {
    expect(isRefusal(new ApiError("There is already a form with that name", 409))).toBe(true)
    expect(isRefusal(new ApiError("Invalid", 400))).toBe(true)
    expect(isRefusal(new ApiError("Forbidden", 403))).toBe(true)
    expect(isRefusal(new ApiError("Not found", 404))).toBe(true)
  })

  it("is not a refusal when asking again might work", () => {
    expect(isRefusal(new ApiError("Request timeout", 408))).toBe(false)
    expect(isRefusal(new ApiError("Too many requests", 429))).toBe(false)
    expect(isRefusal(new ApiError("Failed", 500))).toBe(false)
    expect(isRefusal(new ApiError("Bad gateway", 502))).toBe(false)
    expect(isRefusal(new TypeError("Failed to fetch"))).toBe(false)
  })
})
