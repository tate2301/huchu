"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/** A location as the dialog edits it. */
export type EditableLocation = {
  id: string;
  code: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type LocationForm = { name: string; siteId: string; isActive: boolean };

/**
 * New location, and the same form to edit one.
 *
 * It was a side sheet on the stock list, under a paragraph about store rooms
 * and bays, with a line under the code saying it could not be changed. The
 * code is read-only and says so by being read-only. A location's site is
 * chosen once, when it is made — the API does not move a location between
 * sites, so the edit form does not offer to.
 */
export function LocationDialog({
  open,
  onOpenChange,
  location,
  defaultSiteId,
  footerStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The location to edit, or null for a new one. */
  location: EditableLocation | null;
  /** The site a new location starts at. */
  defaultSiteId?: string;
  /**
   * The rare verbs on an existing one — Delete — drawn at the footer's left,
   * away from Save. The list has no record page to put them on.
   */
  footerStart?: ReactNode;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LocationForm>({ name: "", siteId: "", isActive: true });
  const [errors, setErrors] = useState<string[]>([]);

  // Seed as the dialog opens rather than in an effect, so there is no flash of
  // the last location's details.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = open ? (location?.id ?? "new") : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setErrors([]);
    setForm({
      name: location?.name ?? "",
      siteId: location?.siteId ?? defaultSiteId ?? "",
      isActive: location?.isActive ?? true,
    });
  }

  const sitesQuery = useQuery({ queryKey: ["sites"], queryFn: fetchSites, enabled: open });
  const sites = sitesQuery.data ?? [];
  const siteId = form.siteId || sites[0]?.id || "";

  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "STOCK_LOCATION",
    enabled: open && !location && Boolean(siteId),
    siteId: siteId || undefined,
  });
  const code = location ? location.code : reservedId;

  const save = useMutation({
    mutationFn: () =>
      location
        ? fetchJson(`/api/stock-locations/${location.id}` as const, {
            method: "PATCH",
            body: JSON.stringify({ name: form.name.trim(), isActive: form.isActive }),
          })
        : fetchJson<{ id: string; siteId: string }>("/api/stock-locations", {
            method: "POST",
            body: JSON.stringify({
              code: reservedId.trim(),
              name: form.name.trim(),
              siteId,
              isActive: true,
            }),
          }),
    onSuccess: () => {
      toast({ title: location ? "Location saved" : "Location created", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
      onOpenChange(false);
    },
    onError: (error) =>
      setErrors([
        `${location ? "That location was not saved" : "That location was not created"}: ${getApiErrorMessage(error)}`,
      ]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!form.name.trim()) problems.push("Give the location a name.");
    if (!location && !siteId) problems.push("Choose the site it belongs to.");
    if (!location && !reservedId.trim()) {
      problems.push(
        reserveError ? `No code was reserved for it: ${reserveError}` : "Its code is still being reserved.",
      );
    }
    setErrors(problems);
    if (problems.length === 0) save.mutate();
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={location ? location.name : "New location"}
      size="sm"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          {footerStart ? <div className="mr-auto flex flex-wrap gap-2">{footerStart}</div> : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || (!location && isReserving)}>
            {location ? "Save location" : "Create location"}
          </Button>
        </>
      }
    >
      <FormField label="Name">
        {(id) => (
          <Input
            id={id}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Main store"
            autoFocus={!location}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Code">
          {(id) => (
            <Input
              id={id}
              value={code || (isReserving ? "Reserving…" : "")}
              readOnly
              className="font-mono"
            />
          )}
        </FormField>

        {location ? (
          <FormField label="Status">
            {(id) => (
              <Select
                value={form.isActive ? "active" : "inactive"}
                onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value === "active" }))}
              >
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : (
          <FormField label="Site">
            {(id) => (
              <Select
                value={siteId || undefined}
                onValueChange={(value) => setForm((prev) => ({ ...prev, siteId: value }))}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder={sitesQuery.isLoading ? "Loading…" : "Choose a site"} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
      </div>
    </RecordDialog>
  );
}
