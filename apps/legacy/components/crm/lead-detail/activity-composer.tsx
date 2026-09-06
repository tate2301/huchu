"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { RichTextComposer } from "@/components/crm/collaboration/rich-text-composer";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { richTextToPlain } from "@corelithzw/module-records/rich-text";

const ACTIVITY_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "MEETING", label: "Meeting" },
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

const PLACEHOLDERS: Record<ActivityType, string> = {
  NOTE: "What should the team know?",
  CALL: "What was said on the call?",
  EMAIL: "What did you send, and what came back?",
  WHATSAPP: "What was agreed on WhatsApp?",
  MEETING: "What came out of the meeting?",
};

/**
 * Logs what actually happened with the client. Everything written goes to the
 * body, where the renderer runs; the subject is a flattened reading of it for
 * notifications and search snippets, which cannot render.
 */
export type ActivityTarget =
  | { kind: "lead"; id: string }
  | { kind: "deal"; id: string }
  | { kind: "person"; id: string }
  | { kind: "company"; id: string };

const TARGET_KEYS: Record<ActivityTarget["kind"], string> = {
  lead: "leadId",
  deal: "dealId",
  person: "personId",
  company: "clientId",
};

export function ActivityComposer({ target }: { target: ActivityTarget }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState<ActivityType>("NOTE");
  const [text, setText] = useState("");

  const log = useMutation({
    mutationFn: () => {
      const trimmed = text.trim();
      // What was written goes in the body, always. Splitting on the first
      // newline meant a one-line note — the common case — was stored entirely
      // as the subject, and the timeline draws a subject as plain text: every
      // mention came out as `@[Sarah](uuid)` and every bold as asterisks.
      // The subject is now a flattened reading of the same words, for the
      // places that cannot run the renderer.
      return fetchJson("/api/v2/crm/activities", {
        method: "POST",
        body: JSON.stringify({
          type,
          subject: richTextToPlain(trimmed, 200),
          body: trimmed,
          [TARGET_KEYS[target.kind]]: target.id,
        }),
      });
    },
    onSuccess: () => {
      setText("");
      // Refresh whichever record page is showing this timeline.
      queryClient.invalidateQueries({ queryKey: ["crm-lead", target.id] });
      queryClient.invalidateQueries({ queryKey: ["crm", target.kind, target.id] });
    },
    onError: (error) =>
      toast({
        title: "Could not log that",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-2 rounded-[var(--card-radius)] border border-[var(--border)] p-3">
      <SegmentedControl
        value={type}
        onValueChange={(value) => setType(value as ActivityType)}
        options={ACTIVITY_TYPES.map((entry) => ({ value: entry.value, label: entry.label }))}
        size="sm"
        ariaLabel="Activity type"
      />
      <RichTextComposer
        value={text}
        onChange={setText}
        // Cmd/Ctrl+Enter submits — this box gets used dozens of times a day.
        onSubmit={() => {
          if (text.trim()) log.mutate();
        }}
        placeholder={PLACEHOLDERS[type]}
        rows={3}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* The keyboard shortcut is the second half of this line and means
            nothing on a touch keyboard, so a phone reads the first half only
            and the button stays on the same row. */}
        <p className="text-sm text-[var(--text-muted)]">
          Type @ to link a person or record.
          <span className="hidden sm:inline"> ⌘/Ctrl + Enter to save.</span>
        </p>
        <Button
          size="sm"
          onClick={() => log.mutate()}
          disabled={!text.trim() || log.isPending}
        >
          {log.isPending ? "Saving…" : "Log it"}
        </Button>
      </div>
    </div>
  );
}
