import type { Metadata } from "next";

import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { solutionStories } from "@/components/marketing/marketing-data";
import styles from "@/components/marketing/marketing-site.module.css";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "See how Avenra supports gold, schools, retail, and platform-admin operations with sector-specific workflows on a shared control plane.",
};

export default function SolutionsPage() {
  return (
    <MarketingSubpageShell
      title="Sector solutions built as rows, not disconnected products."
      description="Each story runs on the same platform foundation so operations, reporting, and finance stay aligned as you scale."
    >
      <section className="space-y-18">
        {solutionStories.map((row, index) => (
          <div
            key={row.eyebrow}
            className={`${styles.stripeRow} ${index % 2 === 1 ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}
          >
            <div>
              <p className={styles.stripeEyebrow}>{row.eyebrow}</p>
              <h2 className="mt-3 text-[clamp(2rem,3.6vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#0b1945] text-balance">
                {row.title}
              </h2>
              <p className="mt-5 text-base leading-8 text-[#2d3d66]/82">{row.copy}</p>
              <ul className={`${styles.simpleList} mt-6`}>
                {row.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            <div className={styles.stripeVisual}>
              <div className={styles.stripeVisualHead}>
                <span />
                <span />
                <span />
              </div>
              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border-b border-[#dce4f7] pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b88af]">Module</p>
                    <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#102252]">{row.eyebrow}</p>
                  </div>
                  <div className="border-b border-[#dce4f7] pb-3 sm:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b88af]">Status</p>
                    <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#102252]">Live workflow</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className={`${styles.stripeLine} ${styles.stripeLineLong}`} />
                  <div className={`${styles.stripeLine} ${styles.stripeLineShort}`} />
                  <div className={`${styles.stripeLine} ${styles.stripeLineMedium}`} />
                  <div className={`${styles.stripeLine} ${styles.stripeLineLong}`} />
                  <div className={`${styles.stripeLine} ${styles.stripeLineShort}`} />
                  <div className={`${styles.stripeLine} ${styles.stripeLineMedium}`} />
                </div>
                <div className="grid gap-3 border-t border-[#dce4f7] pt-4 sm:grid-cols-3">
                  {row.points.map((point) => (
                    <div key={point} className="text-sm leading-6 text-[#324774]/78">
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>
    </MarketingSubpageShell>
  );
}
