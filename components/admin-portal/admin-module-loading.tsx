"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AdminModuleLoadingProps = {
  label?: string;
  description?: string;
  tips?: string[];
  className?: string;
};

export function AdminModuleLoading({
  label = "Loading admin module",
  tips: _tips,
  className,
}: AdminModuleLoadingProps) {
  return (
    <section className={cn("admin-page", className)} aria-busy="true">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none space-y-6 p-5 opacity-45 md:p-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-40 max-w-full" />
            <Skeleton className="h-10 w-72 max-w-full" />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-32 rounded-[var(--radius-lg)]"
              />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-12 rounded-[var(--radius-lg)]"
                />
              ))}
            </div>

            <div className="space-y-3">
              <Skeleton className="h-12 rounded-[var(--radius-lg)]" />
              <Skeleton className="h-[24rem] rounded-[var(--radius-lg)]" />
            </div>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-[rgb(252_252_251_/_0.72)] px-4 backdrop-blur-[1.5px]">
          <div
            className="flex flex-col items-center gap-3 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-7 w-7 animate-spin text-[var(--primary-600)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
