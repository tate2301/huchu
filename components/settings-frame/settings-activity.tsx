"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/workspace/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { X } from "@/lib/icons";
import type { ActivityPage } from "@/lib/retail/record-activity";
import { formatCount, formatWhen } from "@/lib/workspace/format";

const SIZE = 10;

/**
 * The header's "Activity" on a settings page: a side sheet with the page's
 * saves and the events of what it changes, newest first, ten at a time
 * (`GET /api/v2/retail/settings/<page>/activity`). Each line says what
 * changed, who did it and when.
 */
export function SettingsActivity({
  page,
  title,
  open,
  onOpenChange,
}: {
  page: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [at, setAt] = React.useState(1);
  const query = useQuery({
    queryKey: ["retail-settings-activity", page, at],
    queryFn: () =>
      fetchJson<ActivityPage>(`/api/v2/retail/settings/${encodeURIComponent(page)}/activity?page=${at}&size=${SIZE}`),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const first = (at - 1) * SIZE + 1;
  const last = data ? first + data.rows.length - 1 : 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setAt(1);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="cx-scrim sf-scrim" />
        <Dialog.Content className="cx-sheet sf-sheet" aria-describedby={undefined}>
          <header className="cx-sheet__head">
            <div className="sf-head__text">
              <Dialog.Title className="cx-sheet__title sf-ellipsis">Activity</Dialog.Title>
              <span className="cx-sheet__sub sf-ellipsis">{title}: every change, with who made it</span>
            </div>
            <Dialog.Close className="sf-close" aria-label="Close">
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="cx-sheet__body">
            {query.isPending ? (
              <p className="cx-sf-state">Loading…</p>
            ) : query.isError || !data ? (
              <p role="alert" className="cx-sf-state cx-sf-state--bad">
                {getApiErrorMessage(query.error)}
              </p>
            ) : data.total === 0 ? (
              <p className="cx-sf-state">Nobody has changed {title.toLowerCase()} yet.</p>
            ) : (
              <>
                <ul className="cx-sf-activity" aria-label="Activity">
                  {data.rows.map((row) => (
                    <li key={row.id}>
                      <span className={`cx-sf-activity__dot cx-sf-activity__dot--${row.tone}`} aria-hidden="true" />
                      <span className="cx-sf-activity__text">
                        <span className="cx-sf-activity__what">{row.what}</span>
                        <span className="cx-sf-activity__meta">
                          {row.actor.name} · <span className="mono">{formatWhen(row.at)}</span>
                          {row.reason ? ` · ${row.reason}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="cx-sf-pager">
                  <span>
                    <b>
                      {formatCount(first)}–{formatCount(last)}
                    </b>{" "}
                    of <b>{formatCount(data.total)}</b>
                  </span>
                  <Button disabled={at <= 1} onClick={() => setAt((current) => current - 1)}>
                    Newer
                  </Button>
                  <Button disabled={last >= data.total} onClick={() => setAt((current) => current + 1)}>
                    Older
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
