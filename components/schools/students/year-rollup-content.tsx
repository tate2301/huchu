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

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { TableControls } from "@/components/schools/common/table-controls";
import { PageCaption } from "@/components/schools/records/page-caption";
import { RecordTabs } from "@/components/schools/records/record-tabs";
import {
  LoadError,
  NothingLeftToDo,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses, fetchSchoolsTerms } from "@/lib/schools/admin-v2";

type Action = "PROMOTE" | "REPEAT" | "GRADUATE" | "TRANSFER" | "WITHDRAW";

const ACTION_LABELS: Record<Action, string> = {
  PROMOTE: "Move up",
  REPEAT: "Repeat the year",
  GRADUATE: "Leaving",
  TRANSFER: "Transfer",
  WITHDRAW: "Withdraw",
};

type PlanRow = {
  studentId: string;
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  fromClass: { id: string; code: string; name: string; level: number | null } | null;
  proposed: Action;
  toClass: { id: string; code: string; name: string } | null;
  reason: string;
  termAverage: number | null;
  flagged: boolean;
  alreadyRolled: boolean;
};

type Plan = {
  fromTerm: { id: string; name: string };
  toTerm: { id: string; name: string };
  passMark: number;
  source: "enrolments" | "current-class";
  rows: PlanRow[];
  summary: Record<Action, number>;
};

/**
 * Rolling the school into the next term or year.
 *
 * Two steps on purpose. The plan is a list somebody reads — every child, what
 * would happen to them and why — and only the decisions sent back are acted on.
 * A one-click "promote everyone" would be faster and is exactly the thing that
 * should not exist: this is the only screen in the pack where a mistake touches
 * every record in the school.
 *
 * A child below the pass mark is flagged with their average rather than
 * proposed for repeating. Deciding that from a number would be the system
 * making a decision about a child quietly.
 *
 * Anyone already in the target term is shown greyed rather than hidden, so
 * running it twice reads as "already done" instead of as an empty screen.
 */
/**
 * The two cuts of the plan. "Moving up" is the work; "Leaving" is the handful
 * at the top of the ladder who have nowhere above them, and reading those two
 * lists together is how a school misses a school leaver.
 */
type RollUpTab = "moving" | "leaving";

