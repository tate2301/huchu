export function createRequestLogger(requestId: string, context?: Record<string, unknown>) {
  return {
    info(msg: string, extra?: Record<string, unknown>) {
      console.log(JSON.stringify({ level: "info", requestId, msg, ...context, ...extra, ts: new Date().toISOString() }))
    },
    warn(msg: string, extra?: Record<string, unknown>) {
      console.warn(JSON.stringify({ level: "warn", requestId, msg, ...context, ...extra, ts: new Date().toISOString() }))
    },
    error(msg: string, err?: Error, extra?: Record<string, unknown>) {
      console.error(JSON.stringify({ level: "error", requestId, msg, error: err?.message, stack: err?.stack, ...context, ...extra, ts: new Date().toISOString() }))
    },
  }
}
