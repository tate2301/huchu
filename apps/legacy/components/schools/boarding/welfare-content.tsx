"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, StatCard } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PageBand } from "@/components/schools/common/page-band";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { FilterSelect } from "@/components/schools/common/filter-select";
import {
  ClassFilter,
  ALL_CLASSES,
  type ClassFilterValue,
} from "@/components/schools/common/class-filter";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  CONSENT_LABELS,
  URGENT_GAP,
  type ConsentKey,
} from "@/lib/schools/health-consents";

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
 * What the "On file" filter offers, in the order somebody works down it.
 *
 * The first three are the sentences `healthGaps` writes onto a row, matched
 * exactly — an office scanning the badges for "No doctor recorded" wants to
 * narrow to them, and before this the only cuts available were "something" and
 * "nothing", which is the difference between a list you can work and a list you
 * have to read.
 *
 * The urgent one leads because it is the one to ring home about, and the two
 * breadth cuts sit at the bottom because they are what you fall back to once
 * the specific gaps are cleared.
 */
const GAP_FILTERS = [
  { value: "urgent", label: URGENT_GAP, gap: URGENT_GAP },
  { value: "no-consent", label: "No consent recorded", gap: "No consent recorded" },
  { value: "no-doctor", label: "No doctor recorded", gap: "No doctor recorded" },
  {
    value: "nothing",
    label: "Nothing recorded at all",
    gap: "Nothing recorded at all",
  },
  { value: "outstanding", label: "Something still to record", gap: null },
  { value: "complete", label: "Complete", gap: null },
] as const;

const gapFilterLabel = (value: string) =>
  GAP_FILTERS.find((row) => row.value === value)?.label ?? "";

/**
 * The welfare list.
 *
 * Built from the children outward, not from the health records, so a child with
 * nothing on file is a row saying so rather than an absence. That is the whole
 * job of this screen: an allergy nobody has recorded looks exactly like a child
 * with no allergies, and only a list of the gaps tells them apart.
 *
 * The gaps lead each row, in the words somebody has to act on: "Allergy on
 * file, no consent to treat" against a child allergic to peanuts is the
 * sentence a boarding school needs in front of it, and burying it inside a
 * detail page means nobody reads it until the night it matters. It is also the
 * page's alert, because a gap that is only visible once you have scrolled to
 * the right row is a gap nobody has seen.
 *
 * Two verbs, and they are different acts. Recording the standing record is what
 * the family agreed to once; logging a visit is what happened at half past two
 * this morning. Putting the second on the same form as the first would mean a
 * nurse editing consents to write down a nosebleed.
 *
 * The whole school is the default view and the year group narrows it, rather
 * than a picker that makes "show me every child with something outstanding" an
 * unreachable question. That is the one an office opens this page for.
 */
export function WelfareContent() {
  const queryClient = useQueryClient();
  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [boardersOnly, setBoardersOnly] = useState(false);
  const [gapFilter, setGapFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(null));
  const [actionError, setActionError] = useState<string | null>(null);
  const [loggingFor, setLoggingFor] = useState<Row | null>(null);
  const [logAnybody, setLogAnybody] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["schools", "health", classValue.classId, boardersOnly],
    queryFn: () =>
      fetchJson<{ rows: Row[] }>(
        `/api/v2/schools/health?${new URLSearchParams({
          ...(classValue.classId ? { classId: classValue.classId } : {}),
          ...(boardersOnly ? { boardingOnly: "true" } : {}),
        }).toString()}`,
      ),
  });

  const allRows = useMemo(() => listQuery.data?.rows ?? [], [listQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const chosen = GAP_FILTERS.find((row) => row.value === gapFilter) ?? null;
    return allRows.filter((row) => {
      if (gapFilter === "outstanding" && row.gaps.length === 0) return false;
      if (gapFilter === "complete" && row.gaps.length > 0) return false;
      // A named gap matches the sentence `healthGaps` wrote onto the row, so
      // the filter and the badge can never drift apart.
      if (chosen?.gap && !row.gaps.includes(chosen.gap)) return false;
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

  /**
   * Clearing a record, as distinct from correcting one.
   *
   * For a record entered against the wrong child — the case where leaving it is
   * worse than losing it, because an allergy filed under the wrong name is a
   * sentence a nurse will act on. The server refuses once there are visits
   * logged, and says so.
   */
  const clearMutation = useMutation({
    mutationFn: (row: Row) =>
      fetchJson(`/api/v2/schools/health/${row.student.id}`, { method: "DELETE" }),
    onSettled: () => setClearingId(null),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "health"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const missing = allRows.filter((row) => row.gaps.length > 0).length;
  const complete = allRows.length - missing;
  const urgent = allRows.filter((row) => row.gaps.includes(URGENT_GAP)).length;

  return (
    <div className="space-y-4">
      <PageChrome title="Health and welfare">
        <CreateButton
          resource="schools.boarding"
          label="Log a visit"
          onSelect={() => {
            setLoggingFor(null);
            setLogAnybody(true);
          }}
        />
      </PageChrome>

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
      {/* The dialog shows its own errors; a refusal to clear happens with no
          dialog open, so it needs somewhere on the page to land. */}
      {clearMutation.error ? (
        <SaveError what="That health record" error={clearMutation.error} />
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

      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            label="Search the welfare list"
            placeholder="Name or number"
          />
        }
        filters={
          <>
            <ClassFilter
              label="Year group"
              allLabel="The whole school"
              value={classValue}
              onChange={setClassValue}
            />
            <FilterSelect
              label="On file"
              allLabel="Everything on file"
              value={gapFilter}
              options={GAP_FILTERS.map((row) => ({
                value: row.value,
                label: row.label,
              }))}
              onChange={setGapFilter}
            />
          </>
        }
        actions={
          // A toggle rather than a third dropdown: it has two states, one of
          // them is the whole school, and the button says which one you get by
          // pressing it.
          <Button variant="secondary" onClick={() => setBoardersOnly((on) => !on)}>
            {boardersOnly ? "Everybody" : "Boarders only"}
          </Button>
        }
      />

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
              gapFilterLabel(gapFilter),
              boardersOnly ? "Boarders only" : "",
              search.trim(),
            ].filter(Boolean)}
            onClear={() => {
              setClassValue(ALL_CLASSES);
              setGapFilter("");
              setBoardersOnly(false);
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
                            tone={gap === URGENT_GAP ? "danger" : "warn"}
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
                        {
                          label: "Clear",
                          action: "archive",
                          tone: "danger",
                          loading: clearingId === row.student.id,
                          unavailable: row.record
                            ? undefined
                            : "There is nothing recorded to clear.",
                          confirm: {
                            title: `Clear ${row.student.lastName}, ${row.student.firstName}`,
                            description:
                              "Every allergy, condition and consent on this child goes for good, and the row goes back to saying nothing is recorded. Use it for a record entered against the wrong child — a record that is merely out of date is corrected, not cleared.",
                            confirmLabel: "Clear it",
                          },
                          onSelect: () => {
                            setActionError(null);
                            setClearingId(row.student.id);
                            clearMutation.mutate(row);
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
