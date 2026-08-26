"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordTasksTab } from "@/components/crm/tasks/record-tasks-tab";
import {
  ConversationComposer,
  type ConversationTarget,
} from "@/components/crm/collaboration/conversation-composer";
import { SubSections } from "@/components/records/sub-sections";
import { RecordStory, type StoryEvent } from "./record-story";
import { MentionsTab } from "./mentions-tab";
import { AutomationTab } from "./automation-tab";
import { FieldHistoryTab } from "./field-history-tab";
import { FilesTab } from "./files-tab";
import { RecordHistoryTab } from "./record-history-tab";
import type { FileOwnerKind } from "@/lib/crm/record-files";
import type { CollabEntity } from "@/lib/crm/collaboration";
import { fetchCrmComments, type CrmTaskRecordRef } from "@/lib/crm/crm-v2";

import { Checklist, Clock, FileText, FlowArrow, History } from "@/lib/icons";

import type { RecordTab } from "@/components/records/record-page-shell";

/**
 * The tabs every record has, written once.
 *
 * A record was implemented five times — lead, deal, company, person, site —
 * each composing its own timeline, its own comments, its own tasks. So a fix
 * to "the record page" landed on one of five and the report came back saying
 * it was not there, correctly. Three rounds went that way.
 *
 * These build the tab from a `RecordRef`, so a change to what a timeline
 * shows is a change to one function and appears on all five.
 */

export type RecordKind = "lead" | "deal" | "company" | "person" | "site";

export type RecordRef = { kind: RecordKind; id: string };

/** The collaboration layer's name for the same record. */
const COLLAB: Record<RecordKind, CollabEntity> = {
  lead: "LEAD",
  deal: "DEAL",
  company: "COMPANY",
  person: "PERSON",
  site: "SITE",
};

/** The task layer's name for the same record. */
export function taskRef(ref: RecordRef): CrmTaskRecordRef {
  switch (ref.kind) {
    case "lead":
      return { leadId: ref.id };
    case "deal":
      return { dealId: ref.id };
    case "company":
      return { clientId: ref.id };
    case "person":
      return { personId: ref.id };
    case "site":
      return { siteId: ref.id };
  }
}

/**
 * Every record can be talked about, including a site — the composer decides
 * for itself which kinds it can offer. A site is a place rather than a
 * correspondent, so it takes comments and not logged calls.
 */
function conversationTarget(ref: RecordRef): ConversationTarget {
  return { kind: ref.kind, id: ref.id };
}

/**
 * The record's one feed: what was said and what happened, in one order.
 *
 * Comments used to be a section of their own, seven rows along the rail, while
 * notes and calls were at the top of the timeline — so a record's conversation
 * was split across two screens by a distinction (internal or not) that the
 * reader does not have in their head when they are looking for what somebody
 * said. `buildStory` has always taken comments; nothing ever passed them.
 */
/**
 * This record's comments, shaped for `buildStory`.
 *
 * A hook rather than something `conversationTab` does for itself, because the
 * tab builders are plain functions called during a page's render and a hook
 * hidden inside one is a rules-of-hooks bug waiting for the first conditional
 * tab. The page calls this, then hands the result to `buildStory` alongside
 * the activities.
 */
export function useRecordComments(ref: RecordRef) {
  const entity = COLLAB[ref.kind];
  const { data } = useQuery({
    queryKey: ["crm-comments", entity, ref.id],
    queryFn: () => fetchCrmComments(entity, ref.id),
  });

  return useMemo(
    () =>
      (data ?? []).map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: { id: comment.createdBy.id, name: comment.createdBy.name },
      })),
    [data],
  );
}

export function conversationTab({
  ref,
  events,
  emptyMessage,
}: {
  ref: RecordRef;
  events: StoryEvent[];
  emptyMessage?: string;
}): RecordTab {
  return {
    value: "timeline",
    label: "Conversation",
    icon: Clock,
    content: (
      <div className="space-y-4 md:space-y-0">
        {/* The composer pins to the top of the conversation pane.

            A record's conversation is the one section people arrive at with
            something to say, and on a lead with forty messages the reply box
            was forty messages up. Pinned, "add a note" is always one click
            away and the timeline runs underneath it.

            It bleeds out of the pane's padding and puts it back as its own, so
            the hairline reaches both edges and no row shows through the strip
            above the box on the way past. The pane's background rather than
            white: the composer card is what should read as raised, not the
            band holding it. */}
        <div className="md:sticky md:top-0 md:z-20 md:-mx-4 md:-mt-3 md:border-b md:border-[var(--border)] md:bg-[var(--canvas)] md:px-4 md:pb-2.5 md:pt-3">
          <ConversationComposer target={conversationTarget(ref)} />
        </div>
        <div className="md:pb-6 md:pt-1">
          <RecordStory events={events} emptyMessage={emptyMessage} />
        </div>
      </div>
    ),
  };
}

