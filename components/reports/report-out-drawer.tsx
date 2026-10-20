"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Check, Drawer, Field, Kit, Segmented, Tabs, Avatars, Person } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { EXPORT_TEMPLATE_LABELS, EXPORT_TEMPLATES, type ExportTemplateId } from "@/lib/reports/export-layouts";
import {
  FORMAT_LABEL,
  nextRunAt,
  WEEKDAYS,
  type ScheduleContent,
  type ScheduleFormat,
  type ScheduleFrequency,
} from "@/lib/reports/schedule";
import type { SchedulePerson, ScheduleView } from "@/lib/reports/schedules";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

import { RadioOptions } from "./radio-options";

/**
 * Export (PageReportExport) and Send it (PageReportSend): one drawer with two
 * tabs, because both turn the report on screen into a file. Download writes
 * it now; Send it emails it every day, week or month to people in the
 * workspace who can open the report. Only a person presses Start sending, and
 * the report's schedules are listed here with Stop sending.
 */

export type OutTab = "download" | "send";
export type DownloadFormat = "pdf" | "xlsx" | "csv";

const LAYOUT_NOTES: Record<ExportTemplateId, (group: string | null) => string> = {
  layout: () => "The page as you see it: figures, charts, then the table.",
  register: () => "What it is narrowed by, then every row. Landscape.",
  summary: (group) => `Key figures and a breakdown${group ? ` by ${group}` : ""}. One page.`,
  pack: () => "Figures, breakdown, the 10 largest, then every row.",
  sheets: () => "One block per row, every field. Up to 300.",
};

const FREQUENCY_LABEL: Record<ScheduleFrequency, string> = { DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month" };

/** Every half hour of the day, as the At list offers them. */
const TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

const AS_OPTIONS: Array<{ value: `${ScheduleFormat}:${ScheduleContent}`; label: string }> = [
  { value: "PDF:SUMMARY", label: FORMAT_LABEL["PDF:SUMMARY"] },
  { value: "PDF:FULL", label: FORMAT_LABEL["PDF:FULL"] },
  { value: "CSV:FULL", label: FORMAT_LABEL["CSV:FULL"] },
];

/** "Monday 19 October at 07:00", on the workspace's clock. */
function whenWords(at: Date): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return `${day.replace(",", "")} at ${time}`;
}

function names(people: SchedulePerson[]): string {
  if (people.length === 0) return "Nobody yet";
  if (people.length <= 3) return people.map((person) => person.name).join(", ");
  return `${people.slice(0, 2).map((person) => person.name).join(", ")} and ${people.length - 2} more`;
}

function ordinal(day: number): string {
  return `${day}${day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th"}`;
}

/** A labelled choice from a menu, the value shown in its box (the board's \`.selbox\`). */
function Choice<V extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  options: Array<{ value: V; label: string }>;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <label className="field rp-choice">
      <span className="rp-label">{label}</span>
      <MenuButton
        className="rp-selbox"
        label={label}
        items={options.map((option) => ({
          key: String(option.value),
          label: option.label,
          checked: option.value === value,
          onSelect: () => onChange(option.value),
        }))}
      >
        <span className="truncate">{current?.label ?? ""}</span>
      </MenuButton>
    </label>
  );
}

