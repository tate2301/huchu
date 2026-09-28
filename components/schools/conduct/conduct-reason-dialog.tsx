"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createConductCategory,
  createMeritReason,
  type ConductTone,
} from "@/lib/schools/conduct-v2";

/**
 * One row of a school's conduct vocabulary.
 *
 * Three shapes behind one dialog, because they are the same act — writing down
 * a word this school will log against — and differ only in which table it
 * lands in and one field each.
 *
 * The **code** is short and is what the log shows in its mono column: `LATE`,
 * `UNIF`, `FIGHT`. It is asked for rather than generated because a school
 * already has these on its conduct sheet and typing its own is quicker than
 * learning what the product invented.
 *
 * A category's **demerit points** are optional and automatic: a category with
 * points draws a demerit whenever an incident is logged against it, so a school
 * that runs a points system sets them and one that does not leaves them blank.
 */
export function ConductReasonDialog({
  kind,
  open,
  onOpenChange,
  onSaved,
  onError,
}: {
  /** Null while closed — the dialog is remounted per open, so this is its identity. */
  kind: null | "category" | "merit" | "demerit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [tone, setTone] = useState<ConductTone>("WARN");
  const [demeritPoints, setDemeritPoints] = useState("");
  const [points, setPoints] = useState("1");

  const isCategory = kind === "category";

  const save = useMutation({
    // Returns nothing on purpose. The two endpoints answer with different
    // shapes — a category has a `code`, a reason has a `kind` — and the caller
    // refetches rather than reading either, so widening the mutation to their
    // union would be a type nobody uses.
    mutationFn: async (): Promise<void> => {
      if (isCategory) {
        await createConductCategory({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          tone,
          demeritPoints: demeritPoints === "" ? null : Number(demeritPoints),
        });
        return;
      }
      await createMeritReason({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        kind: kind === "merit" ? "MERIT" : "DEMERIT",
        defaultPoints: Number(points || 1),
      });
    },
    onSuccess: () => onSaved(),
    onError: (error) => onError(error),
  });

  const ready = code.trim() !== "" && name.trim() !== "";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isCategory
          ? "New behaviour category"
          : kind === "merit"
            ? "New merit reason"
            : "New demerit reason"
      }
      description={
        isCategory
          ? "What an incident is. The behaviour log reads its tone, and the category picker on every incident is this list."
          : "What a merit or a demerit is given for. The award dialog reads this list."
      }
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Adding…" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[130px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reason-code">Code</Label>
            <Input
              id="reason-code"
              value={code}
              placeholder={isCategory ? "LATE" : "HELP"}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason-name">Name</Label>
            <Input
              id="reason-name"
              value={name}
              placeholder={isCategory ? "Late to school" : "Helpfulness"}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>

        {isCategory ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="reason-tone">Tone</Label>
              <Select value={tone} onValueChange={(value) => setTone(value as ConductTone)}>
                <SelectTrigger id="reason-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLAIN">Plain — recorded, not a warning</SelectItem>
                  <SelectItem value="WARN">Warn — the usual</SelectItem>
                  <SelectItem value="BAD">Serious — draws the eye on the log</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason-demerits">Demerits it draws</Label>
              <Input
                id="reason-demerits"
                type="number"
                min={0}
                max={50}
                className="w-[110px]"
                value={demeritPoints}
                placeholder="None"
                onChange={(event) => setDemeritPoints(event.target.value)}
              />
              <p className="text-xs text-[color:var(--text-muted)]">
                Optional. Set it and an incident in this category awards the demerit by
                itself; leave it blank and demerits stay a separate decision.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="reason-points">Points</Label>
            <Input
              id="reason-points"
              type="number"
              min={1}
              max={100}
              className="w-[110px]"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              What one of these is worth. The award dialog offers it and lets a teacher
              change it for the occasion.
            </p>
          </div>
        )}
      </div>
    </RecordDialog>
  );
}
