"use client";

import { useEffect, useState } from "react";
import { fetchManifest } from "@/components/admin-portal/api";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadManifest() {
      setLoading(true);
      try {
        const payload = await fetchManifest();
        if (!ignore) {
          setManifest(payload);
        }
      } catch {
        if (!ignore) {
          setManifest(PLATFORM_ADMIN_MANIFEST as unknown as OperationManifest);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadManifest();
    return () => {
      ignore = true;
    };
  }, []);

  if (loading) {
    return (
      <AdminModuleLoading
        label={companyId ? "Loading workspace advanced tools" : "Loading advanced tools"}
        description="Preparing the latest operations manifest and admin execution actions."
      />
    );
  }

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
