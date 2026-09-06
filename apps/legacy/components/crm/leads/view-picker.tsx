"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { ChevronDown, DotsThree, Kanban, ListBullets, Plus, Users } from "@/lib/icons";
import {
  createCrmSavedView,
  deleteCrmSavedView,
  updateCrmSavedView,
  type CrmSavedViewRecord,
} from "@/lib/crm/crm-v2";
import type { LeadSort, LeadViewFilters } from "@/lib/crm/views";
import { cn } from "@/lib/utils";

export type ViewLayout = "TABLE" | "BOARD";

export type LeadView = {
  /** Null for the built-ins, which have no row of their own. */
  id: string | null;
  key: string;
  name: string;
  layout: ViewLayout;
  filters: LeadViewFilters;
  sort?: LeadSort | null;
  isShared?: boolean;
  /** Built-ins cannot be renamed or deleted. */
  builtIn: boolean;
};

/**
 * Views everyone gets, without anyone having to create them. Each carries the
 * layout it makes sense in: a pipeline is a board, a worklist is a list.
 */
export const BUILT_IN_VIEWS: LeadView[] = [
  { id: null, key: "all", name: "All leads", layout: "BOARD", filters: {}, builtIn: true },
  { id: null, key: "mine", name: "My leads", layout: "BOARD", filters: { mineOnly: true }, builtIn: true },
  {
    id: null,
    key: "open",
    name: "Open pipeline",
    layout: "BOARD",
    filters: { stages: ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT", "QUOTED", "INVOICED"] },
    builtIn: true,
  },
  {
    id: null,
    key: "overdue",
    name: "Needs attention",
    layout: "TABLE",
    filters: { overdueOnly: true },
    builtIn: true,
  },
];

export function savedViewToLeadView(view: CrmSavedViewRecord): LeadView {
  return {
    id: view.id,
    key: view.id,
    name: view.name,
    layout: view.viewType,
    filters: view.filters,
    sort: view.sort,
    isShared: view.isShared,
    builtIn: false,
  };
}

/**
 * The layout's mark. Colour carries which shape the view opens in, so the list
 * is readable before you get to the words — the same job the icons do in the
 * reference.
 */
function LayoutMark({ layout }: { layout: ViewLayout }) {
  const Icon = layout === "BOARD" ? Kanban : ListBullets;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-5 flex-none items-center justify-center rounded-[var(--radius-sm)] text-white",
        layout === "BOARD"
          ? "bg-[var(--tone-danger)]"
          : "bg-[var(--tone-success)]",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/**
 * One control for "which leads, and in what shape".
 *
 * Views and layout used to be two separate controls — a row of view pills and
 * a Table/Board switch — which let you put them in states nobody meant: a
 * board view showing as a table, a saved layout silently overridden. A view
 * now carries its own layout, so picking one is the whole decision.
 */
export function ViewPicker({
  views,
  activeKey,
  filters,
  sort,
  onSelect,
  onSaved,
}: {
  views: LeadView[];
  activeKey: string;
  /** What is on screen now, for "save these as a new view". */
  filters: LeadViewFilters;
  sort: LeadSort;
  onSelect: (view: LeadView) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<LeadView | null>(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [layout, setLayout] = useState<ViewLayout>("BOARD");

  const active = views.find((view) => view.key === activeKey) ?? views[0];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["crm", "saved-views"] });
    onSaved();
  };

  const fail = (error: unknown) =>
    toast({
      title: "Could not save the view",
      description: getApiErrorMessage(error),
      variant: "destructive",
    });

  const create = useMutation({
    mutationFn: () =>
      createCrmSavedView({
        name: name.trim(),
        viewType: layout,
        filters,
        sort,
        isShared: shared,
      }),
    onSuccess: (view) => {
      refresh();
      setCreating(false);
      onSelect(savedViewToLeadView(view));
      toast({ title: `Saved "${view.name}"` });
    },
    onError: fail,
  });

  const rename = useMutation({
    mutationFn: () => updateCrmSavedView(renaming!.id!, { name: name.trim() }),
    onSuccess: () => {
      refresh();
      setRenaming(null);
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (view: LeadView) =>
      updateCrmSavedView(view.id!, { filters, sort, viewType: view.layout }),
    onSuccess: () => {
      refresh();
      toast({ title: "View updated to match what you are looking at" });
    },
    onError: fail,
  });

  const share = useMutation({
    mutationFn: (view: LeadView) =>
      updateCrmSavedView(view.id!, { isShared: !view.isShared }),
    onSuccess: refresh,
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (view: LeadView) => deleteCrmSavedView(view.id!),
    onSuccess: () => {
      refresh();
      onSelect(views[0]);
    },
    onError: fail,
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="pr-2">
            <LayoutMark layout={active.layout} />
            <span className="max-w-40 truncate font-medium">{active.name}</span>
            <ChevronDown className="size-3 text-[var(--text-muted)]" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72 p-1">
          <p className="px-2 py-1.5 text-sm font-medium text-[var(--text-muted)]">Views</p>

          {views.map((view) => (
            <div
              key={view.key}
              className={cn(
                "flex items-center gap-1 rounded-[var(--radius-md)]",
                view.key === activeKey && "bg-[var(--surface-muted)]",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(view)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"
              >
                <LayoutMark layout={view.layout} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    view.key === activeKey && "font-medium text-[var(--interactive-primary)]",
                  )}
                >
                  {view.name}
                </span>
                {view.isShared ? (
                  <Users className="size-3.5 flex-none text-[var(--text-subtle)]" />
                ) : null}
              </button>

              {view.builtIn ? (
                // A built-in has nothing to rename or delete, and the blank
                // space where its menu would be says so.
                <span className="size-7 flex-none" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton size="sm" aria-label={`Options for ${view.name}`}>
                      <DotsThree />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setName(view.name);
                        setRenaming(view);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => update.mutate(view)}>
                      Update with current filters
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => share.mutate(view)}>
                      {view.isShared ? "Make private" : "Share with the team"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-[var(--status-error-text)]"
                      onClick={() => remove.mutate(view)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setName("");
              setShared(false);
              setLayout(active.layout);
              setCreating(true);
            }}
          >
            <Plus className="size-4" />
            Create new
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RecordDialog
        open={creating}
        onOpenChange={setCreating}
        title="Save this view"
        description="Keeps the filters and sort you have on screen, in the shape you are looking at them."
        size="md"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Saving…" : "Save view"}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="view-name">Name</Label>
          <Input
            id="view-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Quotes to chase"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>Opens as</Label>
          <div className="flex gap-2">
            {(["BOARD", "TABLE"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLayout(option)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-[var(--radius-md)] border p-3 text-left text-sm",
                  layout === option
                    ? "border-[var(--interactive-primary)] bg-[var(--surface-subtle)]"
                    : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
                )}
              >
                <LayoutMark layout={option} />
                <span>
                  <span className="block font-medium">
                    {option === "BOARD" ? "Board" : "List"}
                  </span>
                  <span className="block text-sm text-[var(--text-muted)]">
                    {option === "BOARD" ? "Columns by stage" : "Rows you can sort"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={shared}
            onCheckedChange={(checked) => setShared(checked === true)}
          />
          Share with the team
        </label>
      </RecordDialog>

      <RecordDialog
        open={Boolean(renaming)}
        onOpenChange={(next) => (!next ? setRenaming(null) : undefined)}
        title="Rename view"
        size="md"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) rename.mutate();
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || rename.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="view-rename">Name</Label>
          <Input
            id="view-rename"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>
      </RecordDialog>
    </>
  );
}
