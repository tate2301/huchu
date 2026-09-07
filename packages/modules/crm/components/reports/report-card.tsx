"use client";

import type { ReactNode } from "react";

import { Card, Chip } from "@corelithzw/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { Building2, CopyLink, DotsThree, Funnel, History, RotateCcw, Users } from "@corelithzw/ui/lib/icons";
import type { Accent } from "@corelithzw/react";

/**
 * One report, in its frame.
 *
 * Every card says which records it is counting, because "win rate" means one
 * thing over deals and another over leads, and a reader who has to guess will
 * eventually guess wrong in a meeting.
 *
 * Refresh sits on the card rather than only in the header: somebody staring at
 * one number wants that number re-fetched, and hunting for a page-level button
 * to do it is the kind of small friction that ends in a hard reload.
 */

export type ReportEntity = "deal" | "lead" | "person" | "company" | "activity";

/** The same icons the sidebar uses, so a chip reads as the nav entry it names. */
const ENTITY: Record<ReportEntity, { label: string; accent: Accent; icon: typeof Funnel }> = {
  deal: { label: "Deals", accent: "violet", icon: Funnel },
  lead: { label: "Leads", accent: "blue", icon: Funnel },
  person: { label: "People", accent: "teal", icon: Users },
  company: { label: "Companies", accent: "amber", icon: Building2 },
  activity: { label: "Activity", accent: "green", icon: History },
};

export function EntityChip({ entity }: { entity: ReportEntity }) {
  const { label, accent, icon: Icon } = ENTITY[entity];
  return (
    // A span, not the chip's default button: it says where the figures came
    // from, it does not filter. Something that looks pressable and isn't is
    // worse than a plain label.
    <Chip asChild accent={accent} leading={<Icon className="size-3.5" aria-hidden="true" />}>
      <span>{label}</span>
    </Chip>
  );
}

export function ReportCard({
  title,
  subtitle,
  entity,
  onRefresh,
  refreshing,
  /** Rows to copy when somebody wants these figures in a spreadsheet. */
  copyRows,
  onRemove,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  entity: ReportEntity;
  onRefresh: () => void;
  refreshing?: boolean;
  copyRows?: () => string[][];
  onRemove?: () => void;
  children: ReactNode;
}) {
  const { toast } = useToast();

  const copy = async () => {
    if (!copyRows) return;
    const text = copyRows()
      .map((row) => row.join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Paste straight into a spreadsheet." });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "The browser refused clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-[var(--text-strong)]">{title}</span>
          <EntityChip entity={entity} />
        </span>
      }
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            aria-label={`Refresh ${title}`}
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RotateCcw className={refreshing ? "animate-spin" : undefined} />
          </IconButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" aria-label={`${title} options`}>
                <DotsThree />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {copyRows ? (
                <DropdownMenuItem onClick={copy}>
                  <CopyLink className="size-4" />
                  Copy figures
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onRefresh}>
                <RotateCcw className="size-4" />
                Refresh
              </DropdownMenuItem>
              {onRemove ? (
                <DropdownMenuItem
                  className="text-[var(--status-error-text)]"
                  onClick={onRemove}
                >
                  Remove from this page
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {children}
    </Card>
  );
}
