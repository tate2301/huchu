"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { RichTextComposer } from "@/components/crm/collaboration/rich-text-composer";
import { SlidingSegments } from "@/components/records/sliding-segments";
import { useToast } from "@/components/ui/use-toast";
import { createCrmComment } from "@/lib/crm/crm-v2";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { richTextToPlain } from "@/lib/crm/rich-text";
import { CONTACT_OUTCOME_LABELS, CONTACT_OUTCOMES, type ContactOutcome } from "@/lib/crm/contact-outcome";
import { ChatCircle, ChevronUpIcon, Mail, NoteAdd, Phone, Send, Users } from "@/lib/icons";
import type { CollabEntity } from "@/lib/crm/collaboration";
import { cn } from "@/lib/utils";

/**
 * One box for everything anybody says about a record.
 *
 * ## The mistake this shape exists to prevent
 *
 * An internal remark filed as a customer contact, or a customer's words filed
 * where nobody looking at the customer timeline will find them. "Careful, we
 * underquoted this site last time" is a sentence you do not want sitting in the
 * record of what you told the client.
 *
 * So the choice is made twice, at two different sizes:
 *
 *   1. **A binary**, first and largest: a note to the team, or a record of
 *      contact with the client. Two options cannot be misread the way six can.
 *   2. **The channel**, and for a call or a message how it went, only once the
 *      second is chosen.
 *
 * The button names the act — "Post comment", "Log the call" — and the
 * placeholder says who will see it, so neither can be pressed meaning the other.
 *
 * ## Closed until it is wanted
 *
 * At rest it is one line, "Write a note", with the key that opens it (C, from
 * anywhere on the record). Opened, it grows in place; Escape on an empty box,
 * the chevron, or posting closes it again. The record's Call / Email / Message
 * buttons open it straight onto that channel — see `request`.
 */
const CONTACT_KINDS = [
  { value: "CALL", label: "Call", icon: Phone, verb: "Log the call", placeholder: "What was said on the call?" },
  { value: "EMAIL", label: "Email", icon: Mail, verb: "Log the email", placeholder: "What did you send, and what came back?" },
  { value: "WHATSAPP", label: "WhatsApp", icon: ChatCircle, verb: "Log the message", placeholder: "What was agreed on WhatsApp?" },
  { value: "MEETING", label: "Meeting", icon: Users, verb: "Log the meeting", placeholder: "What came out of the meeting?" },
] as const;

export type ContactKind = (typeof CONTACT_KINDS)[number]["value"];
type Mode = "COMMENT" | "CONTACT";

/** The kinds where "did anybody pick up" is a question. */
const HAS_OUTCOME: ReadonlySet<ContactKind> = new Set(["CALL", "WHATSAPP"]);

/**
 * Open the composer from elsewhere on the record. A new `nonce` is a new
 * request, so pressing Call twice opens it twice.
 */
export type ComposeRequest = { mode: Mode; kind?: ContactKind; nonce: number };

/**
 * C, anywhere on the record, opens the composer on a note to the team. Not
 * while somebody is typing, and not while a dialog owns the keyboard.
 */
export function useComposeShortcut(onCompose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "c" && event.key !== "C") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      if (document.querySelector("[role='dialog'][data-state='open'], [role='menu'][data-state='open']")) return;
      event.preventDefault();
      onCompose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCompose]);
}

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

