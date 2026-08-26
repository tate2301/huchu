"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, StatCard } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PageBand } from "@/components/schools/common/page-band";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CONSENT_LABELS, type ConsentKey } from "@/lib/schools/health-consents";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";

type HealthRecord = {
  id: string;
  allergies: string | null;
  chronicConditions: string | null;
  medications: string | null;
  dietaryRequirements: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  consentFirstAid: boolean;
  consentEmergencyTreatment: boolean;
  consentPhotography: boolean;
  consentOutings: boolean;
  consentGivenBy: string | null;
  consentGivenAt: string | null;
};

type Row = {
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    isBoarding: boolean;
    className: string | null;
  };
  record: HealthRecord | null;
  gaps: string[];
};

type Draft = {
  allergies: string;
  chronicConditions: string;
  medications: string;
  dietaryRequirements: string;
  doctorName: string;
  doctorPhone: string;
  consentGivenBy: string;
} & Record<ConsentKey, boolean>;

function draftFrom(row: Row | null): Draft {
  const record = row?.record ?? null;
  return {
    allergies: record?.allergies ?? "",
    chronicConditions: record?.chronicConditions ?? "",
    medications: record?.medications ?? "",
    dietaryRequirements: record?.dietaryRequirements ?? "",
    doctorName: record?.doctorName ?? "",
    doctorPhone: record?.doctorPhone ?? "",
    consentGivenBy: record?.consentGivenBy ?? "",
    consentFirstAid: record?.consentFirstAid ?? false,
    consentEmergencyTreatment: record?.consentEmergencyTreatment ?? false,
    consentPhotography: record?.consentPhotography ?? false,
    consentOutings: record?.consentOutings ?? false,
  };
}

const EVENT_KINDS = [
  { value: "SANATORIUM_VISIT", label: "Sanatorium visit" },
  { value: "MEDICATION", label: "Medication given" },
  { value: "INJURY", label: "Injury" },
  { value: "REFERRAL", label: "Referral" },
  { value: "SCREENING", label: "Screening" },
];

/**
 * The welfare list.
 *
 * Built from the children outward, not from the health records, so a child with
 * nothing on file is a row saying so rather than an absence. That is the whole
 * job of this screen: an allergy nobody has recorded looks exactly like a child
 * with no allergies, and only a list of the gaps tells them apart.
 *
 * The gaps lead each row. "No consent to treat" against a child with a peanut
 * allergy is the sentence a boarding school needs in front of it, and burying
 * it inside a detail page means nobody reads it until the night it matters.
 *
 * Two verbs, and they are different acts. Recording the standing record is what
 * the family agreed to once; logging a visit is what happened at half past two
 * this morning. Putting the second on the same form as the first would mean a
 * nurse editing consents to write down a nosebleed.
 */
