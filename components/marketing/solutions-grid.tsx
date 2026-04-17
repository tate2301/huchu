"use client";

import Link from "next/link";
import { useState } from "react";

import { ArrowRight } from "@/lib/icons";
import { solutionPages } from "@/components/marketing/marketing-data";
import { StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import styles from "@/components/marketing/marketing-site.module.css";

const filters = [
  { key: "all", label: "All" },
  { key: "high-control", label: "High-control ops" },
  { key: "retail", label: "Retail" },
  { key: "schools", label: "Schools" },
  { key: "services", label: "Services" },
  { key: "multi-site", label: "Multi-site" },
] as const;

export function SolutionsGrid() {
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const filtered =
    activeFilter === "all"
      ? solutionPages
      : solutionPages.filter((s) => s.category === activeFilter);

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`${styles.filterChip} ${activeFilter === f.key ? styles.filterChipActive : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <StaggerChildren staggerDelay={0.06} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((solution) => {
          const Icon = solution.icon;

          return (
            <StaggerItem key={solution.slug}>
              <Link
                href={`/home/solutions/${solution.slug}`}
                className={`${styles.verticalCard} group block transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(29,39,79,0.1)]`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                    <Icon className="size-5" />
                  </div>
                  <span className="rounded-full border border-[#d8e0f2] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d7ea8]">
                    {solution.navLabel}
                  </span>
                </div>

                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7383a9]">{solution.eyebrow}</p>
                <p className="mt-2 text-[1.18rem] font-semibold leading-[1.26] tracking-[-0.03em] text-[#0f1f55]">
                  {solution.headline}
                </p>
                <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{solution.summary}</p>

                <div className="mt-5 grid gap-2">
                  {solution.fitSignals.map((signal) => (
                    <div key={signal} className="flex items-start gap-2 text-sm leading-6 text-[#31436f]/82">
                      <span className="mt-2 size-1.5 rounded-full bg-[#5d64ff]" aria-hidden="true" />
                      <span>{signal}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {solution.modules.slice(0, 3).map((module) => (
                    <span key={module} className={styles.productChip}>
                      {module}
                    </span>
                  ))}
                </div>

                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#0f1f55]">
                  View solution
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            </StaggerItem>
          );
        })}
      </StaggerChildren>
    </section>
  );
}
