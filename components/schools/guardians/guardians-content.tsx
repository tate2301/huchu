"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { fetchSchoolsGuardians } from "@/lib/schools/admin-v2";
import type { SchoolsGuardianRecord } from "@/lib/schools/admin-v2";

export function GuardiansContent() {
  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "list"],
    queryFn: () => fetchSchoolsGuardians({ limit: 100 }),
  });

  const columns = useMemo<ColumnDef<SchoolsGuardianRecord>[]>(
    () => [
      {
        id: "guardianNo",
        header: "Guardian No",
        cell: ({ row }) => (
          <Link
            href={`/schools/guardians/${row.original.id}`}
            className="font-mono text-sm hover:underline"
          >
            {row.original.guardianNo}
          </Link>
        ),
      },
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
      },
      {
        id: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.phone}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) => row.original.email ?? "-",
      },
      {
        id: "students",
        header: "Linked Students",
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original._count?.studentLinks ?? 0}
          </span>
        ),
      },
    ],
    [],
  );

  if (guardiansQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load guardians</AlertTitle>
        <AlertDescription>
          {guardiansQuery.error instanceof Error
            ? guardiansQuery.error.message
            : "Unknown error occurred"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <DataTable
      data={guardiansQuery.data?.items ?? []}
      columns={columns}
      searchPlaceholder="Search guardians"
      searchSubmitLabel="Search"
      pagination={{ enabled: true }}
      emptyState={
        guardiansQuery.isLoading ? "Loading guardians..." : "No guardians found."
      }
    />
  );
}