export function WelfareContent() {
  const queryClient = useQueryClient();
  const [classFilter, setClassFilter] = useState("");
  const [boardersOnly, setBoardersOnly] = useState(false);
  const [gapFilter, setGapFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(null));
  const [actionError, setActionError] = useState<string | null>(null);
  const [loggingFor, setLoggingFor] = useState<Row | null>(null);
  const [logAnybody, setLogAnybody] = useState(false);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const listQuery = useQuery({
    queryKey: ["schools", "health", classFilter, boardersOnly],
    queryFn: () =>
      fetchJson<{ rows: Row[] }>(
        `/api/v2/schools/health?${new URLSearchParams({
          ...(classFilter ? { classId: classFilter } : {}),
          ...(boardersOnly ? { boardingOnly: "true" } : {}),
        }).toString()}`,
      ),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const allRows = useMemo(() => listQuery.data?.rows ?? [], [listQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (gapFilter === "outstanding" && row.gaps.length === 0) return false;
      if (gapFilter === "complete" && row.gaps.length > 0) return false;
      if (
        gapFilter === "urgent" &&
        !row.gaps.some((gap) => gap.includes("Allergy on file"))
      ) {
        return false;
      }
      if (!needle) return true;
      return `${row.student.firstName} ${row.student.lastName} ${row.student.studentNo}`
        .toLowerCase()
        .includes(needle);
    });
  }, [allRows, gapFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.student.className ?? "Not in a class";
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [rows]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Nothing being edited");
      return fetchJson(`/api/v2/schools/health/${editing.student.id}`, {
        method: "PUT",
        body: JSON.stringify({
          allergies: draft.allergies.trim() || null,
          chronicConditions: draft.chronicConditions.trim() || null,
          medications: draft.medications.trim() || null,
          dietaryRequirements: draft.dietaryRequirements.trim() || null,
          doctorName: draft.doctorName.trim() || null,
          doctorPhone: draft.doctorPhone.trim() || null,
          consentGivenBy: draft.consentGivenBy.trim() || null,
          consentFirstAid: draft.consentFirstAid,
          consentEmergencyTreatment: draft.consentEmergencyTreatment,
          consentPhotography: draft.consentPhotography,
          consentOutings: draft.consentOutings,
        }),
      });
    },
    onSuccess: () => {
      setActionError(null);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "health"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const missing = allRows.filter((row) => row.gaps.length > 0).length;
  const complete = allRows.length - missing;
  const urgent = allRows.filter((row) =>
    row.gaps.some((gap) => gap.includes("Allergy on file")),
  ).length;

  return (
    <div className="space-y-4">
      <PageHeading
        title="Health and welfare"
        primaryAction={
          <CreateButton
            resource="schools.boarding"
            label="Log a visit"
            onSelect={() => {
              setLoggingFor(null);
              setLogAnybody(true);
            }}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Children", value: allRows.length },
          {
            label: "Still to record",
            value: missing,
            tone: missing > 0 ? "warn" : "success",
          },
          {
            label: "Allergy, no consent",
            value: urgent,
            tone: urgent > 0 ? "danger" : "neutral",
          },
        ]}
      />

      {listQuery.error ? (
        <LoadError
          what="the welfare list"
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
        />
      ) : null}

      {listQuery.isLoading ? (
        <StatsSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Complete" value={complete} tone="success" />
          <StatCard label="Still to record" value={missing} tone={missing > 0 ? "warn" : "neutral"} />
          <StatCard
            label="Allergy, no consent"
            value={urgent}
            tone={urgent > 0 ? "danger" : "neutral"}
          />
        </div>
      )}

      {urgent > 0 ? (
        <Alert
          tone="danger"
          title={`${urgent} child${urgent === 1 ? "" : "ren"} with an allergy and no consent to treat`}
        >
          This is the combination a school cannot be caught by. Ring home before anything
          else on this page.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FilterBar>
          <FilterSelect
            label="Year group"
            allLabel="The whole school"
            value={classFilter}
            options={classes.map((row) => ({ value: row.id, label: row.name }))}
            onChange={setClassFilter}
          />
          <FilterSelect
            label="On file"
            allLabel="Everything on file"
            value={gapFilter}
            options={[
              { value: "urgent", label: "Allergy, no consent" },
              { value: "outstanding", label: "Something still to record" },
              { value: "complete", label: "Complete" },
            ]}
            onChange={setGapFilter}
          />
          <div className="min-w-0 flex-1 basis-[220px] sm:max-w-[280px]">
            <Label htmlFor="welfare-search" className="text-sm text-muted-foreground">
              Search the welfare list
            </Label>
            <Input
              id="welfare-search"
              value={search}
              placeholder="Name or number"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </FilterBar>
        <Button variant="secondary" onClick={() => setBoardersOnly((on) => !on)}>
          {boardersOnly ? "Everybody" : "Boarders only"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {allRows.length} child{allRows.length === 1 ? "" : "ren"}, {missing} with something
        still to record.
      </p>

      {listQuery.isLoading ? (
        <TableRowsSkeleton
          columns={[{ avatar: true, twoLine: true }, { width: 220 }, { width: 190 }]}
        />
      ) : grouped.length === 0 ? (
        allRows.length === 0 ? (
          <NothingYet
            title="No children to check"
            body="The welfare list is drawn from the roll. Enrol a child and their health record appears here, empty and waiting."
          />
        ) : (
          <NothingMatched
            what="children"
            filters={[
              classes.find((row) => row.id === classFilter)?.name ?? "",
              gapFilter === "urgent"
                ? "Allergy, no consent"
                : gapFilter === "outstanding"
                  ? "Something still to record"
                  : gapFilter === "complete"
                    ? "Complete"
                    : "",
              search.trim(),
            ].filter(Boolean)}
            onClear={() => {
              setClassFilter("");
              setGapFilter("");
              setSearch("");
            }}
          />
        )
      ) : (
        <ul className="space-y-3">
          {grouped.map(([heading, groupRows]) => (
            <li
              key={heading}
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
            >
              <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
                <span className="font-medium text-[color:var(--text-strong)]">
                  {heading}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                  {groupRows.length}
                </span>
              </div>
              <ul className="divide-y divide-[color:var(--border-subtle)]">
                {groupRows.map((row) => (
                  <li
                    key={row.student.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <PersonAvatar
                        firstName={row.student.firstName}
                        lastName={row.student.lastName}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {row.student.lastName}, {row.student.firstName}
                        </span>
                        <span className="block truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          <span className="font-[family-name:var(--font-mono)]">
                            {row.student.studentNo}
                          </span>
                          {row.student.isBoarding ? " · boarder" : " · day"}
                          {row.record?.allergies
                            ? ` · allergic to ${row.record.allergies}`
                            : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {row.gaps.length === 0 ? (
                        <Badge tone="success">Complete</Badge>
                      ) : (
                        row.gaps.map((gap) => (
                          <Badge
                            key={gap}
                            tone={gap.includes("Allergy on file") ? "danger" : "warn"}
                          >
                            {gap}
                          </Badge>
                        ))
                      )}
                    </span>
                    <RecordActions
                      resource="schools.boarding"
                      verbs={[
                        {
                          label: row.record ? "Update" : "Record",
                          action: "edit",
                          onSelect: () => {
                            setEditing(row);
                            setDraft(draftFrom(row));
                            setActionError(null);
                          },
                        },
                        {
                          label: "Log a visit",
                          action: "create",
                          onSelect: () => {
                            setLogAnybody(false);
                            setLoggingFor(row);
                          },
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <RecordDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={
          editing
            ? `${editing.student.lastName}, ${editing.student.firstName}`
            : "Health record"
        }
        description="What the sanatorium needs to know, and what the family has agreed to."
        size="lg"
        errors={actionError ? [actionError] : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveMutation.isPending) saveMutation.mutate();
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>
              Save
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="health-allergies">Allergies</Label>
            <Textarea
              id="health-allergies"
              rows={2}
              value={draft.allergies}
              placeholder="Peanuts — carries an EpiPen in her bag"
              onChange={(event) =>
                setDraft((current) => ({ ...current, allergies: event.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Write the sentence a nurse needs, not a list of words.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-conditions">Ongoing conditions</Label>
            <Textarea
              id="health-conditions"
              rows={2}
              value={draft.chronicConditions}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  chronicConditions: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-medications">Regular medication</Label>
            <Textarea
              id="health-medications"
              rows={2}
              value={draft.medications}
              onChange={(event) =>
                setDraft((current) => ({ ...current, medications: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-diet">Dietary requirements</Label>
            <Input
              id="health-diet"
              value={draft.dietaryRequirements}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dietaryRequirements: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-doctor">Doctor</Label>
            <Input
              id="health-doctor"
              value={draft.doctorName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, doctorName: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-doctor-phone">Doctor&rsquo;s number</Label>
            <Input
              id="health-doctor-phone"
              value={draft.doctorPhone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, doctorPhone: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-consent-by">Consent given by</Label>
            <Input
              id="health-consent-by"
              value={draft.consentGivenBy}
              placeholder="R. Chirwa (mother)"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  consentGivenBy: event.target.value,
                }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Required as soon as any consent below is on. The date is stamped when
              you save.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            {(Object.keys(CONSENT_LABELS) as ConsentKey[]).map((key) => (
              <Label key={key} className="flex items-start gap-2">
                <Checkbox
                  checked={draft[key]}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, [key]: checked === true }))
                  }
                />
                <span>{CONSENT_LABELS[key]}</span>
              </Label>
            ))}
          </div>
        </div>
      </RecordDialog>

      <HealthEventDialog
        open={loggingFor !== null || logAnybody}
        row={loggingFor}
        choices={allRows}
        onClose={() => {
          setLoggingFor(null);
          setLogAnybody(false);
        }}
      />
    </div>
  );
}

/**
 * What happened, and when.
 *
 * Separate from the standing record on purpose — see the note on the list. The
 * summary is one sentence because that is what gets read back at three in the
 * morning; the treatment field is where the detail goes.
 */
function HealthEventDialog({
  open,
  row,
  choices,
  onClose,
}: {
  open: boolean;
  /** The child the verb was pressed against, or null when opened from the header. */
  row: Row | null;
  choices: Row[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState("SANATORIUM_VISIT");
  const [summary, setSummary] = useState("");
  const [treatment, setTreatment] = useState("");
  const [guardianNotified, setGuardianNotified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setStudentId(row?.student.id ?? "");
    setKind("SANATORIUM_VISIT");
    setSummary("");
    setTreatment("");
    setGuardianNotified(false);
    setError(null);
  });

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/schools/health/${studentId}`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          summary: summary.trim(),
          treatment: treatment.trim() || null,
          guardianNotified,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "health"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        row ? `${row.student.lastName}, ${row.student.firstName}` : "Log a visit"
      }
      description="A visit, a dose or an injury — what happened and what was done."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending && studentId && summary.trim()) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={!studentId || !summary.trim()}
          >
            Log it
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {row ? null : (
          <FilterSelect
            label="Child"
            allLabel="Choose a child"
            className="space-y-2 sm:col-span-2"
            value={studentId}
            options={choices.map((choice) => ({
              value: choice.student.id,
              label: `${choice.student.lastName}, ${choice.student.firstName} · ${choice.student.studentNo}`,
            }))}
            onChange={setStudentId}
          />
        )}
        <FilterSelect
          label="What it was"
          allLabel="Sanatorium visit"
          className="space-y-2"
          value={kind === "SANATORIUM_VISIT" ? "" : kind}
          options={EVENT_KINDS.filter((kind) => kind.value !== "SANATORIUM_VISIT")}
          onChange={(value) => setKind(value || "SANATORIUM_VISIT")}
        />
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="event-summary">What happened</Label>
          <Input
            id="event-summary"
            required
            value={summary}
            placeholder="Came down with a temperature after prep"
            onChange={(event) => setSummary(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Write the sentence a nurse needs, not a list of words.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="event-treatment">What was done</Label>
          <Textarea
            id="event-treatment"
            rows={2}
            value={treatment}
            onChange={(event) => setTreatment(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={guardianNotified}
              onCheckedChange={(checked) => setGuardianNotified(checked === true)}
            />
            <span>Home has been rung</span>
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
