"use client";

import Link from "next/link";
import { Button, EmptyState } from "@corelithzw/react";

/**
 * What a retail page shows to a role its nav item does not admit
 * (00-foundations 5.3.4). The page's own server refuses too; this keeps the
 * page from drawing a broken table and buttons the person cannot use.
 */
export function RoleRefusal({ homeHref }: { homeHref: string }) {
  return (
    <div className="px-4 py-16">
      <EmptyState
        title="This page is not part of your role"
        body="Ask the owner if you need it."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={homeHref}>Go to your start page</Link>
          </Button>
        }
      />
    </div>
  );
}
