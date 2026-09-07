"use client";

import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@corelithzw/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { fetchJson } from "@corelithzw/platform/api-client";
import { cn } from "@corelithzw/ui/lib/utils";

type Member = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

/** Any more than this and the stack stops being scannable and starts being a smear. */
const SHOWN = 4;

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Manager",
  CLERK: "Sales",
  OPERATOR: "Field",
  VIEWER: "Read only",
};

/**
 * Who else is in here — the stacked faces at the top of every CRM screen.
 *
 * A CRM is a shared book: knowing there are four other people writing in it,
 * and who they are, changes how you use it. The stack is a real button that
 * opens the roster, so the information is reachable without a hover and on a
 * touch screen.
 */
export function CrmMembers({ className }: { className?: string }) {
  const membersQuery = useQuery({
    queryKey: ["crm", "team"],
    // Shared with the lead filters' owner picker, so opening a CRM page warms
    // the cache the pickers read.
    queryFn: () => fetchJson<{ data: Member[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60 * 1000,
  });

  const members = membersQuery.data?.data ?? [];
  if (members.length === 0) return null;

  const shown = members.slice(0, SHOWN);
  const overflow = members.length - shown.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center rounded-full pr-0.5 transition-opacity hover:opacity-80",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
            className,
          )}
          aria-label={`${members.length} people in this workspace`}
        >
          {shown.map((member, index) => (
            <span
              key={member.id}
              className={cn(
                "rounded-full ring-2 ring-[var(--surface-base)]",
                index > 0 && "-ml-2",
              )}
            >
              <Avatar size="sm" name={member.name ?? member.email ?? "?"} />
            </span>
          ))}
          {overflow > 0 ? (
            <span className="-ml-2 flex size-7 items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-medium text-[var(--text-muted)] ring-2 ring-[var(--surface-base)]">
              +{overflow}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[16rem] p-1">
        <p className="px-2 py-1.5 text-sm font-medium text-[var(--text-subtle)]">
          {members.length} in this workspace
        </p>
        <ul className="max-h-72 overflow-y-auto">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5">
              <Avatar size="sm" name={member.name ?? member.email ?? "?"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {member.name ?? member.email ?? "Unnamed"}
                </span>
                <span className="block truncate text-sm text-[var(--text-muted)]">
                  {ROLE_LABELS[member.role] ?? member.role}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
