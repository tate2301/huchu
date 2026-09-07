"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { PageActions } from "@corelithzw/ui/layout/page-actions";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { SectionTab, SectionTabs } from "@corelithzw/ui/components/section-tabs";
import { retailRailFor, type RetailAreaId } from "../areas";

type RetailShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * The area this page belongs to, for a route the rail cannot resolve on its
   * own — `/retail/sales/{id}` and the other three detail pages. A list screen
   * never needs it: its own path is the answer.
   */
  area?: RetailAreaId;
  children: ReactNode;
};

/**
 * The retail page frame.
 *
 * `description` is forwarded to `PageHeading`, which renders it in the design
 * system's `lede` slot. It used to be accepted and dropped — the same bug
 * `PageHeading` itself carried until it was fixed for the 73 pages that use it
 * directly, and which survived here because this shell sits in between. Five
 * setup screens had written explanatory copy that never reached a user.
 *
 * ── R-4.7: the rail ────────────────────────────────────────────────────────
 *
 * "`RetailShell` earns its name — tab rail, like `GoldShell` and
 * `PayrollShell`." Until now it was a title and a slot. S-5 had already banded
 * the sidebar, so this is not rescuing a flat list — it is the second click:
 * moving between POS policy and Accounting Setup meant finding the group,
 * expanding it, and reading five entries.
 *
 * The rail is **derived**, not declared. `lib/retail/areas.ts` groups the hrefs
 * `lib/navigation.ts` already owns, and a test asserts the two agree in both
 * directions. That matters: R-4.6 deleted `RETAIL_TABS` because retail had two
 * navigation definitions that could disagree, and a rail built from its own
 * list would have put the second one straight back.
 *
 * No rail is shown for a single-screen area. One tab is not navigation — it is
 * a label the heading above already carries, and on a laptop it costs a row of
 * the vertical space the tables below need.
 *
 * ── Actions ────────────────────────────────────────────────────────────────
 *
 * The composition contract allows at most three, exactly one primary. This
 * shell cannot enforce that from a `ReactNode`, and pretending otherwise with a
 * `Children.count` check would refuse a legitimate fragment while missing a
 * `<div>` holding six buttons. `lib/retail/areas.test.ts` counts them in the
 * source instead, where a fragment and a wrapper look the same.
 */
export function RetailShell({ title, description, actions, area, children }: RetailShellProps) {
  const pathname = usePathname();
  const rail = retailRailFor(pathname ?? "", area);

  return (
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} className="mb-2" />

      {rail ? (
        <SectionTabs label={`${rail.area.label} navigation`}>
          {rail.area.screens.map((screen) => (
            <SectionTab key={screen.href} to={screen.href} active={screen.href === rail.activeHref}>
              {screen.label}
            </SectionTab>
          ))}
        </SectionTabs>
      ) : null}

      <div className="space-y-4">{children}</div>
    </div>
  );
}
