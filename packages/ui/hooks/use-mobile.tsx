"use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return Boolean(isMobile)
}

/**
 * Below a given width, tracked live.
 *
 * `useIsMobile` is pinned to 768px, which is the phone question. This is the
 * layout question — the width at which a record page stops having room for a
 * rail beside its content — and that boundary is 1024px, the same one
 * `.detail-grid` collapses at.
 */
export function useIsBelow(width: number) {
  const [below, setBelow] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${width - 1}px)`)
    const update = () => setBelow(mediaQuery.matches)

    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [width])

  return Boolean(below)
}
