import type { ReactNode } from "react";

import { StandingBadge } from "@/components/admin/standing-badge";
import { standingDetail } from "@/lib/admin/standing";
import { formatDate, formatMoney, formatWhen } from "@/lib/admin/format";
import type { WorkspaceSummary } from "@/lib/admin/workspaces";
import { getPlatformRootDomain } from "@/lib/admin/hosts";
import { verticalCharge } from "@/lib/platform/verticals";

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 t-body-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-[var(--text-muted)]">{term}</dt>
          <dd className="min-w-0 break-words text-[var(--text-body)]">{value ?? <span className="text-[var(--text-faint)]">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-[var(--line)] pb-5 last:border-b-0">
      <h2 className="t-section text-[var(--ink)]">{title}</h2>
      {children}
    </section>
  );
}

/** Where a workspace stands, what it pays and when, who owns it, and what it is: the facts beside its history. */
export function WorkspaceRail({ workspace }: { workspace: WorkspaceSummary }) {
  const detail = standingDetail(workspace.standing);
  const root = getPlatformRootDomain();
  const price = verticalCharge(workspace.verticals.length, workspace.members);
  const { standing, until } = workspace.standing;
  // When the money next turns: a renewal, a trial's end, or the day grace runs out.
  const renewal: [string, ReactNode] =
    standing === "Trial"
      ? ["Trial ends", formatDate(until)]
      : standing === "Past due"
        ? ["Read-only from", formatDate(until)]
        : ["Renews", standing === "Active" ? formatDate(until) : null];
  return (
    <aside aria-label={`About ${workspace.name}`} className="space-y-5">
      <Section title="Standing">
        <div className="flex items-baseline justify-between gap-3">
          <StandingBadge reading={workspace.standing} />
          {detail ? <span className="t-body-sm text-[var(--text-muted)]">{detail}</span> : null}
        </div>
        <Facts
          rows={[
            [
              "Pays",
              <span key="p">
                <span className="font-mono tabular-nums">{formatMoney(price.total)}</span> a month
                {price.verticals > 0 ? (
                  <span className="block text-[var(--text-muted)]">
                    {price.verticals} {price.verticals === 1 ? "vertical" : "verticals"} at{" "}
                    <span className="font-mono tabular-nums">{formatMoney(price.each)}</span>
                  </span>
                ) : null}
              </span>,
            ],
            renewal,
            ["Verticals", workspace.verticals.length > 0 ? workspace.verticals.map((vertical) => vertical.label).join(", ") : null],
            ["Members", <span key="m" className="font-mono tabular-nums">{workspace.members}</span>],
            ["Last sign-in", formatWhen(workspace.lastSignInAt)],
          ]}
        />
      </Section>
      <Section title="Owner">
        <Facts
          rows={[
            ["Name", workspace.owner?.name],
            ["Email", workspace.owner?.email ? <a href={`mailto:${workspace.owner.email}`} className="font-mono text-[var(--text-link)] hover:underline">{workspace.owner.email}</a> : null],
            ["Phone", workspace.owner?.phone ? <span className="font-mono">{workspace.owner.phone}</span> : null],
          ]}
        />
      </Section>
      <Section title="Details">
        <Facts
          rows={[
            ["Address", <span key="a" className="font-mono">{root ? `${workspace.slug}.${root}` : workspace.slug}</span>],
            ["Product", workspace.profile ? `${workspace.productName}, ${workspace.profile.toLowerCase()}` : workspace.productName],
            ["Set up", formatDate(workspace.createdAt)],
          ]}
        />
      </Section>
    </aside>
  );
}
