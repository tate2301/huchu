"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Switch } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { getApiErrorMessage } from "@/lib/api-client";
import { createCrmSavedView, deleteCrmSavedView, updateCrmSavedView } from "@/lib/crm/collections-client";
import type { ViewState } from "@/lib/crm/registers/types";
import {
  ChevronDown,
  CopySimple,
  Layers,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UsersThree,
} from "@/lib/icons";

import type { RegisterHandle, RegisterView } from "./use-register";

/** What the name dialog is open for: a new view (saved as, or a copy), or a new name. */
type Naming =
  | { mode: "create"; title: string; name: string; state: ViewState; carried: boolean }
  | { mode: "rename"; view: RegisterView & { saved: NonNullable<RegisterView["saved"]> } };

function ViewSection({ label, views, first }: { label: string; views: RegisterView[]; first?: boolean }) {
  if (views.length === 0) return null;
  return (
    <>
      {first ? null : <DropdownMenuSeparator />}
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {views.map((view) => (
        <DropdownMenuRadioItem key={view.key} value={view.key}>
          <span className="min-w-0 flex-1 truncate">{view.name}</span>
          {view.saved?.isShared && view.saved.author ? (
            <span className="max-w-[6rem] shrink-0 truncate text-sm text-[var(--text-subtle)]">{view.saved.author}</span>
          ) : null}
        </DropdownMenuRadioItem>
      ))}
    </>
  );
}

/**
 * Which view the list is showing, the others it could show, and keeping one.
 *
 * The trigger names the view and says when the list has wandered from it —
 * the dot — because a list that quietly differs from what its name says is
 * how somebody exports the wrong records. A view keeps everything on screen:
 * the search, every filter, the sort, the layout, the grouping and the
 * columns.
 *
 * Views come in three kinds, listed apart: the list's own, the team's (shared
 * by somebody who may share), and the reader's own. Only a view's author or a
 * manager changes it; anybody can take a copy.
 */
