"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  MobileList,
  MobileListSectionHeader,
} from "@corelithzw/react";

import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  CardsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  ALLOWED_TRANSITIONS,
  CLOSED_STAGES,
  PIPELINE_STAGES,
  STAGE_LABELS,
  offerHasLapsed,
  type ApplicationStage,
} from "@/lib/schools/admissions-stages";
import {
  createSchoolApplication,
  enrolSchoolApplicant,
  fetchSchoolApplications,
  updateSchoolApplication,
  type DuplicateCandidateRecord,
  type SchoolsApplicationRecord,
} from "@/lib/schools/admissions-v2";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { SchoolsAdmissionsContent } from "./schools-admissions-content";
import {
  ApplicationFormSheet,
  type ApplicationFormValues,
} from "./application-form-sheet";

const STAGE_OPTIONS = [...PIPELINE_STAGES, ...CLOSED_STAGES].map((stage) => ({
  value: stage,
  label: STAGE_LABELS[stage],
}));

/**
 * What an empty column means, one stage at a time.
 *
 * Every one of these is good news read a different way — nobody stuck at
 * assessment, no offer left hanging, nobody turned down this year — so each
 * gets the sentence that actually applies rather than one generic "nothing
 * here" repeated nine times down the board.
 */
const EMPTY_STAGE_BODY: Record<ApplicationStage, string> = {
  ENQUIRY: "Nobody has rung or walked in without applying yet.",
  APPLIED: "Every application taken has been looked at and moved on.",
  ASSESSMENT: "Nobody is waiting to sit the entrance paper.",
  WAITLISTED: "Nobody is holding for a place that has not come free.",
  OFFERED: "Every offer the school has made has been answered.",
  ACCEPTED: "Everybody who accepted has been put on the roll.",
  ENROLLED: "Nobody has been enrolled from this board yet this year.",
  DECLINED: "The school has not turned anybody down.",
  WITHDRAWN: "No family has gone elsewhere.",
};

function stageBadge(stage: ApplicationStage) {
  if (stage === "ENROLLED") return <Badge tone="success">Enrolled</Badge>;
  if (stage === "DECLINED" || stage === "WITHDRAWN") {
    return <Badge tone="danger">{STAGE_LABELS[stage]}</Badge>;
  }
  return <Badge tone="outline">{STAGE_LABELS[stage]}</Badge>;
}

/**
 * The admissions pipeline, as a board.
 *
 * Grouped by stage rather than filtered to one, because the question an
 * admissions office asks in September is "where is everybody" — how many at
 * assessment, how many offers out, how many offers about to lapse — and a list
 * showing one stage at a time answers none of it.
 *
 * Columns are sections rather than a horizontal kanban. Nine columns do not fit
 * a phone, and a board you have to swipe sideways hides exactly the column
 * nobody has looked at.
 *
 * Lapsed offers are called out. An offer nobody answers is a place held for a
 * family that has gone elsewhere, and a waiting list that never moves is what
 * that costs.
 */
