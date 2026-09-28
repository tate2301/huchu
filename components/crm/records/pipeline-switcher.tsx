"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/lib/icons";
import { registerHref } from "@/lib/crm/registers/href";
import { usePipelines } from "@/components/crm/registers/register-data";

/**
 * The leads page's way across to the deal pipelines.
 *
 * Leads are a pipeline too — the fixed intake one — so the menu that names
 * them lists the deal pipelines beside them; picking one opens that
 * pipeline's board on the deals page, whose own pipeline filter lists Leads
 * the same way to come back.
 */
export function PipelineSwitcher() {
  const pipelines = (usePipelines().data ?? []).filter((pipeline) => pipeline.isActive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Leads
          <ChevronDown className="size-3 text-[var(--text-muted)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuItem asChild>
          <Link href="/crm/leads" aria-current="true">
            Leads
            <span className="ml-2 text-sm text-[var(--text-muted)]">current</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {pipelines.map((pipeline) => (
          <DropdownMenuItem key={pipeline.id} asChild>
            <Link href={registerHref("DEAL", { filters: { pipeline: [pipeline.id] }, layout: "BOARD" })}>
              {pipeline.name}
              {pipeline.isDefault ? <span className="ml-2 text-sm text-[var(--text-muted)]">default</span> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/crm/settings?tab=pipelines">Manage pipelines</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
