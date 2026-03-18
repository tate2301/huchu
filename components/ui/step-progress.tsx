"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type StepProgressItem = {
  id: string
  label: string
}

type StepProgressProps = {
  steps: StepProgressItem[]
  currentStepIndex: number
  ariaLabel: string
  className?: string
}

export function StepProgress({
  steps,
  currentStepIndex,
  ariaLabel,
  className,
}: StepProgressProps) {
  const currentStep = steps[currentStepIndex] ?? steps[0]

  return (
    <nav aria-label={ariaLabel} className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="truncate">{currentStep?.label ?? "Step"}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {Math.min(currentStepIndex + 1, steps.length)}/{steps.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {steps.map((step, index) => {
          const isComplete = index < currentStepIndex
          const isActive = index === currentStepIndex

          return (
            <React.Fragment key={step.id}>
              <span
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-200 ease-out",
                  isActive
                    ? "bg-foreground"
                    : isComplete
                      ? "bg-foreground/55"
                      : "bg-[var(--surface-soft)]",
                )}
              />
            </React.Fragment>
          )
        })}
      </div>
      <ol className="sr-only">
        {steps.map((step, index) => (
          <li key={step.id}>
            {step.label}
            {index === currentStepIndex ? " current" : index < currentStepIndex ? " complete" : ""}
          </li>
        ))}
      </ol>
    </nav>
  )
}
