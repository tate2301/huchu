"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { RichTextComposer } from "@/components/crm/collaboration/rich-text-composer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/use-toast";
import { createCrmComment } from "@/lib/crm/crm-v2";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { richTextToPlain } from "@/lib/crm/rich-text";
import { ChatCircle, Mail, Phone, Users } from "@/lib/icons";
import type { CollabEntity } from "@/lib/crm/collaboration";
import { cn } from "@/lib/utils";

/**
 * One box for everything anybody says about a record.
 *
 * There were two, in two different sections: the activity composer logged what
 * happened with the client and lived at the top of the timeline; the comment
 * box was internal chatter and lived seven sections along. Both are somebody
 * typing a paragraph about this record.
 *
 * ## The mistake this shape exists to prevent
 *
 * Merging them creates a new hazard, and it is the serious one: an internal
 * remark filed as a customer contact, or a customer's words filed where nobody
 * looking at the customer timeline will find them. "Careful, we underquoted
 * this site last time" is a sentence you do not want sitting in the record of
 * what you told the client.
 *
 * Six equal segments — Comment, Note, Call, Email, WhatsApp, Meeting — do not
 * prevent that. They are one row of peers, so the difference that matters
 * (internal or not) is carried by nothing more than the position of the first
 * chip, and the consequence is never stated.
 *
 * So the choice is made twice, at two different sizes:
 *
 *   1. **A binary**, first and largest: is this for the team, or a record of
 *      contact with the client. Two options cannot be misread the way six can.
 *   2. **The kind of contact**, only once the second is chosen, and only
 *      because "a call" and "an email" are genuinely different facts.
 *
 * And the consequence is written where the eye already is — beside the button
 * that commits it, in a sentence rather than a label. The button names the act
 * too: "Post comment" and "Log the call" are hard to press by accident when
 * you meant the other.
 */
const CONTACT_KINDS = [
  { value: "NOTE", label: "Note", icon: ChatCircle, verb: "Log the note" },
  { value: "CALL", label: "Call", icon: Phone, verb: "Log the call" },
  { value: "EMAIL", label: "Email", icon: Mail, verb: "Log the email" },
  { value: "WHATSAPP", label: "WhatsApp", icon: ChatCircle, verb: "Log the message" },
  { value: "MEETING", label: "Meeting", icon: Users, verb: "Log the meeting" },
] as const;

type ContactKind = (typeof CONTACT_KINDS)[number]["value"];
type Mode = "COMMENT" | "CONTACT";

const CONTACT_PLACEHOLDERS: Record<ContactKind, string> = {
  NOTE: "What happened, in the words you would use to the client?",
  CALL: "What was said on the call?",
  EMAIL: "What did you send, and what came back?",
  WHATSAPP: "What was agreed on WhatsApp?",
  MEETING: "What came out of the meeting?",
};

export type ConversationTarget =
  | { kind: "lead"; id: string }
  | { kind: "deal"; id: string }
  | { kind: "person"; id: string }
  | { kind: "company"; id: string }
  | { kind: "site"; id: string };

const TARGET_KEYS: Record<ConversationTarget["kind"], string | null> = {
  lead: "leadId",
  deal: "dealId",
  person: "personId",
  company: "clientId",
  // A site is a place, not a correspondent: what happened there is logged on
  // the visit or the deal. It can still be commented on.
  site: null,
};

const COLLAB: Record<ConversationTarget["kind"], CollabEntity> = {
  lead: "LEAD",
  deal: "DEAL",
  company: "COMPANY",
  person: "PERSON",
  site: "SITE",
};

