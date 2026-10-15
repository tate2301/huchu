"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Button, Drawer, DrawerSection, Icon, Input, Segmented, Select } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ExploreScheduleInfo } from "@/lib/explore/types";
import { describeWhen, WEEKDAYS, type ScheduleFrequency } from "@/lib/reports/schedule";

type Runs = "DAILY" | `WEEKLY:${number}` | "MONTHLY:1";

const RUNS: Array<{ value: Runs; label: string }> = [
  { value: "DAILY", label: "Every day" },
  ...WEEKDAYS.map((day, index) => ({ value: `WEEKLY:${index + 1}` as Runs, label: `Every ${day}` })),
  { value: "MONTHLY:1", label: "On the 1st of each month" },
];

function readRuns(runs: Runs): { frequency: ScheduleFrequency; day: number | null } {
  if (runs === "DAILY") return { frequency: "DAILY", day: null };
  const [frequency, day] = runs.split(":") as [ScheduleFrequency, string];
  return { frequency, day: Number(day) };
}

/**
 * Schedule a saved question (the ExploreSchedule drawer): when it runs, who
 * it goes to (people whose role reads every table it reads), and as what.
 * It is kept as a report's schedule is; sending it needs Explore's own
 * login, so until that is approved the drawer says so and makes nothing.
 */
export function ScheduleDrawer({
  open,
  onOpenChange,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: { id: string; title: string };
}) {
  const { toast } = useToast();
  const info = useQuery({
    queryKey: ["explore", "schedules", question.id],
    queryFn: () => fetchJson<ExploreScheduleInfo>(`/api/explore/schedules?question=${question.id}`),
    enabled: open,
  });
  const [runs, setRuns] = React.useState<Runs>("WEEKLY:1");
  const [time, setTime] = React.useState("06:00");
  const [to, setTo] = React.useState<string[]>([]);
  const [as, setAs] = React.useState<"table" | "sheet">("table");

  const { data: session } = useSession();
  const me = session?.user?.id;
  const people = info.data?.people ?? [];
  // It goes to the person who schedules it, to start with.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current || !info.data || !me) return;
    started.current = true;
    if (info.data.people.some((person) => person.id === me)) setTo([me]);
  }, [info.data, me]);
  const chosen = people.filter((person) => to.includes(person.id));
  const others = people.filter((person) => !to.includes(person.id));
  const when = { ...readRuns(runs), time };

  const save = useMutation({
    mutationFn: () =>
      fetchJson<{ id: string }>("/api/explore/schedules", {
        method: "POST",
        body: JSON.stringify({
          question: question.id,
          schedule: { ...when, recipientIds: to, format: as === "sheet" ? "CSV" : "PDF", content: "SUMMARY", query: "" },
        }),
      }),
    onSuccess: () => {
      toast({ title: `${question.title} is scheduled`, description: `${describeWhen(when)}, to ${chosen.map((person) => person.name).join(", ")}.` });
      onOpenChange(false);
    },
    onError: (error) => toast({ title: "It was not scheduled", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const ready = Boolean(info.data?.ready);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Schedule “${question.title}”`}
      width={480}
      footer={
        <>
          <Button icon="x" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="calendar"
            shortcut="Ctrl ↵"
            busy={save.isPending}
            disabled={!ready || to.length === 0 || save.isPending}
            title={!ready ? (info.data?.waiting ?? undefined) : to.length === 0 ? "Choose who it goes to" : undefined}
            onClick={() => save.mutate()}
          >
            Schedule it
          </Button>
        </>
      }
    >
      {info.data && !ready ? (
        <div className="banner" role="status">
          <Icon name="clock" />
          <span>{info.data.waiting}</span>
        </div>
      ) : null}
      <DrawerSection title="When">
        <div className="frow">
          <span>Runs</span>
          <Select aria-label="Runs" value={runs} onChange={(event) => setRuns(event.target.value as Runs)}>
            {RUNS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="frow">
          <span>At</span>
          <Input type="time" aria-label="At" value={time} step={900} onChange={(event) => setTime(event.target.value || "06:00")} />
        </div>
      </DrawerSection>
      <DrawerSection title="To">
        {info.isPending ? <div className="skeleton" style={{ height: 40 }} /> : null}
        {chosen.map((person) => (
          <div key={person.id} className="who">
            <span className="av">
              <Icon name="person" />
            </span>
            <span>
              {person.name} <span className="muted">Email</span>
            </span>
            <Button variant="quiet" iconOnly icon="x" label={`Remove ${person.name}`} onClick={() => setTo((ids) => ids.filter((id) => id !== person.id))} />
          </div>
        ))}
        {info.data && people.length === 0 ? (
          <p className="muted">No one else’s role reads every table this question reads.</p>
        ) : (
          <MenuButton
            variant="quiet"
            icon="plus"
            label="Add someone"
            disabled={others.length === 0}
            items={others.map((person) => ({ key: person.id, label: person.name, onSelect: () => setTo((ids) => [...ids, person.id]) }))}
          >
            Add someone
          </MenuButton>
        )}
      </DrawerSection>
      <DrawerSection title="As">
        <Segmented
          label="Send as"
          value={as}
          onChange={setAs}
          items={[
            { value: "table", label: "A short table" },
            { value: "sheet", label: "A spreadsheet" },
          ]}
        />
      </DrawerSection>
    </Drawer>
  );
}
