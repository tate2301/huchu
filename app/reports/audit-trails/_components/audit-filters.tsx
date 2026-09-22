"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, X } from "@/lib/icons";
import type { Site } from "@/lib/api";

import { MODULE_LABELS, type AuditModule } from "./audit-events";

/** The board's four windows into the log. */
export const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "Everything" },
] as const;

export type AuditRange = (typeof RANGES)[number]["value"];

/** The token Radix needs for "no value chosen"; `""` reads as unanswered. */
export const ANY = "all";

export type AuditFiltersProps = {
  sites: Site[] | undefined;
  sitesLoading: boolean;
  siteId: string;
  onSiteChange: (value: string) => void;

  actor: string;
  actorOptions: string[];
  onActorChange: (value: string) => void;

  /** Either a module (`GOLD`) or a whole event type (`GOLD.POUR_CORRECTED`). */
  event: string;
  moduleOptions: AuditModule[];
  eventTypeOptions: string[];
  onEventChange: (value: string) => void;

  range: AuditRange;
  onRangeChange: (value: AuditRange) => void;
};

/**
 * The filter row — the subject chip, then three design-system selects.
 *
 * The board pins a subject and filters after it, and the site is this page's
 * subject: it is the only filter that reaches the server, since all three
 * query keys carry it. So the site control has two states rather than two
 * controls — a `Select` while the log is company-wide, and the subject chip
 * once it is scoped to one site, with an × to widen it again. A select and a
 * chip both showing the same site would be one fact drawn twice.
 *
 * "Any event" carries the module filter this page has always had *and* the
 * finer event types, in two labelled groups: the composed `eventType` is
 * prefixed with its module, so one control answers both questions and the
 * filter row stays at the board's four slots.
 */
export function AuditFilters({
  sites,
  sitesLoading,
  siteId,
  onSiteChange,
  actor,
  actorOptions,
  onActorChange,
  event,
  moduleOptions,
  eventTypeOptions,
  onEventChange,
  range,
  onRangeChange,
}: AuditFiltersProps) {
  const subject = siteId === ANY ? null : sites?.find((site) => site.id === siteId);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {siteId !== ANY ? (
        <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-[#E8EFFE] pr-1.5 pl-[9px] text-[12px] leading-none font-medium text-[#0944C2]">
          <MapPin className="size-3 shrink-0 text-[#0B5DF0]" aria-hidden="true" />
          {subject?.name ?? "This site"}
          <button
            type="button"
            aria-label="Show every site"
            onClick={() => onSiteChange(ANY)}
            className="grid size-4 shrink-0 place-items-center rounded-full text-[#0944C2] hover:bg-[#D4E2FD] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B5DF0]"
          >
            <X className="size-2.5" aria-hidden="true" />
          </button>
        </span>
      ) : sitesLoading ? (
        <Skeleton className="h-9" style={{ flex: "0 1 200px" }} />
      ) : (
        <span style={{ flex: "0 1 200px" }}>
          <Select value={siteId} onValueChange={onSiteChange}>
            <SelectTrigger className="h-9" aria-label="Site">
              <SelectValue placeholder="Any site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any site</SelectItem>
              {sites?.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      )}

      <span style={{ flex: "0 1 200px" }}>
        <Select value={actor} onValueChange={onActorChange}>
          <SelectTrigger className="h-9" aria-label="Actor">
            <SelectValue placeholder="Any actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any actor</SelectItem>
            {actorOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <span style={{ flex: "0 1 190px" }}>
        <Select value={event} onValueChange={onEventChange}>
          <SelectTrigger className="h-9" aria-label="Event">
            <SelectValue placeholder="Any event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any event</SelectItem>
            {moduleOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Module</SelectLabel>
                {moduleOptions.map((module) => (
                  <SelectItem key={module} value={module}>
                    {MODULE_LABELS[module]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {eventTypeOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Event type</SelectLabel>
                {eventTypeOptions.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>
                    {eventType}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </span>

      <span style={{ flex: "0 1 170px" }}>
        <Select value={range} onValueChange={(value) => onRangeChange(value as AuditRange)}>
          <SelectTrigger className="h-9" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>
    </div>
  );
}