export function ConversationComposer({ target }: { target: ConversationTarget }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canLogContact = TARGET_KEYS[target.kind] !== null;
  const [mode, setMode] = useState<Mode>("COMMENT");
  const [contactKind, setContactKind] = useState<ContactKind>("CALL");
  const [text, setText] = useState("");

  const kind = CONTACT_KINDS.find((entry) => entry.value === contactKind) ?? CONTACT_KINDS[0];
  const isComment = mode === "COMMENT" || !canLogContact;

  const post = useMutation({
    mutationFn: () => {
      const trimmed = text.trim();

      if (isComment) {
        return createCrmComment({
          entity: COLLAB[target.kind],
          recordId: target.id,
          body: trimmed,
        });
      }

      // What was written goes in the body, always. The subject is a flattened
      // reading of the same words, for the places that cannot run the renderer
      // — notifications, search snippets.
      return fetchJson("/api/v2/crm/activities", {
        method: "POST",
        body: JSON.stringify({
          type: contactKind,
          subject: richTextToPlain(trimmed, 200),
          body: trimmed,
          [TARGET_KEYS[target.kind] as string]: target.id,
        }),
      });
    },
    onSuccess: () => {
      setText("");
      // Both halves of the feed, because either kind lands in it.
      queryClient.invalidateQueries({ queryKey: ["crm-lead", target.id] });
      queryClient.invalidateQueries({ queryKey: ["crm", target.kind, target.id] });
      queryClient.invalidateQueries({
        queryKey: ["crm-comments", COLLAB[target.kind], target.id],
      });
    },
    onError: (error) =>
      toast({
        title: isComment ? "Could not post that" : "Could not log that",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--card-radius)] border transition-colors",
        // The surface itself says which of the two this is. A tinted panel is
        // read before any label on it, so an internal note never looks like a
        // customer record even at a glance across the room.
        isComment
          ? "border-[var(--border)] bg-[var(--surface-muted)]/40"
          : "border-[var(--action-primary-bg)]/30 bg-[var(--surface-base)]",
      )}
    >
      {canLogContact ? (
        <div className="border-b border-[var(--border-subtle)] px-3 pb-2.5 pt-3">
          <SegmentedControl
            value={mode}
            onValueChange={(value) => setMode(value as Mode)}
            options={[
              { value: "COMMENT", label: "Note to the team" },
              { value: "CONTACT", label: "Record of contact" },
            ]}
            size="sm"
            ariaLabel="What are you writing"
          />

          {/* Only once the answer is "contact", because until then the kind is
              a question about something that is not happening. */}
          {!isComment ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {CONTACT_KINDS.map((entry) => {
                const Icon = entry.icon;
                const active = entry.value === contactKind;
                return (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setContactKind(entry.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 text-sm transition-colors",
                      active
                        ? "bg-[var(--action-primary-bg)] font-medium text-[var(--action-primary-text)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {entry.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 p-3">
        <RichTextComposer
          value={text}
          onChange={setText}
          // Cmd/Ctrl+Enter submits — this box gets used dozens of times a day.
          onSubmit={() => {
            if (text.trim()) post.mutate();
          }}
          placeholder={
            isComment
              ? "Leave a note for the team. Type @ to bring someone in."
              : CONTACT_PLACEHOLDERS[contactKind]
          }
          rows={3}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The consequence, in a sentence, next to the button that commits
              it — not a label on a chip somewhere above. This is the whole
              mistake-prevention mechanism: you cannot file an internal remark
              as a customer record without reading a line that says it is one. */}
          <p
            className={cn(
              "text-sm",
              isComment ? "text-[var(--text-muted)]" : "text-[var(--action-primary-bg)]",
            )}
          >
            {isComment ? (
              <>
                Only your team sees this.
                <span className="hidden sm:inline"> Type @ to bring someone in.</span>
              </>
            ) : (
              <>
                Goes on this record&rsquo;s history as {kind.label.toLowerCase() === "email" ? "an" : "a"}{" "}
                {kind.label.toLowerCase()}.
              </>
            )}
          </p>

          <Button
            size="sm"
            variant={isComment ? "secondary" : "primary"}
            onClick={() => post.mutate()}
            disabled={!text.trim() || post.isPending}
          >
            {post.isPending ? "Saving…" : isComment ? "Post comment" : kind.verb}
          </Button>
        </div>
      </div>
    </div>
  );
}
