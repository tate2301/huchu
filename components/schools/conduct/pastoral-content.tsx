"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  NotYourJob,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { getApiErrorMessage } from "@/lib/api-client";
import { Lock } from "@/lib/icons";
import {
  askToSeeNote,
  fetchPastoralNotes,
  fetchPastoralReaders,
  PASTORAL_BAND_LABELS,
  writePastoralNote,
  type PastoralBand,
  type ListedProjection,
} from "@/lib/schools/conduct-v2";
import { formatSchoolDayShort } from "@/lib/schools/format";
import { PastoralNoteDialog } from "@/components/schools/conduct/pastoral-note-dialog";
import { WriteNoteSheet } from "@/components/schools/conduct/write-note-sheet";

/**
 * Pastoral notes — S-12.3, and the one screen in the pack holding notes a
 * parent must not see.
 *
 * Sister Moyo, the school nurse, on a Thursday afternoon after a Form 4 girl's
 * third visit to the san in a week, wanting to know whether anyone else has
 * written anything down about her before she writes the fourth note herself.
 *
 * ## What is deliberate here, and must survive an edit
 *
 * **The readers register is a tab, not a thing switched on from above the
 * page.** Who may read a pastoral note is its own subject with its own rows, so
 * it sits beside `Notes` on the control row, one click from them. The notes
 * still say their own scope without it in view: the search box is scoped in its
 * placeholder, the `Visibility` filter rests at `Everything you may read`, and
 * every row carries the band that let it through.
 *
 * **A withheld row is a first-class row, not an error state.** It keeps its
 * place in date order, because its position is itself information — a note
 * exists between 31 August and 24 August — and a list that hid it would look
 * complete when it is not. It carries a date, a band, and the sentence
 * `A note you may not read`. It does **not** carry the pupil, because the pupil
 * is the one fact that would let a reader infer the content from context.
 *
 * **`Search the notes you may read` is a permission statement, not a
 * placeholder.** It is not `Search pastoral notes`, and it must not be
 * paraphrased to that: the index itself is scoped, and the placeholder says so
 * before anybody types a pupil's name in and reads a result count as a signal.
 *
 * **There is no export and no print on this screen.** Every other conduct
 * screen has one. This one has a shield instead, and that absence is one of the
 * four `Never` rules enacted in the chrome.
 *
 * **The skeleton does not distinguish a withheld row from a readable one.** If
 * the placeholder shapes differed, the redaction would be legible before the
 * data arrived.
 */

const VISIBILITY_OPTIONS: Array<{ value: PastoralBand; label: string }> = [
  { value: "PASTORAL_TEAM_ONLY", label: PASTORAL_BAND_LABELS.PASTORAL_TEAM_ONLY },
  { value: "HEAD_AND_PASTORAL_TEAM", label: PASTORAL_BAND_LABELS.HEAD_AND_PASTORAL_TEAM },
  {
    value: "SAFEGUARDING_NAMED_INDIVIDUALS",
    label: PASTORAL_BAND_LABELS.SAFEGUARDING_NAMED_INDIVIDUALS,
  },
];

const REVIEW_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "due", label: "Still to come" },
  { value: "none", label: "None needed" },
];

function BandBadge({ band }: { band: PastoralBand }) {
  // Violet for the safeguarding band, which is the tone the canvas reserves for
  // pastoral and uses nowhere else.
  if (band === "SAFEGUARDING_NAMED_INDIVIDUALS") {
    return <Badge accent="violet">{PASTORAL_BAND_LABELS[band]}</Badge>;
  }
  return (
    <Badge tone={band === "HEAD_AND_PASTORAL_TEAM" ? "brand" : "neutral"}>
      {PASTORAL_BAND_LABELS[band]}
    </Badge>
  );
}

/**
 * The hatched bar a withheld note draws where a body would be.
 *
 * Not a blurred body, not a truncated one, not a character count. There is
 * nothing behind it: the row was built from three columns and the body was
 * never selected.
 */
function HatchedBar() {
  return (
    <span
      aria-hidden="true"
      className="block h-4 w-full max-w-[420px] rounded-[4px] border border-[color:var(--border-subtle)]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--surface-muted) 0 6px, var(--border-subtle) 6px 12px)",
      }}
    />
  );
}

/** The two populations on this screen: the notes, and the people who may read them. */
type View = "notes" | "readers";