export function AdmissionsBoardContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"pipeline" | "enrolments">("pipeline");
  const [classFilter, setClassFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolsApplicationRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidateRecord[]>([]);
  const [enrolNote, setEnrolNote] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const applicationsQuery = useQuery({
    queryKey: ["schools", "applications", classFilter, stageFilter, search, includeClosed],
    queryFn: () =>
      fetchSchoolApplications({
        classId: classFilter || undefined,
        stage: (stageFilter || undefined) as ApplicationStage | undefined,
        search: search.trim() || undefined,
        includeClosed: includeClosed || undefined,
      }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const applications = useMemo(
    () => applicationsQuery.data?.applications ?? [],
    [applicationsQuery.data],
  );
  const counts = applicationsQuery.data?.counts ?? {};

  const now = useMemo(() => new Date(), []);

  /**
   * Every stage in the order, including the ones holding nobody.
   *
   * A kanban that drops its empty columns is a kanban whose shape changes
   * every time somebody is moved — and it hides the column worth knowing about,
   * because "nothing at Assessment" is the answer an admissions office is
   * looking for as often as a list of names. Each empty column says so in its
   * own words below.
   */
  const grouped = useMemo(() => {
    const map = new Map<ApplicationStage, SchoolsApplicationRecord[]>();
    for (const application of applications) {
      const bucket = map.get(application.stage);
      if (bucket) bucket.push(application);
      else map.set(application.stage, [application]);
    }
    // A stage filter narrows the board to one column, so the other eight are
    // not empty — they are not being asked about.
    const order = stageFilter
      ? [stageFilter as ApplicationStage]
      : includeClosed
        ? [...PIPELINE_STAGES, ...CLOSED_STAGES]
        : PIPELINE_STAGES;
    return order.map(
      (stage) => [stage, map.get(stage) ?? []] as const,
    );
  }, [applications, includeClosed, stageFilter]);

  const lapsed = applications.filter((application) =>
    offerHasLapsed(application, now),
  );

  const namedFilters = [
    classes.find((row) => row.id === classFilter)?.name,
    stageFilter ? STAGE_LABELS[stageFilter as ApplicationStage] : undefined,
    search.trim() || undefined,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setSearch("");
    setClassFilter("");
    setStageFilter("");
  }

  const saveMutation = useMutation({
    /**
     * Both branches are declared to return only the duplicate list, which is
     * all `onSuccess` reads. Correcting an application returns the stage row
     * and taking a new one returns the whole record, and leaving the return
     * type to inference made the two irreconcilable — the board refetches
     * either way, so the record itself is never what updates the screen.
     */
    mutationFn: (
      values: ApplicationFormValues,
    ): Promise<{ duplicates: DuplicateCandidateRecord[] }> => {
      if (editing) {
        // Only what PATCH takes. The child's own details are the family's
        // form, and correcting those is a new application.
        return updateSchoolApplication(editing.id, {
          guardianName: values.guardianName.trim() || null,
          guardianPhone: values.guardianPhone.trim() || null,
          guardianEmail: values.guardianEmail.trim() || null,
          appliedForClassId: values.appliedForClassId || null,
          notes: values.notes.trim() || null,
          assessmentScore:
            values.assessmentScore.trim() === "" ? null : Number(values.assessmentScore),
          assessmentAt: values.assessmentAt || null,
          // A correction is not a new child, so it never surfaces duplicates.
        }).then(() => ({ duplicates: [] }));
      }
      return createSchoolApplication({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        dateOfBirth: values.dateOfBirth || null,
        gender: values.gender || null,
        guardianName: values.guardianName.trim() || null,
        guardianPhone: values.guardianPhone.trim() || null,
        guardianEmail: values.guardianEmail.trim() || null,
        previousSchool: values.previousSchool.trim() || null,
        source: values.source || null,
        appliedForClassId: values.appliedForClassId || null,
        notes: values.notes.trim() || null,
      });
    },
    onSuccess: (result) => {
      setFormOpen(false);
      setEditing(null);
      setActionError(null);
      setDuplicates(result.duplicates);
      void queryClient.invalidateQueries({ queryKey: ["schools", "applications"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const moveMutation = useMutation({
    mutationFn: (input: { id: string; stage: ApplicationStage }) =>
      updateSchoolApplication(input.id, {
        stage: input.stage,
        // Two weeks is the usual window here, and an offer with no expiry is
        // one nobody ever chases.
        offerExpiresAt:
          input.stage === "OFFERED"
            ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
            : undefined,
      }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "applications"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const enrolMutation = useMutation({
    mutationFn: (id: string) => enrolSchoolApplicant(id),
    onSuccess: (result) => {
      setActionError(null);
      setEnrolNote(`On the roll as ${result.studentNo}.`);
      void queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  return (
    <VerticalDataViews
      items={[
        { id: "pipeline", label: "Pipeline", count: applications.length },
        { id: "enrolments", label: "Enrolments" },
      ]}
      value={view}
      onValueChange={(value) => setView(value as "pipeline" | "enrolments")}
      railLabel="Admissions views"
    >
      {view === "enrolments" ? <SchoolsAdmissionsContent /> : null}

      <div className={view === "pipeline" ? "space-y-4" : "hidden"}>
      {/* Pipeline and roll side by side: "61 in, 842 here" is the whole of
          what an admissions office is watching in September. */}
      <PageBand
        chips={[
          { label: "Pipeline", value: applications.length, tone: "brand" },
          {
            label: "Offers out",
            value: counts.OFFERED ?? 0,
            tone: lapsed.length > 0 ? "warn" : "neutral",
          },
          {
            label: "Lapsed",
            value: lapsed.length,
            tone: lapsed.length > 0 ? "danger" : "neutral",
          },
        ]}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIncludeClosed((on) => !on)}
          >
            {includeClosed ? "Hide closed" : "Show closed"}
          </Button>
        }
      />

      {applicationsQuery.error ? (
        <LoadError
          what="the applications"
          error={applicationsQuery.error}
          onRetry={() => void applicationsQuery.refetch()}
        />
      ) : null}
      {actionError ? <SaveError what="That change" error={actionError} /> : null}
      {enrolNote ? (
        <Alert tone="success" title="Enrolled">
          {enrolNote}
        </Alert>
      ) : null}
      {duplicates.length > 0 ? (
        <Alert
          tone="warn"
          title={`${duplicates.length} existing application${duplicates.length === 1 ? "" : "s"} worth a look`}
        >
          {duplicates
            .map(
              (row) =>
                `${row.lastName}, ${row.firstName} (${row.applicationNo}) — ${row.reason}`,
            )
            .join("; ")}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FilterBar>
          <div className="min-w-0 flex-1 basis-[180px] sm:max-w-[220px]">
            <Label htmlFor="admissions-search" className="text-sm text-muted-foreground">
              Find
            </Label>
            <Input
              id="admissions-search"
              value={search}
              placeholder="Name or number"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FilterSelect
            label="Year group"
            allLabel="Any year group"
            value={classFilter}
            options={classes.map((row) => ({ value: row.id, label: row.name }))}
            onChange={setClassFilter}
          />
          <FilterSelect
            label="Stage"
            allLabel="Open stages"
            value={stageFilter}
            options={STAGE_OPTIONS}
            onChange={setStageFilter}
          />
        </FilterBar>
        <CreateButton
          resource="schools.admissions"
          label="New application"
          onSelect={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {PIPELINE_STAGES.map((stage) => `${counts[stage] ?? 0} ${STAGE_LABELS[stage].toLowerCase()}`).join(
          " · ",
        )}
      </p>

      {lapsed.length > 0 ? (
        <Alert
          tone="danger"
          title={`${lapsed.length} offer${lapsed.length === 1 ? " has" : "s have"} run out`}
        >
          {lapsed
            .map((row) => `${row.lastName}, ${row.firstName} (${row.applicationNo})`)
            .join(", ")}{" "}
          — the place is being held for a family that has not answered.
        </Alert>
      ) : null}

      {applicationsQuery.isLoading ? (
        /*
          The pipeline is a kanban of stages, so the placeholder is a column of
          cards and not a table — a grey table under section headings that are
          about to be "Assessment · 9" reflows the whole board when the real
          groups land. Three columns' worth: what a September board holds.
        */
        <div className="space-y-3">
          <CardsSkeleton count={6} columns={3} lines={2} />
        </div>
      ) : applications.length === 0 ? (
        namedFilters.length > 0 ? (
          <NothingMatched
            what="applications"
            filters={namedFilters}
            onClear={clearFilters}
          />
        ) : Object.values(counts).every((count) => !count) ? (
          /*
            No application has ever been taken. That is a school before its
            first enquiry, not a cleared board, so it offers the verb that
            fills it.
          */
          <NothingYet
            title="Nobody has applied yet"
            body="An enquiry taken at the desk starts here and moves along the stage ladder as the school decides."
            action={
              <CreateButton
                resource="schools.admissions"
                label="New application"
                onSelect={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              />
            }
          />
        ) : (
          <NothingLeftToDo
            title="Nothing in the pipeline"
            body="Every application has been decided. New enquiries land here as they are taken at the desk."
          />
        )
      ) : (
        /*
          Moving a child along the ladder and enrolling one both rewrite the
          board this list is grouped from, so the whole board dims while either
          is in flight. A second Offer pressed on the row below is a second
          decision recorded against a stage that has already moved.
        */
        <SavingOverlay
          saving={moveMutation.isPending || enrolMutation.isPending}
          label={enrolMutation.isPending ? "Enrolling…" : "Saving…"}
        >
      <MobileList>
        {grouped.map(([stage, rows]) => (
            <div key={stage}>
              <MobileListSectionHeader>
                {STAGE_LABELS[stage]} · {rows.length}
              </MobileListSectionHeader>
              {rows.length === 0 ? (
                /*
                  An empty column is good news, not a missing record: nobody is
                  stuck at Assessment, every offer has been answered. So it is
                  NothingLeftToDo and never a create button — you do not put a
                  child into "Offered" by hand, they arrive from the stage
                  before it.
                */
                <NothingLeftToDo
                  title={`Nobody at ${STAGE_LABELS[stage].toLowerCase()}`}
                  body={EMPTY_STAGE_BODY[stage]}
                />
              ) : null}
              {rows.map((application) => {
                const next = ALLOWED_TRANSITIONS[application.stage];
                return (
                  <MobileList.Row
                    key={application.id}
                    static
                    title={`${application.lastName}, ${application.firstName}`}
                    subtitle={
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span>
                          {application.applicationNo}
                          {application.appliedForClass
                            ? ` · ${application.appliedForClass.name}`
                            : ""}
                          {application.guardianName
                            ? ` · ${application.guardianName}`
                            : ""}
                          {application.assessmentScore !== null
                            ? ` · entrance ${Number(application.assessmentScore)}%`
                            : ""}
                        </span>
                        {stageBadge(application.stage)}
                        {offerHasLapsed(application, now) ? (
                          <Badge tone="danger">Offer lapsed</Badge>
                        ) : null}
                        {/* Correcting the file and deciding on the child are
                            different acts with different grants — `edit` and
                            `approve` — so they are different verbs, each
                            disabled with the reason rather than hidden. */}
                        <RecordActions
                          resource="schools.admissions"
                          verbs={[
                            {
                              label: "Edit",
                              action: "edit",
                              onSelect: () => {
                                setEditing(application);
                                setFormOpen(true);
                              },
                            },
                            ...(application.stage === "ACCEPTED"
                              ? [
                                  {
                                    label: "Enrol",
                                    action: "approve" as const,
                                    loading: enrolMutation.isPending,
                                    confirm: {
                                      title: `Enrol ${application.firstName} ${application.lastName}`,
                                      description:
                                        "A student record is created and a student number allocated. The application closes as enrolled and cannot be walked back through admissions.",
                                      confirmLabel: "Enrol",
                                    },
                                    onSelect: () => enrolMutation.mutate(application.id),
                                  },
                                ]
                              : []),
                            ...next
                              .filter((target) => target !== "ENROLLED")
                              .map((target) => ({
                                label: STAGE_LABELS[target],
                                action: "approve" as const,
                                tone:
                                  target === "DECLINED" || target === "WITHDRAWN"
                                    ? ("danger" as const)
                                    : ("default" as const),
                                loading: moveMutation.isPending,
                                ...(target === "DECLINED" || target === "WITHDRAWN"
                                  ? {
                                      confirm: {
                                        title:
                                          target === "DECLINED"
                                            ? `Turn ${application.firstName} ${application.lastName} down`
                                            : `Mark ${application.firstName} ${application.lastName} withdrawn`,
                                        description:
                                          target === "DECLINED"
                                            ? "The school has said no. The application leaves the board and the place is freed for the waiting list."
                                            : "The family has gone elsewhere. The application leaves the board and the place is freed for the waiting list.",
                                        confirmLabel: STAGE_LABELS[target],
                                      },
                                    }
                                  : {}),
                                onSelect: () =>
                                  moveMutation.mutate({
                                    id: application.id,
                                    stage: target,
                                  }),
                              })),
                          ]}
                        />
                      </span>
                    }
                  />
                );
              })}
            </div>
        ))}
      </MobileList>
        </SavingOverlay>
      )}

      <ApplicationFormSheet
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
        application={editing}
        classes={classes.map((row) => ({ id: row.id, name: row.name }))}
        isSubmitting={saveMutation.isPending}
        error={saveMutation.isError ? actionError : null}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
      </div>
    </VerticalDataViews>
  );
}
