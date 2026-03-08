"use client";

import { useEffect, useState } from "react";
import { fetchManifest } from "@/components/admin-portal/api";
import type { OperationManifest } from "@/components/admin-portal/types";
import { PLATFORM_ADMIN_MANIFEST } from "@/lib/admin-portal/manifest";
import { OperationsTable } from "./operations-table";

export function OperationsPage({
  title,
  actorEmail,
  companyId,
  modules,
}: {
  title: string;
  actorEmail: string;
  companyId?: string;
  modules?: string[];
}) {
  const [manifest, setManifest] = useState<OperationManifest>(PLATFORM_ADMIN_MANIFEST as unknown as OperationManifest);

  useEffect(() => {
    void fetchManifest().then(setManifest).catch(() => {
      setManifest(PLATFORM_ADMIN_MANIFEST as unknown as OperationManifest);
    });
  }, []);

  return (
    <OperationsTable
      title={title}
      actorEmail={actorEmail}
      manifest={manifest}
      companyId={companyId}
      modules={modules}
    />
  );
}
