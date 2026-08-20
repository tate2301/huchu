import type { StoryEvent } from "@/components/crm/records/record-story";
// The wire-type → kind map lives beside the table that says what each kind
// looks like, so a new activity type is one edit and not two.
import { ACTIVITY_KIND } from "@/components/crm/records/event-kind";

/**
 * Turning a record's several tables into one story.
 *
 * The activity table alone is not the story — it is whichever chapter that
 * table happened to keep. A site visit is in appointments, a task is in
 * follow-ups, a quote is in documents, and none of those live where the
 * activity rows do. The reader does not care which table anything came from;
 * they care what happened, in order.
 *
 * These are pure so the merge is testable without a page around it.
 */

type ActivityLike = {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  occurredAt: string;
  createdBy?: { id: string; name: string | null } | null;
};

type TaskLike = {
  id: string;
  title: string;
  notes?: string | null;
  dueAt: string;
  status: string;
  completedAt?: string | null;
  createdAt?: string;
};

type VisitLike = {
  id: string;
  title: string;
  appointmentNo?: string;
  status: string;
  scheduledStart: string;
  reportNotes?: string | null;
  location?: string | null;
  photos?: unknown;
};

type DocumentLike = {
  id: string;
  type: string;
  amount?: number | null;
  currency?: string;
  createdAt: string;
  version?: number;
};

type CommentLike = {
  id: string;
  body: string;
  createdAt: string;
  author?: { id: string; name: string | null } | null;
};


/**
 * The types somebody writes prose into. Their content is written in the CRM's
 * text format — mentions, emphasis — so it has to reach the renderer, and it
 * must not also be printed as a heading above itself.
 */
const WRITTEN_LABEL: Record<string, string> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
};

export function activityEvents(activities: ActivityLike[]): StoryEvent[] {
  return activities.map((activity) => {
    const written = WRITTEN_LABEL[activity.type];
    const body = activity.body?.trim() ? activity.body : null;

    // A written activity shows its type as the heading and its prose as the
    // body, so the body is the thing that runs through the renderer. Where
    // there is no body the subject IS the prose — that is every note logged
    // before the composer stopped splitting on the first newline, and those
    // rows were printing `@[Name](uuid)` at the reader.
    if (written) {
      return {
        id: activity.id,
        kind: ACTIVITY_KIND[activity.type] ?? "system",
        title: written,
        body: body ?? activity.subject,
        occurredAt: activity.occurredAt,
        actorName: activity.createdBy?.name ?? null,
      };
    }

    // Generated entries — a stage change, a document raised — are one-liners
    // written by the system, with nothing to render.
    return {
      id: activity.id,
      kind: ACTIVITY_KIND[activity.type] ?? "system",
      title: activity.subject,
      body,
      occurredAt: activity.occurredAt,
      actorName: activity.createdBy?.name ?? null,
    };
  });
}

/**
 * Tasks appear twice on purpose — once when they were made and once when they
 * were finished. Those are two different facts about the record, and a feed
 * that only shows the second cannot tell you how long the first waited.
 */
export function taskEvents(tasks: TaskLike[]): StoryEvent[] {
  const events: StoryEvent[] = [];
  for (const task of tasks) {
    if (task.createdAt) {
      events.push({
        id: `${task.id}-created`,
        kind: "task",
        title: `Task created — ${task.title}`,
        body: task.notes ?? null,
        occurredAt: task.createdAt,
        meta: `Due ${new Date(task.dueAt).toLocaleDateString()}`,
      });
    }
    if (task.completedAt) {
      events.push({
        id: `${task.id}-done`,
        kind: "task",
        title: `Task completed — ${task.title}`,
        occurredAt: task.completedAt,
      });
    }
  }
  return events;
}

export function visitEvents(visits: VisitLike[]): StoryEvent[] {
  return visits.map((visit) => {
    const photoCount = Array.isArray(visit.photos) ? visit.photos.length : 0;
    return {
      id: visit.id,
      kind: "visit" as const,
      title:
        visit.status === "COMPLETED"
          ? `Site visit — ${visit.title}`
          : `Site visit booked — ${visit.title}`,
      body: visit.reportNotes ?? null,
      occurredAt: visit.scheduledStart,
      meta: [
        visit.appointmentNo,
        visit.location,
        photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
}

export function documentEvents(documents: DocumentLike[]): StoryEvent[] {
  return documents.map((document) => ({
    id: document.id,
    kind: document.type === "RECEIPT" ? ("payment" as const) : ("document" as const),
    title: `${document.type.charAt(0)}${document.type.slice(1).toLowerCase()} raised${
      document.version && document.version > 1 ? ` (v${document.version})` : ""
    }`,
    occurredAt: document.createdAt,
    meta:
      typeof document.amount === "number"
        ? document.amount.toLocaleString(undefined, {
            style: "currency",
            currency: document.currency ?? "USD",
            maximumFractionDigits: 0,
          })
        : null,
  }));
}

export function commentEvents(comments: CommentLike[]): StoryEvent[] {
  return comments.map((comment) => ({
    id: comment.id,
    kind: "comment" as const,
    // The body carries any @mentions as written; the renderer resolves them.
    // The kind, not a sentence: the feed's header line already prints the
    // author beside their avatar, so "Sarah commented" next to "Sarah" was the
    // name twice and the useful word — which of the five kinds this is — never.
    title: "Comment",
    body: comment.body,
    occurredAt: comment.createdAt,
    actorName: comment.author?.name ?? null,
  }));
}

/** Everything a record knows about itself, in one ordered list. */
export function buildStory(sources: {
  activities?: ActivityLike[];
  tasks?: TaskLike[];
  visits?: VisitLike[];
  documents?: DocumentLike[];
  comments?: CommentLike[];
  createdAt?: string;
  createdLabel?: string;
}): StoryEvent[] {
  const events = [
    ...activityEvents(sources.activities ?? []),
    ...taskEvents(sources.tasks ?? []),
    ...visitEvents(sources.visits ?? []),
    ...documentEvents(sources.documents ?? []),
    ...commentEvents(sources.comments ?? []),
  ];

  // The first fact about any record is that it started existing. Without it a
  // feed that has scrolled to its end just stops, and the reader cannot tell
  // whether they have reached the beginning or the page gave up.
  if (sources.createdAt) {
    events.push({
      id: "record-created",
      kind: "system",
      title: sources.createdLabel ?? "Record created",
      occurredAt: sources.createdAt,
    });
  }

  return events.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}
