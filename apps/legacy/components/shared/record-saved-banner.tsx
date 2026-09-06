"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatSavedRecordTimestamp } from "@/lib/saved-record";

type RecordSavedBannerProps = {
  entityLabel?: string;
};

export function RecordSavedBanner({
  entityLabel = "record",
}: RecordSavedBannerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createdId = searchParams.get("createdId");
  const createdAt = searchParams.get("createdAt");
  const source = searchParams.get("source");

  const sourceLabel = useMemo(() => {
    if (!source) return entityLabel;
    return source.replace(/[-_]/g, " ");
  }, [entityLabel, source]);
  const savedTime = formatSavedRecordTimestamp(createdAt);

  if (!createdId) return null;

  const handleDismiss = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("createdId");
    params.delete("createdAt");
    params.delete("source");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <Alert variant="success">
      <AlertTitle>Saved successfully</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          New {sourceLabel} saved. The matching row is highlighted below.
          {savedTime ? ` Saved at ${savedTime}.` : ""}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={handleDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
