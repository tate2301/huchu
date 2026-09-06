"use client";

import { useQuery } from "@tanstack/react-query";

import { ClientDate } from "@/components/ui/client-date";
import { fetchJson } from "@/lib/api-client";
import { Calendar, Checklist, MapPin, UserRound } from "@/lib/icons";

type Brief = {
  reference: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  where: string | null;
  mapUrl: string | null;
  attendingName: string | null;
  customerName: string | null;
  checklist: string[];
  status: string;
};

/**
 * The visit, for whoever was sent the link.
 *
 * Read on a phone, probably outdoors, probably by somebody deciding whether
 * to leave the house yet. So: when, where, who — in that order, large, with
 * the address tappable into a maps app rather than something to squint at
 * and retype.
 */
export function VisitBriefContent({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["public-visit", token],
    queryFn: () => fetchJson<{ data: Brief }>(`/api/public/crm/visits/${token}`),
    retry: false,
  });

  if (query.isLoading) {
    return <p className="p-6 text-sm text-neutral-500">Loading the visit…</p>;
  }

  if (query.error || !query.data?.data) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">This link isn&apos;t live</h1>
        <p className="mt-1 text-sm text-neutral-600">
          It may have been withdrawn or replaced. Ask whoever sent it for a new one.
        </p>
      </div>
    );
  }

  const brief = query.data.data;
  const cancelled = brief.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-md space-y-5 p-6">
      <header className="space-y-1">
        <p className="font-mono text-sm text-neutral-500">{brief.reference}</p>
        <h1 className="text-xl font-semibold">{brief.title}</h1>
        {brief.customerName ? (
          <p className="text-sm text-neutral-600">for {brief.customerName}</p>
        ) : null}
      </header>

      {cancelled ? (
        <p className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
          This visit has been cancelled. Nobody is coming — please check with whoever
          arranged it.
        </p>
      ) : null}

      <dl className="space-y-4">
        <div className="flex gap-3">
          <Calendar className="mt-0.5 size-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <div>
            <dt className="text-sm text-neutral-500">When</dt>
            <dd className="text-base font-medium">
              <ClientDate value={brief.scheduledStart} mode="datetime" />
              {brief.scheduledEnd ? (
                <>
                  {" – "}
                  <ClientDate value={brief.scheduledEnd} mode="datetime" />
                </>
              ) : null}
            </dd>
          </div>
        </div>

        {brief.where ? (
          <div className="flex gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-neutral-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-sm text-neutral-500">Where</dt>
              <dd className="text-base font-medium">{brief.where}</dd>
              {brief.mapUrl ? (
                <a
                  href={brief.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-blue-700 underline"
                >
                  Open in maps
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {brief.attendingName ? (
          <div className="flex gap-3">
            <UserRound className="mt-0.5 size-5 shrink-0 text-neutral-400" aria-hidden="true" />
            <div>
              <dt className="text-sm text-neutral-500">Who is coming</dt>
              <dd className="text-base font-medium">{brief.attendingName}</dd>
            </div>
          </div>
        ) : null}

        {brief.checklist.length > 0 ? (
          <div className="flex gap-3">
            <Checklist className="mt-0.5 size-5 shrink-0 text-neutral-400" aria-hidden="true" />
            <div>
              <dt className="text-sm text-neutral-500">What the visit covers</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {brief.checklist.map((label) => (
                    <li key={label} className="text-base">
                      {label}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
