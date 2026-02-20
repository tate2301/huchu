import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageIntroProps = {
  title: string;
  purpose: string;
  nextStep?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageIntro({
  title,
  purpose,
  nextStep,
  actions,
  className,
}: PageIntroProps) {
  void purpose;
  void nextStep;

  return (
    <section className={cn("rounded-xl border-0 bg-card p-4 shadow-[var(--surface-frame-shadow)] sm:p-5", className)}>
      <div className="space-y-1">
        <h1 className="text-page-title text-foreground">{title}</h1>
      </div>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
