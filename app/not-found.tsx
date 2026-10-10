"use client";

import Link from "next/link";
import { Button, EmptyState } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { useNotFoundPage, useOptionalShellNav } from "@/components/layout/shell-nav";

/**
 * A path nothing answers, old retail paths included (`/retail/catalog`,
 * `/retail/setup`). Inside the shell it names itself and lights no nav item,
 * so a path that merely starts like a real page is not mistaken for it.
 */
export default function NotFound() {
  const nav = useOptionalShellNav();
  return nav ? <InShell homeHref={nav.homeHref} /> : <NotFoundBody homeHref="/" />;
}

function InShell({ homeHref }: { homeHref: string }) {
  useNotFoundPage();
  return (
    <>
      <PageChrome title="Page not found" />
      <NotFoundBody homeHref={homeHref} />
    </>
  );
}

function NotFoundBody({ homeHref }: { homeHref: string }) {
  return (
    <div className="px-4 py-16">
      <EmptyState
        title="Page not found"
        body="The link may be old, or the page has moved."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={homeHref}>Go to your start page</Link>
          </Button>
        }
      />
    </div>
  );
}
