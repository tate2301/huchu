"use client";

import { Fingerprint, ShieldCheck, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAdminShell } from "./admin-shell-context";

function ContextTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-4 py-3">
      <div className="rounded-xl bg-[var(--surface-muted)] p-2 text-[var(--text-muted)]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
        <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{value}</p>
        {detail ? <p className="truncate text-xs text-[var(--text-muted)]">{detail}</p> : null}
      </div>
    </div>
  );
}

export function AdminOperatorContext() {
  const { activeCompany, activeScope, actorEmail, actorLabel, roleLabel } = useAdminShell();

  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-4">
      <ContextTile icon={UserRound} label="Signed In" value={actorLabel} detail={actorEmail} />
      <ContextTile icon={ShieldCheck} label="Actor" value={actorEmail} detail={roleLabel} />
      <ContextTile
        icon={Users}
        label="Workspace"
        value={activeCompany?.name ?? "Platform"}
        detail={activeCompany ? activeCompany.slug ?? activeCompany.id : "Global control plane scope"}
      />
      <div className="flex min-w-0 items-start justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-[var(--surface-muted)] p-2 text-[var(--text-muted)]">
            <Fingerprint className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Access Mode</p>
            <p className="text-sm font-semibold text-[var(--text-strong)]">Direct operator</p>
            <p className="text-xs text-[var(--text-muted)]">
              {activeScope === "platform" ? "No impersonation session active" : "Workspace ready for support or impersonation actions"}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
          {activeScope === "platform" ? "Platform" : "Organization"}
        </Badge>
      </div>
    </section>
  );
}
