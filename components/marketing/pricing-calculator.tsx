"use client";

import { useMemo, useState } from "react";

import { Minus, Plus } from "@/lib/icons";
import {
  BUNDLE_DEPENDENCIES,
  TIERS,
} from "@/lib/platform/feature-catalog";
import {
  calculatorAddOns,
  calculatorVerticals,
  tierComparisonRows,
} from "@/components/marketing/marketing-data";
import { CountUp, Reveal, StaggerChildren, StaggerItem } from "@/components/marketing/motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

const tierRank: Record<string, number> = {
  Basic: 1,
  Standard: 2,
  Enterprise: 3,
};

export function PricingCalculator() {
  const [siteCount, setSiteCount] = useState(1);
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  const recommendedTierName = useMemo(() => {
    if (selectedVerticals.length === 0) return "Basic";
    const matched = calculatorVerticals.filter((v) => selectedVerticals.includes(v.slug));
    const maxRank = Math.max(...matched.map((v) => tierRank[v.recommendedTier]));
    const entry = Object.entries(tierRank).find(([, r]) => r === maxRank);
    return (entry?.[0] ?? "Basic") as "Basic" | "Standard" | "Enterprise";
  }, [selectedVerticals]);

  const tier = TIERS.find((t) => t.name === recommendedTierName)!;

  // Auto-select default add-ons from chosen verticals
  const defaultAddOns = useMemo(() => {
    const set = new Set<string>();
    calculatorVerticals
      .filter((v) => selectedVerticals.includes(v.slug))
      .forEach((v) => v.defaultAddOns.forEach((a) => set.add(a)));
    return Array.from(set);
  }, [selectedVerticals]);

  // Merge user-selected with defaults, then enforce dependencies
  const effectiveAddOns = useMemo(() => {
    const set = new Set<string>([...defaultAddOns, ...selectedAddOns]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const code of Array.from(set)) {
        const deps = BUNDLE_DEPENDENCIES[code] ?? [];
        for (const dep of deps) {
          if (!set.has(dep)) {
            set.add(dep);
            changed = true;
          }
        }
      }
    }
    return Array.from(set);
  }, [defaultAddOns, selectedAddOns]);

  const toggleVertical = (slug: string) => {
    setSelectedVerticals((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const toggleAddOn = (code: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const siteOverage = Math.max(0, siteCount - tier.includedSites) * tier.additionalSiteMonthlyPrice;
  const addOnTotal = effectiveAddOns.reduce((sum, code) => {
    const addOn = calculatorAddOns.find((a) => a.code === code);
    if (!addOn) return sum;
    return sum + addOn.base + addOn.perSite * siteCount;
  }, 0);
  const grandTotal = tier.monthlyPrice + siteOverage + addOnTotal;

  const groupedAddOns = useMemo(() => {
    const map: Record<string, typeof calculatorAddOns> = {};
    for (const addOn of calculatorAddOns) {
      map[addOn.category] = map[addOn.category] || [];
      map[addOn.category].push(addOn);
    }
    return map;
  }, []);

  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.38fr]">
        <div className="space-y-8">
          <div className={styles.pricingEstimator}>
            <p className={styles.stripeEyebrow}>Sites</p>
            <div className="mt-4 flex items-center gap-4">
              <div className={styles.stepper}>
                <button
                  className={styles.stepperButton}
                  onClick={() => setSiteCount((s) => Math.max(1, s - 1))}
                  aria-label="Decrease sites"
                >
                  <Minus className="size-4" />
                </button>
                <span className={styles.stepperValue}>{siteCount}</span>
                <button
                  className={styles.stepperButton}
                  onClick={() => setSiteCount((s) => s + 1)}
                  aria-label="Increase sites"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <p className="text-sm text-[#31436f]/80">
                {siteCount === 1 ? "1 site" : `${siteCount} sites`}
              </p>
            </div>
          </div>

          <div>
            <p className={styles.stripeEyebrow}>Verticals</p>
            <StaggerChildren staggerDelay={0.05} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {calculatorVerticals.map((v) => {
                const Icon = v.icon;
                const selected = selectedVerticals.includes(v.slug);
                return (
                  <StaggerItem key={v.slug}>
                    <button
                      onClick={() => toggleVertical(v.slug)}
                      className={`w-full text-left ${styles.verticalSelectorCard} ${selected ? styles.verticalSelectorCardSelected : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-[#0f1f55] text-white">
                          <Icon className="size-4" />
                        </div>
                        <span className="text-sm font-semibold text-[#0f1f55]">{v.title}</span>
                      </div>
                      <span className="text-xs text-[#7383a9]">Recommended: {v.recommendedTier}</span>
                    </button>
                  </StaggerItem>
                );
              })}
            </StaggerChildren>
          </div>

          <div>
            <p className={styles.stripeEyebrow}>Add-ons</p>
            <div className="mt-4 space-y-5">
              {Object.entries(groupedAddOns).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7383a9]">{category}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((addOn) => {
                      const checked = effectiveAddOns.includes(addOn.code);
                      const isDependency = checked && !selectedAddOns.includes(addOn.code) && !defaultAddOns.includes(addOn.code);
                      return (
                        <label
                          key={addOn.code}
                          className={`${styles.addOnCheckbox} ${checked ? styles.addOnCheckboxSelected : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAddOn(addOn.code)}
                            disabled={isDependency}
                            className="size-4"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0f1f55]">{addOn.name}</p>
                            <p className="text-xs text-[#7383a9]">
                              ${addOn.base}/mo + ${addOn.perSite}/site
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <div className={styles.summaryPanel}>
            <p className={styles.stripeEyebrow}>Estimate</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#31436f]/80">Tier</span>
                <span className="rounded-full bg-[#eef2ff] px-2.5 py-0.5 text-xs font-semibold text-[#0f1f55]">
                  {tier.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#31436f]/80">Base</span>
                <span className="font-mono text-sm text-[#0b1945]">${tier.monthlyPrice.toLocaleString()}/mo</span>
              </div>
              {siteOverage > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#31436f]/80">Site overage</span>
                  <span className="font-mono text-sm text-[#0b1945]">${siteOverage.toLocaleString()}/mo</span>
                </div>
              )}
              {effectiveAddOns.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#31436f]/80">Add-ons</span>
                  <span className="font-mono text-sm text-[#0b1945]">${addOnTotal.toLocaleString()}/mo</span>
                </div>
              )}
            </div>
            <div className="mt-5 border-t border-[#e2e8f6] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7383a9]">Estimated monthly</p>
              <div className={styles.summaryPrice}>
                <CountUp value={grandTotal} prefix="$" />
              </div>
            </div>
            <div className="mt-5">
              <Button asChild className="w-full rounded-full">
                <Link href="/home/book-demo">Book a demo with this estimate</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="overflow-x-auto">
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Basic</th>
                <th>Standard</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {tierComparisonRows.map((row) => (
                <tr key={row.label}>
                  <td className="font-medium text-[#0f1f55]">{row.label}</td>
                  <td>{row.basic}</td>
                  <td>{row.standard}</td>
                  <td>{row.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