/** To: the people it goes to, from those who can open the report. Nobody outside the workspace. */
function Recipients({
  people,
  chosen,
  onChange,
  reportTitle,
}: {
  people: SchedulePerson[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  reportTitle: string;
}) {
  const picked = people.filter((person) => chosen.includes(person.id));
  return (
    <Field label="To" htmlFor="send-to" help={`People in this workspace who can open ${reportTitle}. Nobody outside it.`}>
      <Popover>
        <PopoverTrigger asChild>
          <button id="send-to" type="button" className="select rp-pick">
            {picked.length ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Avatars people={picked} />
                <span className="truncate">{names(picked)}</span>
              </span>
            ) : (
              <span className="truncate">{names(picked)}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Kit>
            <div className="rp-people" role="group" aria-label="Who it goes to">
              {people.map((person) => (
                <Check
                  key={person.id}
                  checked={chosen.includes(person.id)}
                  onCheckedChange={(on) => onChange(on ? [...chosen, person.id] : chosen.filter((id) => id !== person.id))}
                  label={<Person name={person.name} src={person.image} />}
                />
              ))}
              {people.length === 0 ? <p className="muted">Nobody else here can open {reportTitle}.</p> : null}
            </div>
          </Kit>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function Schedules({ schedules, onActive, busy }: { schedules: ScheduleView[]; onActive: (id: string, active: boolean) => void; busy: string | null }) {
  if (schedules.length === 0) return null;
  return (
    <div className="rp-kept">
      <span className="sec-title">Already sending</span>
      <div className="list rp-sched">
        {schedules.map((schedule) => (
          <div className="row" key={schedule.id}>
            <span className="rp-sched-t">
              <b>{schedule.when}</b>
              <span className="muted">
                {FORMAT_LABEL[`${schedule.format}:${schedule.content}`]}, to <Avatars people={schedule.recipients} /> {names(schedule.recipients)}.{" "}
                {schedule.active ? (schedule.nextRunAt ? `Next ${whenWords(new Date(schedule.nextRunAt))}.` : "") : "Stopped."} Set by{" "}
                {schedule.madeBy}.
              </span>
            </span>
            {schedule.canChange ? (
              <Button variant="quiet" busy={busy === schedule.id} onClick={() => onActive(schedule.id, !schedule.active)}>
                {schedule.active ? "Stop sending" : "Start again"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportOutDrawer({
  open,
  onOpenChange,
  tab,
  onTab,
  reportKey,
  reportTitle,
  exportSub,
  sendSub,
  groupLabel,
  selected,
  total,
  periodWords,
  query,
  exporting,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: OutTab;
  onTab: (tab: OutTab) => void;
  reportKey: string;
  reportTitle: string;
  /** "Closing 1 Jan to 31 Dec 2026, grouped by stage." */
  exportSub: string;
  /** "Grouped by stage, every owner." */
  sendSub: string;
  /** What the summary breaks down by, in lower case. */
  groupLabel: string | null;
  /** The rows selected on screen, to download only them. */
  selected: { count: number; words: string } | null;
  total: number;
  /** What each send reads: "the year so far". */
  periodWords: string | null;
  /** The report on screen as a schedule keeps it: its choices and its view. */
  query: string;
  exporting: boolean;
  onDownload: (format: DownloadFormat, layout: ExportTemplateId, onlySelected: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const me = (session?.user as { id?: string } | undefined)?.id ?? null;

  // Download
  const [format, setFormat] = React.useState<DownloadFormat>("pdf");
  const [layout, setLayout] = React.useState<ExportTemplateId>("layout");
  const [rows, setRows] = React.useState<"selected" | "all">(selected ? "selected" : "all");
  React.useEffect(() => {
    if (open) setRows(selected ? "selected" : "all");
  }, [open, selected]);

  // Send it
  const [frequency, setFrequency] = React.useState<ScheduleFrequency>("WEEKLY");
  const [weekday, setWeekday] = React.useState(1);
  const [monthDay, setMonthDay] = React.useState(1);
  const [time, setTime] = React.useState("07:00");
  const [as, setAs] = React.useState<`${ScheduleFormat}:${ScheduleContent}`>("PDF:SUMMARY");
  const [recipients, setRecipients] = React.useState<string[] | null>(null);

  const schedulesKey = ["reports", reportKey, "schedules"];
  const schedules = useQuery({
    queryKey: schedulesKey,
    queryFn: () => fetchJson<{ schedules: ScheduleView[]; people: SchedulePerson[] }>(`/api/v2/reports/${encodeURIComponent(reportKey)}/schedules`),
    enabled: open,
  });
  const people = React.useMemo(() => schedules.data?.people ?? [], [schedules.data]);
  // Until somebody chooses, it goes to the person setting it up.
  const chosen = recipients ?? (me && people.some((person) => person.id === me) ? [me] : []);

  const day = frequency === "DAILY" ? null : frequency === "WEEKLY" ? weekday : monthDay;
  const first = React.useMemo(() => nextRunAt({ frequency, day, time }, new Date()), [frequency, day, time]);

  const start = useMutation({
    mutationFn: () => {
      const [fileFormat, content] = as.split(":") as [ScheduleFormat, ScheduleContent];
      return fetchJson(`/api/v2/reports/${encodeURIComponent(reportKey)}/schedules`, {
        method: "POST",
        body: JSON.stringify({ frequency, day, time, recipientIds: chosen, format: fileFormat, content, query }),
      });
    },
    onSuccess: async () => {
      toast({ title: `${reportTitle} goes out ${whenWords(first)}`, variant: "success" });
      await queryClient.invalidateQueries({ queryKey: schedulesKey });
      onOpenChange(false);
    },
    onError: (error) => toast({ title: "Not started", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      fetchJson(`/api/v2/reports/schedules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    onSuccess: async (_, { active }) => {
      toast({ title: active ? "Sending again" : "Stopped sending" });
      await queryClient.invalidateQueries({ queryKey: schedulesKey });
    },
    onError: (error) => toast({ title: "Not changed", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const footer =
    tab === "download" ? (
      <>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          variant="primary"
          shortcut="Ctrl ↵"
          busy={exporting}
          disabled={exporting}
          onClick={() => onDownload(format, layout, rows === "selected" && Boolean(selected))}
        >
          Download
        </Button>
      </>
    ) : (
      <>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          variant="primary"
          shortcut="Ctrl ↵"
          busy={start.isPending}
          disabled={start.isPending || chosen.length === 0 || !schedules.data}
          onClick={() => start.mutate()}
        >
          Start sending
        </Button>
      </>
    );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={tab === "download" ? `Export ${reportTitle}` : `Send ${reportTitle}`}
      sub={tab === "download" ? exportSub : sendSub}
      width={440}
      footer={footer}
    >
      <div className="rp-drawer">
        <div className="rp-tabs">
          <Tabs
            label="Export or send"
            value={tab}
            onChange={onTab}
            items={[
              { value: "download", label: "Download" },
              { value: "send", label: "Send it" },
            ]}
          />
        </div>

        {tab === "download" ? (
          <>
            <div className="rp-field">
              <span className="rp-label">As</span>
              <Segmented
                label="As"
                value={format}
                onChange={setFormat}
                items={[
                  { value: "pdf", label: "PDF" },
                  { value: "xlsx", label: "Excel workbook" },
                  { value: "csv", label: "CSV" },
                ]}
              />
            </div>
            {format === "pdf" ? (
              <RadioOptions
                label="Layout"
                name="export-layout"
                value={layout}
                onChange={setLayout}
                options={EXPORT_TEMPLATES.map((value) => ({ value, label: EXPORT_TEMPLATE_LABELS[value], note: LAYOUT_NOTES[value](groupLabel) }))}
              />
            ) : null}
            {selected ? (
              <RadioOptions
                label="Rows"
                name="export-rows"
                value={rows}
                onChange={setRows}
                options={[
                  { value: "selected", label: `The ${selected.count.toLocaleString("en-US")} selected`, note: selected.words },
                  {
                    value: "all",
                    label: `All ${total.toLocaleString("en-US")} rows`,
                    note: groupLabel ? `Grouped by ${groupLabel}, as on screen` : "As on screen",
                  },
                ]}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="rp-field">
              <span className="rp-label">How often</span>
              <Segmented
                label="How often"
                value={frequency}
                onChange={setFrequency}
                items={(Object.keys(FREQUENCY_LABEL) as ScheduleFrequency[]).map((value) => ({ value, label: FREQUENCY_LABEL[value] }))}
              />
            </div>
            <div className="rp-pair">
              {frequency === "DAILY" ? null : frequency === "WEEKLY" ? (
                <Choice
                  label="On"
                  value={weekday}
                  onChange={setWeekday}
                  options={WEEKDAYS.map((name, index) => ({ value: index + 1, label: name }))}
                />
              ) : (
                <Choice
                  label="On"
                  value={monthDay}
                  onChange={setMonthDay}
                  options={Array.from({ length: 31 }, (_, index) => ({
                    value: index + 1,
                    label: index + 1 > 28 ? `The ${ordinal(index + 1)}, or the last day` : `The ${ordinal(index + 1)}`,
                  }))}
                />
              )}
              <Choice label="At" value={time} onChange={setTime} options={TIMES.map((value) => ({ value, label: value }))} />
            </div>
            {schedules.data ? (
              <Recipients people={people} chosen={chosen} onChange={setRecipients} reportTitle={reportTitle} />
            ) : schedules.isError ? (
              <p className="muted" role="alert">
                {getApiErrorMessage(schedules.error, "Who it can go to did not load.")}{" "}
                <Button variant="quiet" onClick={() => void schedules.refetch()}>
                  Try again
                </Button>
              </p>
            ) : (
              <div className="skeleton" style={{ height: 58 }} aria-busy="true" />
            )}
            <Choice label="As" value={as} onChange={setAs} options={AS_OPTIONS} />
            <div className="rp-note">
              The first goes on {whenWords(first)}.{" "}
              {periodWords ? `Dates move with it: each one reads ${periodWords}.` : "Each one reads the report as it is then."}
            </div>
            <Schedules
              schedules={schedules.data?.schedules ?? []}
              busy={toggle.isPending ? (toggle.variables?.id ?? null) : null}
              onActive={(id, active) => toggle.mutate({ id, active })}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}
