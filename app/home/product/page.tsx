import type { Metadata } from "next";

import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { proofStats, productSteps, trustClaims, valuePillars } from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Product",
  description:
    "Explore the Avenra product model: one shared control plane for operations, finance, reporting, and governance across multiple vertical packs.",
};

export default function ProductPage() {
  return (
    <MarketingSubpageShell
      title="One shared control plane for operations, finance, and governance."
      description="The product is designed for multi-site operators who need sector workflows and financial integrity in the same system instead of disconnected apps."
    >
      <section className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-5">
          <p className={styles.stripeEyebrow}>How it works</p>
          <h2 className="text-[clamp(2rem,4vw,3.6rem)] font-semibold leading-[0.97] tracking-[-0.05em] text-[#0b1945] text-balance">
            Start with one pack, then expand without replacing your stack.
          </h2>
        </div>
        <div className="space-y-5">
          {productSteps.map((item, index) => (
            <div key={item} className="flex gap-4 border-t border-[#d6def5] pt-4 first:border-t-0 first:pt-0">
              <span className="font-mono text-xs font-semibold tracking-[0.18em] text-[#7080a7]">
                0{index + 1}
              </span>
              <p className="text-lg leading-8 text-[#1f2d52]">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <div className={styles.statBand}>
          {proofStats.map((entry) => (
            <div key={entry.label} className={styles.statCell}>
              <strong>{entry.value}</strong>
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-10 md:grid-cols-2 xl:grid-cols-4">
        {valuePillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div key={pillar.title} className="border-t border-[#d6def5] pt-5">
              <div className="flex size-11 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                <Icon className="size-5" />
              </div>
              <p className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#0f1f55]">{pillar.title}</p>
              <p className="mt-3 text-sm leading-7 text-[#2d3d66]/80">{pillar.description}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className={styles.stripeEyebrow}>Live proof</p>
          <h3 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#0b1945] text-balance">
            Claims anchored to shipped capability.
          </h3>
        </div>
        <div className="space-y-3">
          {trustClaims.map((claim) => (
            <p key={claim} className="border-t border-[#d6def5] pt-3 text-sm leading-7 text-[#2d3d66]/82">
              {claim}
            </p>
          ))}
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
