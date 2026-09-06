"use client"

import type { ReactNode } from "react"

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
  return (
    <div className="w-[794px] bg-white p-8 text-black">
      <div className="flex items-start justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Generated</div>
          <div>{new Date().toLocaleString()}</div>
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
