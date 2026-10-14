"use client"

import { useEffect, useRef } from "react"

/** What to do when the live channel says something changed (`app/api/live`). */
export type LiveHandlers = {
  /** This person's notifications moved. */
  notifications?: () => void
  /** Vane's cards, jobs, plans or state moved. */
  vane?: () => void
}

/**
 * Holds one connection to the workspace's live channel open, and reconnects
 * after a drop, waiting 1 s, then 2, 4 … up to 15 s.
 */
export function useLiveStream(handlers: LiveHandlers, enabled = true) {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    if (!enabled) {
      return
    }

    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    let retryDelayMs = 1000

    const closeConnection = () => {
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const connect = () => {
      if (closed) return

      eventSource = new EventSource("/api/live")

      eventSource.addEventListener("notifications", () => {
        retryDelayMs = 1000
        latest.current.notifications?.()
      })

      eventSource.addEventListener("vane", () => {
        retryDelayMs = 1000
        latest.current.vane?.()
      })

      eventSource.addEventListener("ready", () => {
        retryDelayMs = 1000
      })

      eventSource.onerror = () => {
        closeConnection()
        if (closed) return

        reconnectTimer = setTimeout(() => {
          retryDelayMs = Math.min(retryDelayMs * 2, 15000)
          connect()
        }, retryDelayMs)
      }
    }

    connect()

    return () => {
      closed = true
      closeConnection()
    }
  }, [enabled])
}
