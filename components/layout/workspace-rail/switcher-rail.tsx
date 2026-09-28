"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "@/lib/icons";
import { Check } from "@/lib/icons";
import type { WorkspaceOption } from "@/lib/workspaces";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import styles from "./workspace-rail.module.css";

export type RailMark = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  active?: boolean;
  alert?: boolean;
};

/**
 * The company mark's face: the branding logo when the workspace has one, the
 * initials when it does not — or when the logo will not load, since a broken
 * image in the rail's top corner is worse than the letters it replaced.
 */
function CompanyMark({
  initials,
  logoUrl,
}: {
  initials: string;
  logoUrl?: string | null;
}) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  if (!logoUrl || failedUrl === logoUrl) return <>{initials}</>;

  // A tenant's logo is an arbitrary URL, not one `next/image` can list.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={styles.companyLogo}
      onError={() => setFailedUrl(logoUrl)}
    />
  );
}

/**
 * Tier one: the column the rail is navigated by.
 *
 * Every mark here is unlabelled, so every one of them carries an accessible
 * name and a tooltip. An icon with neither is a memory test.
 */
export function SwitcherRail({
  companyInitials,
  companyLogoUrl,
  companyLabel,
  onCompanyClick,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  groups,
  person,
}: {
  companyInitials: string;
  /** The workspace's branding logo. Drawn in place of the initials when set. */
  companyLogoUrl?: string | null;
  companyLabel: string;
  onCompanyClick?: () => void;
  /** The workspaces to switch between. Fewer than two draws no switcher. */
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string;
  onSelectWorkspace?: (id: string) => void;
  groups: RailMark[][];
  person: React.ReactNode;
}) {
  // One workspace is not a choice, and a control that offers one is a control
  // that teaches people it does nothing.
  const canSwitch = (workspaces?.length ?? 0) > 1;

  return (
    <div className={styles.switcher}>
      <div className={styles.company}>
        {canSwitch ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${companyLabel} — switch workspace`}
                className={styles.companyMark}
              >
                <CompanyMark initials={companyInitials} logoUrl={companyLogoUrl} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              /* Width and padding as utilities: `PopoverContent` sets `w-72`
                 and `.popover` sets 16px of its own, and `cn()` only merges
                 Tailwind classes — a module class would be left to win on
                 stylesheet order. */
              className={cn("w-52 p-1.5", styles.workspaceMenu)}
            >
              {/* The company, once, above its businesses. The rows below are
                  named for the business rather than the company, so without
                  this the menu never says whose they are. */}
              <p className={styles.workspaceMenuTitle}>{companyLabel}</p>
              <ul className={styles.rows}>
                {workspaces!.map((workspace) => {
                  const active = workspace.id === activeWorkspaceId;
                  return (
                    <li key={workspace.id}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => onSelectWorkspace?.(workspace.id)}
                        className={cn(
                          styles.row,
                          styles.rowButton,
                          active && styles.rowActive,
                        )}
                      >
                        <workspace.icon
                          width={16}
                          height={16}
                          className={styles.rowIcon}
                        />
                        <span className={styles.rowLabel}>
                          {workspace.label}
                        </span>
                        {active ? (
                          <Check width={14} height={14} className={styles.rowIcon} />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={companyLabel}
                className={styles.companyMark}
                onClick={onCompanyClick}
              >
                <CompanyMark initials={companyInitials} logoUrl={companyLogoUrl} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{companyLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <nav className={styles.marks} aria-label="Areas">
        {groups
          .filter((group) => group.length > 0)
          .map((group, index) => (
            <React.Fragment key={group.map((m) => m.id).join("|")}>
              {index > 0 ? <span className={styles.divider} /> : null}
              <ul className={styles.markList}>
                {group.map((mark) => (
                  <li key={mark.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={mark.href}
                          aria-label={mark.label}
                          aria-current={mark.active ? "true" : undefined}
                          className={cn(
                            styles.slot,
                            styles.slotWrap,
                            mark.active && styles.slotActive,
                          )}
                        >
                          <mark.icon width={17} height={17} />
                          {mark.alert ? (
                            <span className={styles.markAlert} />
                          ) : null}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{mark.label}</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </React.Fragment>
          ))}
      </nav>

      <div className={styles.person}>{person}</div>
    </div>
  );
}
