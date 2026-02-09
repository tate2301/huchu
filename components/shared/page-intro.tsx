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
  return (
    <section className={cn("rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div className="space-y-2">
        <h1 className="text-page-title text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{purpose}</p>
        {nextStep ? (
          <p className="text-sm font-medium text-foreground">
            Next: <span className="font-normal">{nextStep}</span>
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
