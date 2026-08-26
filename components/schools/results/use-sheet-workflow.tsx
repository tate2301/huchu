"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecordVerb } from "@/components/schools/common/record-actions";
import {
  approveResultSheet,
  deleteResultSheet,
  publishResultSheet,
  sendResultSheetBack,
  submitResultSheet,
  unpublishResultSheet,
  type ResultSheetLike,
} from "@/lib/schools/results-v2";
import { SHEET_STATE_LABELS } from "./sheet-state";

/**
 * The five workflow verbs, in one place, so every results screen offers the
 * same ones for the same sheet.
 *
 * Until now the moderation queue and the publishing screen were tables with no
 * buttons at all: `submit`, `hod-approve`, `hod-request-changes`, `publish` and
 * `unpublish` were written, gated and tested, and had zero call sites, which is
 * why `HOD_APPROVED` was a state nobody could reach. Each verb below is one of
 * those endpoints, gated on the grant the endpoint itself checks.
 *
 * Two of them take a reason. Sending a sheet back without saying why is how a
 * teacher ends up guessing at what the head of department wanted changed, so
 * both open a short form rather than a yes/no confirmation — the endpoints
 * require the text, and this is where it is typed.
 */

type ReasonKind = "send-back" | "unpublish";

const REASON_COPY: Record<
  ReasonKind,
  { title: string; description: string; label: string; hint: string; submit: string }
> = {
  "send-back": {
    title: "Send this sheet back",
    description: "The teacher sees this note against the sheet when they reopen it.",
    label: "What needs changing?",
    hint: "Name the marks or the paper, not just \"please check\" — this is all they get.",
    submit: "Send it back",
  },
  unpublish: {
    title: "Pull this sheet back",
    description: "Families lose sight of these marks until the sheet is published again.",
    label: "Why is it coming down?",
    hint: "Recorded against the sheet, so the correction can be explained later.",
    submit: "Pull it back",
  },
};

export type SheetVerbOptions = {
  /** Opens the screen's own marks-and-history panel. */
  onOpen?: (sheet: ResultSheetLike) => void;
  /** Opens the screen's own edit form. Omit on screens that have no form. */
  onEdit?: (sheet: ResultSheetLike) => void;
};

