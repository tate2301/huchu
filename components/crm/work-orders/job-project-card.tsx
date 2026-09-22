"use client";

/**
 * The step after "raise job": the project the job belongs to.
 *
 * James's chain is lead -> qualified -> raise job -> project, and this is the
 * door between the last two. A job that has outgrown a day's work becomes a
 * project here, carrying its client, site and deal across rather than asking
 * anybody to retype what the system already knows.
 *
 * Once a project exists the button is gone and the link is here, for the same
 * reason the invoice button disappears once an invoice is raised: two projects
 * for one job splits its costs in half and neither figure is true.
 */

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Project = { id: string; projectNo: string; name: string };

export function JobProjectCard({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm", "projects", "for-job", jobId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      fetchJson<{ data: Project[] }>(`/api/v2/crm/projects?workOrderId=${jobId}&limit=1`),
  });

  const raise = useMutation({
    mutationFn: () =>
      fetchJson<{ project: Project }>("/api/v2/crm/projects", {
        method: "POST",
        body: JSON.stringify({ fromWorkOrderId: jobId, currency: "USD" }),
      }),
    onSuccess: () => {
      toast({ title: "Project raised", description: "Costs can be booked against it now." });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast({ title: "Could not raise it", description: getApiErrorMessage(error) }),
  });

  if (isLoading) return null;

  const project = data?.data?.[0];

  if (project) {
    return (
      <div className="space-y-1">
        <Link
          href={`/crm/projects/${project.id}`}
          className="block text-sm font-medium text-[var(--brand-strong)] hover:underline"
        >
          {project.name}
        </Link>
        <p className="text-sm text-[var(--text-muted)]">{project.projectNo}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--text-muted)]">
        For work that runs past a day, so requisitions and costs have somewhere
        to land.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={raise.isPending}
        onClick={() => raise.mutate()}
      >
        {raise.isPending ? "Raising…" : "Raise a project"}
      </Button>
    </div>
  );
}
