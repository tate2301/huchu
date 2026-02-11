"use client"

import { useEffect } from "react"

type StreamCallback = () => void

export function useNotificationStream(onSnapshot: StreamCallback) {
  useEffect(() => {
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

      eventSource = new EventSource("/api/notifications/stream")

      eventSource.addEventListener("snapshot", () => {
        retryDelayMs = 1000
        onSnapshot()
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
  }, [onSnapshot])
}
