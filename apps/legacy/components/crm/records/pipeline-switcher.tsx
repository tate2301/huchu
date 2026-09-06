"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/lib/icons";
import { fetchCrmPipelines } from "@/lib/crm/crm-v2";

/**
 * One control for "which pipeline am I looking at" — the same trigger on
 * leads and on deals.
 *
 * A pipeline is a different shape of work, not a filter over one shape, so
 * picking one swaps the whole board. Leads are a pipeline too — the fixed
 * intake one — which is why they appear in this menu rather than being a
 * place this menu cannot take you. Crossing between them navigates; staying
 * within deals just swaps the board.
 */
export function PipelineSwitcher({
  active,
  onPickPipeline,
  onPick,
}: {
  /** "leads", or the active deal pipeline's id. */
  active: "leads" | string | null;
  /**
   * Called with a deal pipeline id when the surface can swap in place
   * (the deals page). Omitted, the menu navigates instead (the leads page).
   */
  onPickPipeline?: (pipelineId: string) => void;
  /**
   * The unified workspace's handler: it can swap between leads and any deal
   * pipeline without a navigation, so the menu never leaves the page.
   */
  onPick?: (target: "leads" | string) => void;
}) {
  const pipelinesQuery = useQuery({
    queryKey: ["crm", "pipelines"],
    queryFn: () => fetchCrmPipelines(),
  });
  const pipelines = pipelinesQuery.data?.data ?? [];

  const activePipeline =
    active !== "leads" ? pipelines.find((pipeline) => pipeline.id === active) : undefined;
  const triggerLabel =
    active === "leads" ? "Leads" : (activePipeline?.name ?? "Pipeline");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {triggerLabel}
          <ChevronDown className="size-3 text-[var(--text-muted)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {onPick ? (
          <DropdownMenuItem onClick={() => onPick("leads")}>
            Leads
            {active === "leads" ? (
              <span className="ml-2 text-sm text-[var(--text-muted)]">current</span>
            ) : null}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/crm/leads" aria-current={active === "leads" ? "true" : undefined}>
              Leads
              {active === "leads" ? (
                <span className="ml-2 text-sm text-[var(--text-muted)]">current</span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {pipelines.map((pipeline) =>
          onPick || onPickPipeline ? (
            <DropdownMenuItem
              key={pipeline.id}
              onClick={() => (onPick ? onPick(pipeline.id) : onPickPipeline?.(pipeline.id))}
            >
              {pipeline.name}
              {pipeline.id === active ? (
                <span className="ml-2 text-sm text-[var(--text-muted)]">current</span>
              ) : pipeline.isDefault ? (
                <span className="ml-2 text-sm text-[var(--text-muted)]">default</span>
              ) : null}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={pipeline.id} asChild>
              <Link href={`/crm/deals?pipeline=${pipeline.id}`}>
                {pipeline.name}
                {pipeline.isDefault ? (
                  <span className="ml-2 text-sm text-[var(--text-muted)]">default</span>
                ) : null}
              </Link>
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/crm/settings?tab=pipelines">Manage pipelines</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
