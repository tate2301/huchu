"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Switch } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * A subject, created and corrected.
 *
 * Two routes are involved and they are not symmetrical: a subject is created
 * through `teachers/subjects` and amended through `schools/subjects/[id]`,
 * which sit behind different grants — `schools.teachers` create for the first
 * and `schools.academics` edit for the second. The buttons that open this
 * dialog are gated to match, rather than to match each other; a screen that
 * offers a verb the endpoint will refuse teaches the permission model as a red
 * alert, which is exactly what the gating exists to stop.
 */

export type SubjectFormValues = {
  id: string | null;
  code: string;
  name: string;
  isCore: boolean;
  isActive: boolean;
  passMark: string;
};

export const EMPTY_SUBJECT: SubjectFormValues = {
  id: null,
  code: "",
  name: "",
  isCore: true,
  isActive: true,
  passMark: "50",
};

export function SubjectFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SubjectFormValues;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SubjectFormValues>(initial);

  const seed = `${open}:${initial.id ?? "new"}`;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (open && seeded !== seed) {
    setSeeded(seed);
    setForm(initial);
  }

  const editing = initial.id !== null;

  const save = useMutation({
    mutationFn: () => {
      const passMark = Number(form.passMark);
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        isCore: form.isCore,
        isActive: form.isActive,
        passMark: Number.isFinite(passMark) ? passMark : 50,
      };
      return editing
        ? fetchJson(`/api/v2/schools/subjects/${initial.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : fetchJson("/api/v2/schools/teachers/subjects", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "subjects"] });
      onOpenChange(false);
    },
  });

  const parsedPassMark = Number(form.passMark);
  const missing: string[] = [];
  if (!form.code.trim()) missing.push("A subject code.");
  if (!form.name.trim()) missing.push("A subject name.");
  if (!Number.isFinite(parsedPassMark) || parsedPassMark < 0 || parsedPassMark > 100) {
    missing.push("A pass mark between 0 and 100.");
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${form.name || "this subject"}` : "Add a subject"}
      description="What is taught, and the mark that counts as a pass in it."
      size="md"
      errors={save.error ? [getApiErrorMessage(save.error)] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (missing.length > 0) return;
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={missing.length > 0}
            loading={save.isPending}
          >
            {editing ? "Save the changes" : "Add the subject"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject-name">
              Name<span className="text-[var(--tone-danger)]"> *</span>
            </Label>
            <Input
              id="subject-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject-code">
              Code<span className="text-[var(--tone-danger)]"> *</span>
            </Label>
            <Input
              id="subject-code"
              value={form.code}
              placeholder="MATH"
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject-passMark">Pass mark</Label>
          <Input
            id="subject-passMark"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.passMark}
            onChange={(event) =>
              setForm((current) => ({ ...current, passMark: event.target.value }))
            }
          />
          <p className="text-sm text-[var(--text-muted)]">
            The percentage a pupil must reach. Report cards read it from here,
            so changing it changes what counts as a pass everywhere.
          </p>
        </div>

        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <Switch
            label="Core subject"
            checked={form.isCore}
            onChange={(event) =>
              setForm((current) => ({ ...current, isCore: event.target.checked }))
            }
          />
          <Switch
            label="Still taught"
            checked={form.isActive}
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
          />
          <p className="text-sm text-[var(--text-muted)]">
            A subject the school has stopped offering is turned off rather than
            deleted; the results already recorded in it stay readable.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
