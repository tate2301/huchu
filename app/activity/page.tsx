"use client";

import * as React from "react";

import { Kit } from "@/components/core";
import { ActivityInbox } from "@/components/notifications/activity-inbox";
import { InboxSkeleton } from "@/components/notifications/inbox-row";

/**
 * /activity: every notification of the reader's, and for managers the
 * workspace's audit trail (it was Settings → Activity, which forwards here).
 */
export default function ActivityPage() {
  // The view, the filters and the open row are read from the address, which is only known in the browser.
  return (
    <React.Suspense
      fallback={
        <Kit className="kit-main">
          <div className="mn" style={{ padding: "56px 24px" }}>
            <InboxSkeleton rows={8} />
          </div>
        </Kit>
      }
    >
      <ActivityInbox />
    </React.Suspense>
  );
}