export function tasksTab({
  ref,
  currentUserId,
}: {
  ref: RecordRef;
  currentUserId?: string;
}): RecordTab {
  return {
    value: "tasks",
    label: "Tasks",
    icon: Checklist,
    content: <RecordTasksTab record={taskRef(ref)} currentUserId={currentUserId} />,
  };
}

/**
 * The audit trail, in one section.
 *
 * Three rows in the rail — History, Field history, Mentions — for one
 * question: what has this record been through, and where else does it come up.
 * They are genuinely different lists, which is why they were separate; they
 * are not different *destinations*, which is why they no longer are.
 */
export function historyTab({
  ref,
  entity,
  activities,
}: {
  ref: RecordRef;
  /** The field-history layer's name for this record. */
  entity: string;
  /** Omitted where the record has no activity feed of its own — a site. */
  activities?: Parameters<typeof RecordHistoryTab>[0]["activities"];
}): RecordTab {
  return {
    value: "history",
    label: "History",
    icon: History,
    content: (
      <SubSections
        label="History"
        sections={[
          ...(activities
            ? [
                {
                  value: "activity",
                  label: "Activity",
                  content: <RecordHistoryTab activities={activities} />,
                },
              ]
            : []),
          {
            value: "changes",
            label: "Field changes",
            content: <FieldHistoryTab entity={entity} recordId={ref.id} />,
          },
          {
            // The other half of a link: a reference to this site in a note on
            // a deal is exactly the connection that was invisible before.
            value: "mentions",
            label: "Mentions",
            content: <MentionsTab recordId={ref.id} />,
          },
        ]}
      />
    ),
  };
}

/** The automation layer's name for the same record. */
const AUTOMATION_ENTITY: Record<RecordKind, "LEAD" | "DEAL" | "PERSON" | "COMPANY" | "SITE"> = {
  lead: "LEAD",
  deal: "DEAL",
  company: "COMPANY",
  person: "PERSON",
  site: "SITE",
};

/**
 * What the workflows have done here, and what could still fire.
 *
 * On every kind rather than only the two that triggers currently reach: a
 * company page saying "nothing is watching this record" is a useful answer,
 * and a tab that appears and disappears depending on the record type is a tab
 * people stop looking for.
 */
export function automationTab({ ref }: { ref: RecordRef }): RecordTab {
  return {
    value: "automation",
    label: "Workflows",
    icon: FlowArrow,
    content: <AutomationTab entity={AUTOMATION_ENTITY[ref.kind]} recordId={ref.id} />,
  };
}

/**
 * All the paperwork on a record, in one section.
 *
 * A quotation and an uploaded contract are not the same object — only one of
 * them has a total, a status and a version chain — which is why the two lists
 * stay separate. But "what paperwork is on this record" is one question, and
 * it was two rows in the rail. The segmented control keeps the lists apart
 * without keeping the destinations apart.
 *
 * `documents` is the register the system raised and numbered; pass it where
 * the record has one. Files alone still render, without a control.
 */
export function paperworkTab({
  ref,
  documents,
  documentCount,
}: {
  ref: RecordRef;
  documents?: ReactNode;
  documentCount?: number;
}): RecordTab {
  return {
    value: "documents",
    label: "Documents",
    icon: FileText,
    count: documentCount,
    content: (
      <SubSections
        label="Paperwork"
        sections={[
          ...(documents
            ? [
                {
                  value: "documents",
                  label: "Issued",
                  count: documentCount,
                  content: documents,
                },
              ]
            : []),
          {
            value: "files",
            label: "Uploads",
            content: <FilesTab owner={FILE_OWNER[ref.kind]} ownerId={ref.id} />,
          },
        ]}
      />
    ),
  };
}

/** The file layer's name for the same record. */
const FILE_OWNER: Record<RecordKind, FileOwnerKind> = {
  lead: "lead",
  deal: "deal",
  company: "company",
  person: "person",
  site: "site",
};

/** A tab a single record type adds to the shared set. */
export function extraTab(tab: RecordTab): RecordTab {
  return tab;
}
