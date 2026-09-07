"use client"

import type { ReactNode } from "react"

import { useHydrated } from "@/hooks/use-hydrated"

type PdfMeta = {
  label: string
  value: string
}

type PdfTemplateProps = {
  title: string
  subtitle?: string
  meta?: PdfMeta[]
  children: ReactNode
}

export function PdfTemplate({ title, subtitle, meta, children }: PdfTemplateProps) {
  /*
    The timestamp is rendered after mount, not during render.

    `new Date().toLocaleString()` in the render body returns one string on the
    server and a different one in the browser — different instant, and often a
    different timezone and locale as well. React cannot reconcile that text and
    throws #418 ("text content does not match server-rendered HTML"), which in
    a production build is an *uncaught error*, not a warning. The e2e suite
    caught it on /gold/exceptions; it applies to all nine pages that use this
    template.

    Rendering it client-side is also the more truthful answer. This block is
    captured to a PDF when someone presses Export, so "Generated" should mean
    when the document was produced — not when the server happened to render
    the shell, which under any caching may be much earlier or shared between
    people.

    Empty on the server and on the first client paint. The template lives
    off-screen until Export is pressed, long after mount, so nothing user-
    visible ever shows the blank.
  */
  const hydrated = useHydrated()
  const generatedAt = hydrated ? new Date().toLocaleString() : ""

  return (
    <div className="w-[794px] bg-white p-8 text-black">
      <div className="flex items-start justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Generated</div>
          <div suppressHydrationWarning>{generatedAt}</div>
        </div>
      </div>

      {meta && meta.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-700">
          {meta.map((item) => (
            <div key={item.label} className="rounded border border-gray-200 p-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                {item.label}
              </div>
              <div className="font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6">{children}</div>
    </div>
  )
}
