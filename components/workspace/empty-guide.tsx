import "./empty-guide.css";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/workspace/button";
import * as Icons from "@/lib/icons";
import type { EmptyGuideSpec } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ "aria-hidden"?: boolean }>;

/**
 * EmptyGuide (00-foundations 5.12.2) — what a list shows in place of its
 * table until it has ever had a row.
 *
 * With steps (Guided board): a question, one line, three numbered sentences
 * whose first clause is bold, then the first thing to do and an optional
 * second. Without (TenderUI board): the list's own icon on a tray tile beside
 * a statement, one line and the primary. The hrefs are resolved by the
 * caller, which knows the page a sheet opens over.
 */
export function EmptyGuide({
  guide,
  primaryHref,
  className,
}: {
  guide: EmptyGuideSpec;
  primaryHref: string | null;
  className?: string;
}) {
  const titleId = React.useId();
  const primary = guide.primary && primaryHref ? { label: guide.primary.label, href: primaryHref } : null;

  if (guide.steps?.length) {
    return (
      <section className={cn("cx-eg cx-eg--steps", className)} aria-labelledby={titleId}>
        <div className="cx-eg__head">
          <h2 id={titleId} className="cx-eg__title">
            {guide.title}
          </h2>
          <p className="cx-eg__line">{guide.line}</p>
        </div>
        <ol className="cx-eg__steps">
          {guide.steps.map(([bold, rest], index) => (
            <li key={bold} className="cx-eg__step">
              <span className="cx-eg__num" aria-hidden="true">
                {index + 1}
              </span>
              <span className="cx-eg__sentence">
                <strong>{bold}</strong> <span className="cx-eg__rest">{rest}</span>
              </span>
            </li>
          ))}
        </ol>
        {primary || guide.secondary ? (
          <div className="cx-eg__actions">
            {primary ? (
              <Button asChild variant="primary" size="field">
                <Link href={primary.href}>{primary.label}</Link>
              </Button>
            ) : null}
            {guide.secondary ? (
              <Button asChild size="field">
                <Link href={guide.secondary.href}>{guide.secondary.label}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  const Icon = guide.icon ? (Icons as unknown as Record<string, IconComponent | undefined>)[guide.icon] : undefined;
  return (
    <section className={cn("cx-eg", className)} aria-labelledby={titleId}>
      {Icon ? (
        <span className="cx-eg__icon">
          <Icon aria-hidden />
        </span>
      ) : null}
      <div className="cx-eg__body">
        <h2 id={titleId} className="cx-eg__statement">
          {guide.title}
        </h2>
        <p className="cx-eg__line">{guide.line}</p>
        {primary || guide.secondary ? (
          <div className="cx-eg__actions">
            {primary ? (
              <Button asChild variant="primary">
                <Link href={primary.href}>
                  <Icons.Plus aria-hidden />
                  {primary.label}
                </Link>
              </Button>
            ) : null}
            {guide.secondary ? (
              <Button asChild>
                <Link href={guide.secondary.href}>{guide.secondary.label}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
