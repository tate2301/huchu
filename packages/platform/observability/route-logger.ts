type LogFields = Record<string, unknown>

type CreateRouteLoggerInput = {
  route: string
  request: Request
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

function cleanFields(fields: LogFields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  )
}

export function createRouteLogger({ route, request }: CreateRouteLoggerInput) {
  const startedAt = Date.now()
  const requestId =
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    undefined

  function payload(event: string, fields: LogFields = {}) {
    return cleanFields({
      level: "info",
      event,
      route,
      method: request.method,
      requestId,
      ms: Date.now() - startedAt,
      ...fields,
    })
  }

  return {
    elapsedMs() {
      return Date.now() - startedAt
    },
    info(event: string, fields?: LogFields) {
      console.log(JSON.stringify(payload(event, fields)))
    },
    error(event: string, error: unknown, fields?: LogFields) {
      console.error(
        JSON.stringify({
          ...payload(event, fields),
          level: "error",
          error: normalizeError(error),
        }),
      )
    },
  }
}