export function ViewsMenu({ register }: { register: RegisterHandle }) {
  const { toast } = useToast();
  const [naming, setNaming] = useState<Naming | null>(null);
  // A dialog opened from the menu keeps the focus the menu would hand back
  // to its button on closing.
  const handingOff = useRef(false);
  const { view, views, modified, saved } = register;

  const builtIn = views.filter((candidate) => !candidate.saved);
  const shared = views.filter((candidate) => candidate.saved?.isShared);
  const mine = views.filter((candidate) => candidate.saved && !candidate.saved.isShared);

  const own = view.saved;
  // Save writes over the view: its author's or a manager's, and a shared one
  // only for somebody who may still share.
  const canSave = Boolean(own?.canEdit && (!own.isShared || saved.canShare));

  const fail = (title: string) => (error: unknown) =>
    toast({ title, description: getApiErrorMessage(error), variant: "destructive" });

  const save = useMutation({
    mutationFn: (id: string) => updateCrmSavedView(id, { state: saved.snapshot() }),
    onSuccess: (record) => {
      saved.open(record, { carried: true });
      toast({ title: `Saved “${record.name}”` });
    },
    onError: fail("Could not save the view"),
  });

  const share = useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) => updateCrmSavedView(id, { isShared }),
    onSuccess: (record) => {
      saved.update(record);
      toast({
        title: record.isShared ? `“${record.name}” is shared with the team` : `“${record.name}” is only yours now`,
      });
    },
    onError: fail("Could not change who sees the view"),
  });

  const remove = useMutation({
    mutationFn: async (target: { id: string; name: string }) => {
      await deleteCrmSavedView(target.id);
      return target;
    },
    onSuccess: (target) => {
      saved.drop(target.id);
      toast({ title: `Deleted “${target.name}”` });
    },
    onError: fail("Could not delete the view"),
  });

  const openNaming = (next: Naming) => {
    handingOff.current = true;
    setNaming(next);
  };

  const confirmDelete = async (target: NonNullable<RegisterView["saved"]>, name: string) => {
    handingOff.current = true;
    const confirmed = await dsConfirm({
      title: `Delete “${name}”?`,
      description: target.isShared
        ? "It goes for everyone on the team. No records are touched."
        : "Only the view goes. No records are touched.",
      confirmLabel: "Delete view",
      variant: "danger",
    });
    if (confirmed) remove.mutate({ id: target.id, name });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-w-[14rem] shrink-0 gap-1.5 max-sm:w-full max-sm:max-w-none max-sm:justify-start"
          >
            <Layers className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate font-semibold text-[var(--text-strong)]">{view.name}</span>
            {modified ? (
              // A dot, and the word for a screen reader: the list has wandered
              // from the view its name promises.
              <span className="flex shrink-0 items-center" title="Changed from the saved view">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--tone-warn)]" />
                <span className="sr-only">, modified</span>
              </span>
            ) : null}
            <ChevronDown className="size-3 shrink-0 text-[var(--text-subtle)] max-sm:ml-auto" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64"
          onCloseAutoFocus={(event) => {
            if (!handingOff.current) return;
            handingOff.current = false;
            event.preventDefault();
          }}
        >
          <DropdownMenuRadioGroup
            value={modified ? "" : view.key}
            onValueChange={(key) => {
              const next = views.find((candidate) => candidate.key === key);
              if (next) register.applyView(next);
            }}
          >
            <ViewSection label="Views" views={builtIn} first />
            <ViewSection label="Shared with the team" views={shared} />
            <ViewSection label="Only you" views={mine} />
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          {modified ? (
            <DropdownMenuItem onSelect={() => register.resetView()}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Back to “{view.name}”
            </DropdownMenuItem>
          ) : null}
          {modified && own && canSave ? (
            <DropdownMenuItem disabled={save.isPending} onSelect={() => save.mutate(own.id)}>
              <Save className="size-4" aria-hidden="true" />
              Save changes to “{view.name}”
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() =>
              openNaming({ mode: "create", title: "Save as a new view", name: "", state: saved.snapshot(), carried: true })
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Save as a new view…
          </DropdownMenuItem>

          {own ? (
            <>
              <DropdownMenuSeparator />
              {own.canEdit ? (
                <DropdownMenuItem onSelect={() => openNaming({ mode: "rename", view: { ...view, saved: own } })}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Rename…
                </DropdownMenuItem>
              ) : null}
              {own.canEdit && own.isShared ? (
                // Taking a view back is always allowed; publishing one is not.
                <DropdownMenuItem onSelect={() => share.mutate({ id: own.id, isShared: false })}>
                  <Lock className="size-4" aria-hidden="true" />
                  Make it only yours
                </DropdownMenuItem>
              ) : own.canEdit && saved.canShare ? (
                <DropdownMenuItem onSelect={() => share.mutate({ id: own.id, isShared: true })}>
                  <UsersThree className="size-4" aria-hidden="true" />
                  Share with the team
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  openNaming({
                    mode: "create",
                    title: "Copy this view",
                    name: `Copy of ${view.name}`,
                    state: view.state,
                    carried: false,
                  })
                }
              >
                <CopySimple className="size-4" aria-hidden="true" />
                Duplicate…
              </DropdownMenuItem>
              {own.canEdit ? (
                <DropdownMenuItem
                  className="text-[var(--tone-danger)] focus:text-[var(--tone-danger)]"
                  onSelect={() => void confirmDelete(own, view.name)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete…
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {naming ? (
        <ViewNameDialog
          // A fresh dialog for each opening, so it starts from what it was opened with.
          key={naming.mode === "rename" ? `rename-${naming.view.key}` : `${naming.title}-${naming.name}`}
          naming={naming}
          register={register}
          onClose={() => setNaming(null)}
        />
      ) : null}
    </>
  );
}

/** A view's name — and, for a new one, whether the team sees it. */
function ViewNameDialog({
  naming,
  register,
  onClose,
}: {
  naming: Naming;
  register: RegisterHandle;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(naming.mode === "rename" ? naming.view.name : naming.name);
  const [shared, setShared] = useState(false);
  const creating = naming.mode === "create";

  const submit = useMutation({
    mutationFn: () =>
      naming.mode === "rename"
        ? updateCrmSavedView(naming.view.saved.id, { name: name.trim() })
        : createCrmSavedView({ register: register.def.key, name: name.trim(), state: naming.state, isShared: shared }),
    onSuccess: (record) => {
      if (naming.mode === "rename") {
        register.saved.update(record);
        toast({ title: `Renamed to “${record.name}”` });
      } else {
        register.saved.open(record, { carried: naming.carried });
        toast({ title: `Saved “${record.name}”`, description: record.isShared ? "The team can open it too." : undefined });
      }
      onClose();
    },
  });

  return (
    <RecordDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={naming.mode === "rename" ? "Rename view" : naming.title}
      description={
        creating
          ? "A view keeps the search, every filter, the sort, the layout, the grouping and the columns."
          : undefined
      }
      size="sm"
      errors={submit.error ? [getApiErrorMessage(submit.error)] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) submit.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || submit.isPending}>
            {submit.isPending ? "Saving…" : naming.mode === "rename" ? "Rename" : "Save view"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="view-name">Name</Label>
        <Input
          id="view-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Quotes over 10,000 this month"
          maxLength={80}
          autoFocus
        />
      </div>

      {creating && register.saved.canShare ? (
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Shared with the team
            <span className="block text-sm text-[var(--text-muted)]">Off: only you see it.</span>
          </span>
          <Switch checked={shared} onChange={() => setShared((value) => !value)} aria-label="Shared with the team" />
        </label>
      ) : null}
    </RecordDialog>
  );
}