export function YearRollUpContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<RollUpTab>("moving");
  const [fromTermId, setFromTermId] = useState("");
  const [toTermId, setToTermId] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [overrides, setOverrides] = useState<Record<string, Action>>({});
  const [result, setResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "rollup"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 50 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);

  // Default to the current term, and to the one after it in date order — the
  // roll-up a school actually runs, rather than making them pick twice.
  const resolvedFrom = fromTermId || terms.find((term) => term.isActive)?.id || "";
  const sortedTerms = useMemo(
    () => [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [terms],
  );
  const nextTerm = useMemo(() => {
    const index = sortedTerms.findIndex((term) => term.id === resolvedFrom);
    return index >= 0 ? sortedTerms[index + 1] : undefined;
  }, [sortedTerms, resolvedFrom]);
  const resolvedTo = toTermId || nextTerm?.id || "";

  const planQuery = useQuery({
    queryKey: ["schools", "year-rollup", resolvedFrom, resolvedTo, classFilter],
    queryFn: () =>
      fetchJson<Plan>(
        `/api/v2/schools/year-rollup?fromTermId=${resolvedFrom}&toTermId=${resolvedTo}${
          classFilter ? `&classId=${classFilter}` : ""
        }`,
      ),
    enabled: Boolean(resolvedFrom && resolvedTo),
  });

  const plan = planQuery.data ?? null;
  const allRows = useMemo(() => plan?.rows ?? [], [plan]);

  /**
   * The tab picks the list. A child's action is whatever the office last chose
   * for them, not the server's proposal — otherwise overriding somebody to
   * "Leaving" would make them vanish off the tab you were looking at.
   */
  const rows = useMemo(
    () =>
      allRows.filter((row) => {
        const action = overrides[row.studentId] ?? row.proposed;
        return tab === "leaving"
          ? action === "GRADUATE" || action === "WITHDRAW" || action === "TRANSFER"
          : action === "PROMOTE" || action === "REPEAT";
      }),
    [allRows, overrides, tab],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const row of rows) {
      const key = row.fromClass?.name ?? "Not in a class";
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [rows]);

  const applyMutation = useMutation({
    mutationFn: () =>
      fetchJson<{
        promoted: number;
        repeated: number;
        graduated: number;
        withdrawn: number;
        skipped: number;
        problems: string[];
      }>("/api/v2/schools/year-rollup", {
        method: "POST",
        body: JSON.stringify({
          fromTermId: resolvedFrom,
          toTermId: resolvedTo,
          // Every child in the plan, not just the tab in view: the verb says
          // "Roll 772 students up" and rolling only the half on screen would
          // be the worst kind of surprise on the one screen that touches
          // every record in the school.
          decisions: allRows
            .filter((row) => !row.alreadyRolled)
            .map((row) => {
              const action = overrides[row.studentId] ?? row.proposed;
              return {
                studentId: row.studentId,
                action,
                toClassId:
                  action === "REPEAT"
                    ? (row.fromClass?.id ?? null)
                    : action === "PROMOTE"
                      ? (row.toClass?.id ?? null)
                      : null,
              };
            }),
        }),
      }),
    onSuccess: (outcome) => {
      setActionError(null);
      setResult(
        `${outcome.promoted} moved up, ${outcome.repeated} repeating, ${outcome.graduated} leaving` +
          (outcome.skipped > 0 ? `, ${outcome.skipped} already done` : "") +
          (outcome.problems.length > 0
            ? `. ${outcome.problems.length} could not be moved.`
            : "."),
      );
      void queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const toDo = allRows.filter((row) => !row.alreadyRolled).length;
  const flagged = allRows.filter((row) => row.flagged).length;
  const movingCount = allRows.filter((row) => {
    const action = overrides[row.studentId] ?? row.proposed;
    return action === "PROMOTE" || action === "REPEAT";
  }).length;
  const leavingCount = allRows.length - movingCount;

  return (
    <div className="space-y-4">
      {/* The page is named in the app bar, and the one verb that acts on every
          record in the school goes with the name. It is disabled until there is
          a plan, because "roll 0 students up" is not an offer. */}
      <PageChrome
        title="Roll up the year"
        backHref="/schools/students"
        backLabel="All students"
      >
        <Button
          variant="primary"
          loading={applyMutation.isPending}
          disabled={applyMutation.isPending || toDo === 0}
          title={toDo === 0 ? "Nothing in this plan would move." : undefined}
          onClick={() => applyMutation.mutate()}
        >
          {applyMutation.isPending
            ? "Rolling up…"
            : `Roll ${toDo} student${toDo === 1 ? "" : "s"} up`}
        </Button>
      </PageChrome>

      {plan ? (
        <PageCaption>
          {plan.fromTerm.name} → {plan.toTerm.name}
        </PageCaption>
      ) : null}

      {/* The four numbers this screen exists to weigh, and the one verb that
          acts on them. The band carries only the numbers now; the verb moved to
          the app bar, where the canvas puts every page's primary action. */}
      <PageBand
        chips={[
          { label: "Moving up", value: plan?.summary.PROMOTE ?? "—", tone: "success" },
          { label: "Leaving", value: plan?.summary.GRADUATE ?? "—" },
          { label: "No ladder", value: plan?.summary.REPEAT ?? "—", tone: "warn" },
          {
            label: `Below ${plan?.passMark ?? 50}%`,
            value: flagged,
            tone: flagged > 0 ? "danger" : "neutral",
          },
        ]}
      />

      {planQuery.error ? (
        <LoadError
          what="the roll-up"
          error={planQuery.error}
          onRetry={() => void planQuery.refetch()}
        />
      ) : null}
      {actionError ? <SaveError what="The roll-up" error={actionError} /> : null}
      {result ? (
        <Alert tone="success" title="Done">
          {result}
        </Alert>
      ) : null}

      {/* The tabs and the three narrowings in one row, because all four change
          the list beneath them and nothing else on the page. */}
      <TableControls
        tabs={
          <RecordTabs<RollUpTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "moving", label: "Moving up", count: plan ? movingCount : undefined },
              { id: "leaving", label: "Leaving", count: plan ? leavingCount : undefined },
            ]}
          />
        }
        filters={
          <>
            <FilterSelect
              label="From term"
              allLabel="Current term"
              value={fromTermId}
              options={sortedTerms.map((term) => ({ value: term.id, label: term.name }))}
              onChange={setFromTermId}
            />
            <FilterSelect
              label="Into term"
              allLabel="The next one"
              value={toTermId}
              options={sortedTerms.map((term) => ({ value: term.id, label: term.name }))}
              onChange={setToTermId}
            />
            <FilterSelect
              label="Year group"
              allLabel="The whole school"
              value={classFilter}
              options={classes.map((row) => ({ value: row.id, label: row.name }))}
              onChange={setClassFilter}
            />
          </>
        }
      />

      {plan && plan.source === "current-class" ? (
        <Alert tone="warn" title="Built from where each child sits now">
          {plan.fromTerm.name} has no enrolment records, so this list came from each
          student&rsquo;s current year group instead. That is a weaker fact than an
          enrolment — worth a look before rolling {rows.length} records over.
        </Alert>
      ) : null}

      {plan ? (
        <p className="text-sm text-muted-foreground">
          {plan.fromTerm.name} → {plan.toTerm.name} · {plan.summary.PROMOTE} moving up,{" "}
          {plan.summary.GRADUATE} leaving, {plan.summary.REPEAT} with no ladder
          {flagged > 0 ? ` · ${flagged} below ${plan.passMark}%` : ""}
        </p>
      ) : null}

      {grouped.length === 0 && planQuery.isLoading ? (
        <TableRowsSkeleton rows={6} columns={[{ twoLine: true }, { width: 170 }]} />
      ) : null}
      {grouped.length === 0 && !planQuery.isLoading ? (
        resolvedFrom && resolvedTo ? (
          <NothingLeftToDo
            title="Nobody to roll up"
            body="There are no active enrolments in that term, so nothing would move."
          />
        ) : (
          <NothingYet
            title="Choose the two terms"
            body="Pick the term to roll up from and the one to roll into, and this becomes a list of every child and what would happen to them."
          />
        )
      ) : null}

      <MobileList>
        {grouped.length === 0 ? null : (
          grouped.map(([heading, groupRows]) => (
            <div key={heading}>
              <MobileListSectionHeader>
                {heading} · {groupRows.length}
              </MobileListSectionHeader>
              {groupRows.map((row) => {
                const action = overrides[row.studentId] ?? row.proposed;
                return (
                  <MobileList.Row
                    key={row.studentId}
                    static
                    title={`${row.student.lastName}, ${row.student.firstName}`}
                    subtitle={
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span>
                          {/* Number, then the move, then the average. The
                              ladder is the fact the office is checking — "Form
                              2 → Form 3", or that there is nothing above. */}
                          {row.student.studentNo} ·{" "}
                          {row.fromClass?.name ?? "No year group"} →{" "}
                          {row.toClass?.name ?? "no year group above"}
                          {row.termAverage !== null
                            ? ` · average ${row.termAverage}%`
                            : ""}
                        </span>
                        {row.flagged ? (
                          <Badge tone="danger">Below {plan?.passMark ?? 50}%</Badge>
                        ) : null}
                        {/* Nothing above this year group, so "move up" has
                            nowhere to move to. Said once, as a chip, rather
                            than buried in the reason line. */}
                        {!row.toClass && row.proposed === "GRADUATE" ? (
                          <Badge tone="warn">No ladder</Badge>
                        ) : null}
                        {row.alreadyRolled ? (
                          <Badge tone="neutral">Already done</Badge>
                        ) : (
                          <Select
                            value={action}
                            onValueChange={(value) =>
                              setOverrides((current) => ({
                                ...current,
                                [row.studentId]: value as Action,
                              }))
                            }
                          >
                            <SelectTrigger
                              aria-label={`What happens to ${row.student.lastName}`}
                              className="w-[170px]"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ACTION_LABELS) as Action[]).map((option) => (
                                <SelectItem key={option} value={option}>
                                  {ACTION_LABELS[option]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </span>
                    }
                  />
                );
              })}
            </div>
          ))
        )}
      </MobileList>
    </div>
  );
}
