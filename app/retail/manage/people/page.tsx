"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Setup › Staff and PINs (80-admin 5.1, board PeopleList; W-57): drawn by
 * ListFrame from the `retail-people` source. A row opens `?sheet=person&id=`;
 * "Invite someone" opens `?sheet=person-new`; "Who can do what" opens
 * `?sheet=roles` — the sheet kinds in `lib/retail/sheet-kinds/people.ts`.
 */
export default function PeoplePage() {
  return (
    <Suspense>
      <ListFrame source="retail-people" title="Staff and PINs" />
    </Suspense>
  );
}