export function PastoralContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("notes");
  const [search, setSearch] = useState("");
  const [classValue, setClassValue] = useState<{ classId: string; streamId: string }>({
    classId: "",
    streamId: "",
  });
  const [bandFilter, setBandFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [writeOpen, setWriteOpen] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: [
      "schools",
      "pastoral",
      "notes",
      bandFilter,
      reviewFilter,
      classValue.classId,
      classValue.streamId,
      search,
    ],
    queryFn: () =>
      fetchPastoralNotes({
        band: (bandFilter as PastoralBand) || undefined,
        review: (reviewFilter as "overdue" | "due" | "none") || undefined,
        // In the key as well as in the arguments: without it a year-group
        // change reads a cached page and the list does not move.
        classId: classValue.classId || undefined,
        streamId: classValue.streamId || undefined,
        search: search.trim() || undefined,
      }),
  });

  const readersQuery = useQuery({
    queryKey: ["schools", "pastoral", "readers"],
    queryFn: fetchPastoralReaders,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "pastoral"] });
  };

  const write = useMutation({
    mutationFn: (input: Parameters<typeof writePastoralNote>[0]) => writePastoralNote(input),
    onSuccess: () => {
      setWriteOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const ask = useMutation({
    mutationFn: (noteId: string) => askToSeeNote(noteId),
    onSuccess: () => {
      setAsking(null);
      setActionError(null);
      invalidate();
    },
    onError: (error) => {
      setAsking(null);
      setActionError(getApiErrorMessage(error));
    },
  });

  const listing = notesQuery.data;
  const counts = listing?.counts;
  const notes: ListedProjection[] = listing?.notes ?? [];
  const readers = readersQuery.data;
  const cleared = readers?.readers.filter((reader) => reader.cleared).length;
  const readableShown = notes.filter((note) => note.readable).length;

  const namedFilters = [
    classValue.classId ? "a class" : null,
    VISIBILITY_OPTIONS.find((option) => option.value === bandFilter)?.label,
    REVIEW_OPTIONS.find((option) => option.value === reviewFilter)?.label,
  ].filter((entry): entry is string => Boolean(entry));

  // A member of staff who holds the grant and no clearance gets the page and a
  // sentence naming who can — not a 404. Hiding the destination entirely would
  // make a nurse think the feature does not exist.
  const uncleared = listing != null && !listing.cleared;

  return (
    <SchoolsPage>
      <PageChrome title="Pastoral notes">
        <CreateButton
          resource="schools.pastoral"
          label="Write a note"
          onSelect={() => setWriteOpen(true)}
        />
      </PageChrome>

      {actionError ? <SaveError what="That note" error={actionError} /> : null}

      {uncleared ? (
        <NotYourJob action="view" resource="schools.pastoral" what="A pastoral note" />
      ) : null}

      {/* One control row for both populations. `You may read` is read off the
          count here — it is how many rows there are, so it belongs beside the
          filters that move it, with the withheld total after it because a count
          of what is showing only reads straight next to a count of what is not.
          The search and the filters are the notes' own and are not drawn over
          the register, which has neither. */}
      <TableControls
        sticky
        tabs={
          <PopulationTabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { id: "notes", label: "Notes", count: counts?.youMayRead },
              { id: "readers", label: "Who may read", count: cleared },
            ]}
          />
        }
        search={
          view === "notes" ? (
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search the notes you may read"
            />
          ) : undefined
        }
        filterCount={
          view === "notes"
            ? activeFilterCount(classValue.classId, bandFilter, reviewFilter)
            : undefined
        }
        filters={
          view === "notes" ? (
            <>
              <ClassFilter
                value={classValue}
                onChange={setClassValue}
              />
              {/* The unfiltered state of this table is already a filtered
                  state, and the control says so. */}
              <FilterSelect
                label="Visibility"
                allLabel="Everything you may read"
                value={bandFilter}
                options={VISIBILITY_OPTIONS}
                onChange={setBandFilter}
              />
              <FilterSelect
                label="Review"
                allLabel="Any review date"
                value={reviewFilter}
                options={REVIEW_OPTIONS}
                onChange={setReviewFilter}
              />
            </>
          ) : undefined
        }
        count={
          view === "notes"
            ? counts
              ? `${readableShown} of ${counts.youMayRead} · ${counts.withheldFromYou} withheld`
              : null
            : readers
              ? `${cleared} of ${readers.readers.length} cleared · ${readers.never.length} never`
              : null
        }
      />

      {view === "readers" ? (
        <section className="space-y-2">
          {readersQuery.error ? (
            <LoadError
              what="the readers register"
              error={readersQuery.error}
              onRetry={() => void readersQuery.refetch()}
            />
          ) : readersQuery.isPending ? (
            <TableRowsSkeleton
              rows={6}
              headers={["Who or where", "May read", ""]}
              columns={[{ avatar: true }, {}, { width: 130 }]}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="w-[320px] py-1 font-normal">Who or where</th>
                  <th className="py-1 font-normal">May read</th>
                  <th className="w-[130px] py-1 text-right font-normal">
                    <span className="sr-only">Standing</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[color:var(--surface-muted)]">
                  <th
                    colSpan={3}
                    className="py-1.5 text-left text-xs font-semibold text-[color:var(--text-muted)]"
                  >
                    Staff · {readers?.readers.length ?? 0} of {readers?.staffTotal ?? 0}
                  </th>
                </tr>
                {(readers?.readers ?? []).map((reader) => (
                  <tr
                    key={reader.userId}
                    className="border-t border-[color:var(--border-subtle)]"
                  >
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <PersonAvatar name={reader.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold">
                            {reader.name}
                          </span>
                          <span className="block truncate text-[11px] text-[color:var(--text-muted)]">
                            {reader.role ?? "Staff"}
                            {reader.isYou ? " — you" : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5">{reader.mayRead}</td>
                    <td className="py-1.5 text-right">
                      {reader.cleared ? (
                        <Badge accent="violet">Cleared</Badge>
                      ) : (
                        <Badge tone="neutral">Not cleared</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Not readers with zero permissions: systems, filed in the
                    same table because the rule is the same kind of fact. Each
                    is a code path that must not exist. */}
                <tr className="bg-[color:var(--surface-muted)]">
                  <th
                    colSpan={3}
                    className="py-1.5 text-left text-xs font-semibold text-[color:var(--text-muted)]"
                  >
                    Never
                  </th>
                </tr>
                {(readers?.never ?? []).map((destination) => (
                  <tr key={destination} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-1.5">{destination}</td>
                    <td className="py-1.5">Nothing</td>
                    <td className="py-1.5 text-right">
                      <Badge tone="danger">Never</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {view === "notes" ? (
        <section className="space-y-2">
          {notesQuery.error ? (
            // Fails closed. There is no unredacted fallback and there must not be.
            <LoadError
              what="the notes"
              error={notesQuery.error}
              onRetry={() => void notesQuery.refetch()}
            />
          ) : notesQuery.isPending ? (
            <TableRowsSkeleton
              rows={7}
              headers={["Pupil", "Written by", "The note", "Who may read it", "Review", ""]}
              columns={[
                { avatar: true, twoLine: true },
                { width: 124, twoLine: true },
                {},
                { width: 196, badge: true },
                { width: 92 },
                { width: 96 },
              ]}
            />
          ) : notes.length === 0 ? (
            namedFilters.length > 0 || search.trim() ? (
              <NothingMatched
                what="notes"
                filters={namedFilters}
                search={search}
                onClear={() => {
                  setBandFilter("");
                  setReviewFilter("");
                  setSearch("");
                  setClassValue({ classId: "", streamId: "" });
                }}
              />
            ) : (
              <NothingYet
                title="Nobody has written a pastoral note"
                body="A pastoral note is what the school knows about a child that a discipline record cannot hold."
              />
            )
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="w-[176px] py-1 font-normal">Pupil</th>
                  <th className="w-[124px] py-1 font-normal">Written by</th>
                  <th className="py-1 font-normal">The note</th>
                  <th className="w-[196px] py-1 font-normal">Who may read it</th>
                  <th className="w-[92px] py-1 font-normal">Review</th>
                  <th className="w-[96px] py-1 text-right font-normal">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <Fragment key={note.id}>
                    {note.readable ? (
                      <tr className="border-t border-[color:var(--border-subtle)] align-top">
                        <td className="py-2 pr-3">
                          <span className="block truncate text-[12.5px] font-semibold">
                            {note.student.lastName}, {note.student.firstName}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-[color:var(--text-muted)]">
                            {note.student.studentNo}
                            {note.student.className ? ` · ${note.student.className}` : ""}
                            {note.student.streamName ? ` ${note.student.streamName}` : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="block truncate text-xs">
                            {note.authorName ?? "A member of staff"}
                          </span>
                          <span className="block font-mono text-[11px] text-[color:var(--text-muted)]">
                            {formatSchoolDayShort(note.writtenAt)}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {/*
                            What the note says is not in this row, and that is
                            the point. Disclosing a safeguarding body is an
                            audited act — `openNote` writes
                            `schools.pastoral.note.read` — and printing it here
                            handed every cleared reader every body on page load
                            with nothing written down. The verb below opens it
                            through the path that records who read it.
                          */}
                          <span className="block text-xs text-[color:var(--text-muted)]">
                            Open it to read it
                          </span>
                          {note.referredTo ? (
                            <span className="mt-1 inline-block">
                              <Badge tone="success">Referred: {note.referredTo}</Badge>
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          <BandBadge band={note.band} />
                        </td>
                        <td className="py-2 pr-3">
                          {note.reviewDueAt ? (
                            <span
                              className={`font-mono text-xs ${
                                new Date(note.reviewDueAt) < new Date()
                                  ? "text-[color:var(--tone-warn)]"
                                  : "text-[color:var(--text-muted)]"
                              }`}
                            >
                              {new Date(note.reviewDueAt) < new Date() ? "Was due " : ""}
                              {formatSchoolDayShort(note.reviewDueAt)}
                            </span>
                          ) : (
                            <span className="text-xs text-[color:var(--text-faint)]">
                              None needed
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <RecordActions
                            layout="inline"
                            size="sm"
                            resource="schools.pastoral"
                            verbs={[
                              {
                                label: "Open",
                                action: "view",
                                // Opening is the act that writes the audit
                                // event, which is why it is a request rather
                                // than an expand of a body already in memory.
                                onSelect: () => setOpenNoteId(note.id),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr className="border-t border-[color:var(--border-subtle)] align-top">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1.5">
                            <Lock
                              className="size-4 text-[color:var(--accent-violet-fg,var(--brand))]"
                              aria-hidden="true"
                            />
                            <span className="text-[12px] font-semibold text-[color:var(--accent-violet-fg,var(--brand))]">
                              A note you may not read
                            </span>
                          </span>
                        </td>
                        {/* The date sits here, under `Not shown`, rather than
                            in the Review column — `conduct.md` open question
                            3: the artboard puts it under a heading that means
                            something else, and a reader could conclude a
                            safeguarding note is due for review on the day it
                            was written. */}
                        <td className="py-2 pr-3">
                          <span className="block text-xs text-[color:var(--text-faint)]">
                            Not shown
                          </span>
                          <span className="block font-mono text-[11px] text-[color:var(--text-muted)]">
                            {formatSchoolDayShort(note.writtenAt)}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <HatchedBar />
                        </td>
                        <td className="py-2 pr-3">
                          <BandBadge band={note.band} />
                        </td>
                        <td className="py-2 pr-3" />
                        <td className="py-2 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={ask.isPending && asking === note.id}
                            onClick={() => {
                              setAsking(note.id);
                              ask.mutate(note.id);
                            }}
                          >
                            Ask to see it
                          </Button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {/* `Review overdue` and `Referred on` are read from here.
                    Both are counted over every note this reader is cleared
                    for rather than over the rows a filter has left showing,
                    which is why the line names what it is counting instead of
                    sitting there looking like a sum of the rows above it. */}
                {counts ? (
                  <tr className="border-t-2 border-[color:var(--border)]">
                    <td className="py-1.5 text-xs font-semibold" colSpan={2}>
                      Every note you may read
                    </td>
                    <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                      {counts.referredOn} referred on
                    </td>
                    <td className="py-1.5" />
                    <td
                      colSpan={2}
                      className={`py-1.5 text-xs ${
                        counts.reviewOverdue > 0
                          ? "text-[color:var(--tone-warn)]"
                          : "text-[color:var(--text-muted)]"
                      }`}
                    >
                      {counts.reviewOverdue} overdue for review
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <PastoralNoteDialog
        noteId={openNoteId}
        onOpenChange={(next) => {
          if (!next) setOpenNoteId(null);
        }}
      />

      <WriteNoteSheet
        open={writeOpen}
        onOpenChange={setWriteOpen}
        readers={readers?.readers ?? []}
        isSaving={write.isPending}
        onSubmit={(values) => write.mutate(values)}
      />
    </SchoolsPage>
  );
}