export function useResultSheetWorkflow() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ sheet: ResultSheetLike; kind: ReasonKind } | null>(
    null,
  );
  const [reason, setReason] = useState("");

  // Everything that reads a sheet reads it under this key prefix — the
  // overview, the class list, the queue and the publishing screen are four
  // views of one table, and a verb pressed on any of them has to move all four.
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "results"] });
  }, [queryClient]);

  const run = useCallback(
    (key: string, work: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      void work()
        .then(() => refresh())
        .catch((cause: unknown) => setError(cause))
        .finally(() => setBusy(null));
    },
    [refresh],
  );

  const reasonMutation = useMutation({
    /**
     * Returns nothing on purpose. Sending a sheet back answers with the sheet
     * and unpublishing answers with the sheet and its note, and inference could
     * not reconcile the two — but neither is read: the queue refetches, because
     * a sheet leaving this state changes which rows belong on the screen.
     */
    mutationFn: async (input: {
      sheet: ResultSheetLike;
      kind: ReasonKind;
      text: string;
    }): Promise<void> => {
      if (input.kind === "send-back") {
        await sendResultSheetBack(input.sheet.id, input.text);
        return;
      }
      await unpublishResultSheet(input.sheet.id, input.text);
    },
    onSuccess: () => {
      setAsking(null);
      setReason("");
      setError(null);
      refresh();
    },
    onError: (cause: unknown) => setError(cause),
  });

  const verbsFor = useCallback(
    (sheet: ResultSheetLike, options: SheetVerbOptions = {}): RecordVerb[] => {
      const verbs: RecordVerb[] = [];
      const isBusy = (verb: string) => busy === `${sheet.id}:${verb}`;
      const empty = sheet._count.lines === 0;

      if (options.onOpen) {
        verbs.push({
          label: "Marks",
          action: "view",
          onSelect: () => options.onOpen?.(sheet),
        });
      }

      if (sheet.status === "DRAFT" || sheet.status === "HOD_REJECTED") {
        verbs.push({
          label: sheet.status === "HOD_REJECTED" ? "Resubmit" : "Submit",
          action: "submit",
          loading: isBusy("submit"),
          unavailable: empty ? "Nothing has been marked on this sheet yet." : undefined,
          onSelect: () => run(`${sheet.id}:submit`, () => submitResultSheet(sheet.id)),
        });
      }

      if (sheet.status === "SUBMITTED") {
        verbs.push({
          label: "Approve",
          action: "approve",
          loading: isBusy("approve"),
          onSelect: () => run(`${sheet.id}:approve`, () => approveResultSheet(sheet.id)),
        });
        verbs.push({
          label: "Send back",
          action: "request-changes",
          tone: "warning",
          onSelect: () => {
            setReason("");
            setAsking({ sheet, kind: "send-back" });
          },
        });
      }

      if (sheet.status === "HOD_APPROVED") {
        verbs.push({
          label: "Publish",
          action: "publish",
          loading: isBusy("publish"),
          confirm: {
            title: "Publish these marks",
            description: `${sheet.title} goes onto ${sheet.class.name}${sheet.stream ? ` ${sheet.stream.name}` : ""} report cards, and families with a portal account can see it.`,
            confirmLabel: "Publish",
          },
          onSelect: () => run(`${sheet.id}:publish`, () => publishResultSheet(sheet.id)),
        });
      }

      if (sheet.status === "PUBLISHED") {
        verbs.push({
          label: "Unpublish",
          action: "unpublish",
          tone: "warning",
          onSelect: () => {
            setReason("");
            setAsking({ sheet, kind: "unpublish" });
          },
        });
      }

      if (options.onEdit) {
        verbs.push({
          label: "Edit",
          action: "edit",
          unavailable:
            sheet.status === "PUBLISHED"
              ? "Pull the sheet back before editing it."
              : undefined,
          onSelect: () => options.onEdit?.(sheet),
        });
      }

      verbs.push({
        label: "Delete",
        action: "archive",
        tone: "danger",
        loading: isBusy("delete"),
        unavailable:
          sheet.status === "DRAFT" || sheet.status === "HOD_REJECTED"
            ? undefined
            : `A ${SHEET_STATE_LABELS[sheet.status].toLowerCase()} sheet carries a moderation trail. Send it back first.`,
        confirm: {
          title: `Delete ${sheet.title}`,
          description: `The sheet and its ${sheet._count.lines} mark${sheet._count.lines === 1 ? "" : "s"} go for good. The marks behind them, in the mark book, stay.`,
          confirmLabel: "Delete the sheet",
        },
        onSelect: () => run(`${sheet.id}:delete`, () => deleteResultSheet(sheet.id)),
      });

      return verbs;
    },
    [busy, run],
  );

  const copy = asking ? REASON_COPY[asking.kind] : null;

  const dialog =
    asking && copy ? (
      <RecordDialog
        open
        onOpenChange={(open) => {
          if (!open) {
            setAsking(null);
            setReason("");
          }
        }}
        size="md"
        title={copy.title}
        description={copy.description}
        onSubmit={(event) => {
          event.preventDefault();
          const text = reason.trim();
          if (!text) return;
          reasonMutation.mutate({ sheet: asking.sheet, kind: asking.kind, text });
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAsking(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={reasonMutation.isPending}
              disabled={reason.trim().length === 0}
            >
              {copy.submit}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {asking.sheet.title} · {asking.sheet.class.name}
          {asking.sheet.stream ? ` ${asking.sheet.stream.name}` : ""} ·{" "}
          {asking.sheet.term.name}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="sheet-reason">{copy.label}</Label>
          <Textarea
            id="sheet-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={1000}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{copy.hint}</p>
        </div>
      </RecordDialog>
    ) : null;

  return {
    verbsFor,
    dialog,
    error,
    clearError: () => setError(null),
  };
}