function initials(name: string | null | undefined) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ConversationComposer({
  target,
  request,
}: {
  target: ConversationTarget;
  request?: ComposeRequest | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const canLogContact = TARGET_KEYS[target.kind] !== null;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("COMMENT");
  const [contactKind, setContactKind] = useState<ContactKind>("CALL");
  const [outcome, setOutcome] = useState<ContactOutcome>("REACHED");
  const [text, setText] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);
  const rootRef = useRef<HTMLElement>(null);

  const kind = CONTACT_KINDS.find((entry) => entry.value === contactKind) ?? CONTACT_KINDS[0];
  const isComment = mode === "COMMENT" || !canLogContact;
  const showOutcome = !isComment && HAS_OUTCOME.has(contactKind);

  const expand = () => {
    setOpen(true);
    setFocusSignal((signal) => signal + 1);
    // Into view under the sticky tabs, smoothly unless motion is reduced.
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      rootRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
  };

  // Another control on the record asked for the composer.
  const requestNonce = request?.nonce;
  useEffect(() => {
    if (!request) return;
    setMode(canLogContact ? request.mode : "COMMENT");
    if (request.kind) setContactKind(request.kind);
    expand();
    // Each nonce is one request; the rest of `request` is read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestNonce]);

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
          outcome: showOutcome ? outcome : undefined,
          [TARGET_KEYS[target.kind] as string]: target.id,
        }),
      });
    },
    onSuccess: () => {
      setText("");
      setOpen(false);
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

  const submit = () => {
    if (text.trim() && !post.isPending) post.mutate();
  };

  const me = session?.user?.name ?? null;

  return (
    <section
      ref={rootRef}
      className={cn("rec-cmp", open && "is-open", !isComment && "is-contact")}
      aria-label="Write on this record"
    >
      {/* Closed: one line that opens it. */}
      <div className="rec-cmp-fold rec-cmp-closed" aria-hidden={open} inert={open}>
        <div>
          <button type="button" className="rec-cmp-c" onClick={expand} aria-keyshortcuts="C">
            <span className="rec-cmp-face" aria-hidden="true">
              {initials(me)}
            </span>
            <span className="rec-cmp-ph">Write a note</span>
            <Kbd>C</Kbd>
          </button>
        </div>
      </div>

      {/* Open: the whole composer, grown in place. */}
      <div className="rec-cmp-fold rec-cmp-opened" aria-hidden={!open} inert={!open}>
        <div>
          <div className="rec-cmp-top">
            {canLogContact ? (
              <SlidingSegments
                ariaLabel="What are you writing"
                value={mode}
                onValueChange={(next) => {
                  setMode(next);
                  setFocusSignal((signal) => signal + 1);
                }}
                options={[
                  { value: "COMMENT", label: "Note to the team", icon: <NoteAdd aria-hidden="true" /> },
                  { value: "CONTACT", label: "Record of contact", icon: <Phone aria-hidden="true" /> },
                ]}
              />
            ) : (
              <span className="text-sm font-semibold">Note to the team</span>
            )}
            <IconButton size="sm" aria-label="Collapse" title="Collapse" onClick={() => setOpen(false)}>
              <ChevronUpIcon />
            </IconButton>
          </div>

          {/* Only once the answer is "contact", because until then the
              channel is a question about something that is not happening. */}
          <div className="rec-cmp-fold rec-cmp-meta" aria-hidden={isComment} inert={isComment}>
            <div>
              <div className="rec-cmp-meta-in">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Channel">
                  {CONTACT_KINDS.map((entry) => {
                    const Icon = entry.icon;
                    const active = entry.value === contactKind;
                    return (
                      <button
                        key={entry.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className="rec-chan"
                        onClick={() => {
                          setContactKind(entry.value);
                          setFocusSignal((signal) => signal + 1);
                        }}
                      >
                        <Icon aria-hidden="true" />
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
                {showOutcome ? (
                  <SlidingSegments
                    className="ml-auto"
                    ariaLabel="How it went"
                    value={outcome}
                    onValueChange={(next) => {
                      setOutcome(next);
                      setFocusSignal((signal) => signal + 1);
                    }}
                    options={CONTACT_OUTCOMES.map((value) => ({
                      value,
                      label: CONTACT_OUTCOME_LABELS[value],
                    }))}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <RichTextComposer
            value={text}
            onChange={setText}
            toolbar="bottom"
            focusSignal={focusSignal}
            // Cmd/Ctrl+Enter submits — this box gets used dozens of times a day.
            onSubmit={submit}
            onEscape={() => {
              if (!text.trim()) setOpen(false);
            }}
            placeholder={
              isComment
                ? "A note for the team — only your team sees it. Type @ to bring someone in."
                : kind.placeholder
            }
            rows={3}
            actions={
              <Button
                size="sm"
                variant="primary"
                onClick={submit}
                disabled={!text.trim() || post.isPending}
                title="Ctrl+Enter"
              >
                <Send className="size-4" aria-hidden="true" />
                {post.isPending ? "Saving…" : isComment ? "Post comment" : kind.verb}
              </Button>
            }
          />
        </div>
      </div>
    </section>
  );
}
