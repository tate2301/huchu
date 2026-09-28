"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { fetchCrmLists } from "@/lib/crm/collections-client";
import {
  fetchCrmCompanies,
  fetchCrmFieldDefinitions,
  fetchCrmPeople,
  fetchCrmPipelines,
  fetchCrmSites,
  type CrmPipelineRecord,
} from "@/lib/crm/crm-v2";
import { writeState } from "@/lib/crm/registers/codec";
import {
  CUSTOM_FIELD_PREFIX,
  type FilterDef,
  type FilterOption,
  type RegisterDef,
  type ViewState,
} from "@/lib/crm/registers/types";

export type TeamMember = { id: string; name: string | null };

/** The team, for owner filters and "assign to". Shared cache with every other owner picker. */
export function useTeamMembers(enabled = true) {
  return useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: TeamMember[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled,
    select: (response) => response.data,
  });
}

/** The groups a record type can be put in. */
export function useGroups(entity: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["crm", "lists", entity],
    queryFn: () => fetchCrmLists(entity),
    staleTime: 60_000,
    enabled: Boolean(entity) && enabled,
    select: (response) => response.data,
  });
}

/** The kinds of custom field whose answers are a list to tick. */
const LISTED_FIELD_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT"]);

/**
 * The company's own fields on this kind of record, as filters (`cf.<key>`):
 * each choice field lists its choices to tick, several meaning any of them.
 * Shared cache with the field settings, which refresh it when a field changes.
 */
export function useCustomFieldFilters(def: RegisterDef): FilterDef[] {
  const fields = useQuery({
    queryKey: ["crm", "field-definitions", def.entity],
    queryFn: () => fetchCrmFieldDefinitions(def.entity),
    enabled: Boolean(def.entity),
    staleTime: 5 * 60_000,
    select: (response) => response.data,
  });
  return useMemo(
    () =>
      (fields.data ?? [])
        .filter((field) => LISTED_FIELD_TYPES.has(field.type) && (field.options?.length ?? 0) > 0)
        .map((field) => ({
          key: `${CUSTOM_FIELD_PREFIX}${field.key}`,
          label: field.label,
          kind: "enum" as const,
          options: (field.options ?? []).map(({ value, label }) => ({ value, label })),
          anyLabel: "Any",
        })),
    [fields.data],
  );
}

/** The company's deal pipelines, with their stages. Shared cache with every pipeline picker. */
export function usePipelines(enabled = true) {
  return useQuery({
    queryKey: ["crm", "pipelines"],
    queryFn: () => fetchCrmPipelines(),
    staleTime: 5 * 60_000,
    enabled,
    select: (response) => response.data,
  });
}

/**
 * A filter's answers when they are the company's own pipeline setup
 * (`FilterDef.source`):
 *
 * - pipelines, the default one marked — it is what a board shows while the
 *   filter is left alone;
 * - stages: the chosen pipeline's; on a board with none chosen, the default
 *   pipeline's; on a table, every pipeline's, each under its pipeline's name.
 */
export function configOptions(
  filter: FilterDef,
  pipelines: readonly CrmPipelineRecord[],
  state: ViewState,
  onBoard: boolean,
): FilterOption[] {
  const active = pipelines.filter((pipeline) => pipeline.isActive);
  if (filter.source === "pipelines") {
    return active.map((pipeline) => ({
      value: pipeline.id,
      label: pipeline.name,
      ...(pipeline.isDefault ? { isDefault: true } : {}),
    }));
  }
  const chosen = filter.follows ? state.filters[filter.follows] : undefined;
  const chosenId = Array.isArray(chosen) ? (chosen as readonly string[])[0] : undefined;
  const shown = chosenId
    ? active.filter((pipeline) => pipeline.id === chosenId)
    : onBoard
      ? active.filter((pipeline) => pipeline.isDefault)
      : active;
  return shown.flatMap((pipeline) =>
    pipeline.stages.map((stage) => ({
      value: stage.id,
      label: stage.name,
      ...(shown.length > 1 ? { group: pipeline.name } : {}),
    })),
  );
}

/**
 * A filter's answers read from the records — the cities sites are in — the
 * way a spreadsheet's column filter lists what is in the column. Narrowed by
 * the rest of the list's state; fetched only while the filter is open.
 */
export function useFacetOptions(def: RegisterDef, filter: FilterDef, state: ViewState, enabled: boolean) {
  const query = writeState(def, { q: state.q, filters: state.filters });
  return useQuery({
    queryKey: ["crm", "register-facet", def.key, filter.key, query],
    queryFn: () =>
      fetchJson<{ data: FilterOption[] }>(
        `/api/v2/crm/registers/${def.key.toLowerCase()}/facets/${filter.key}?${query}`,
      ),
    enabled: enabled && Boolean(filter.facet),
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

type RelationKind = NonNullable<FilterDef["relation"]>;

const SEARCHERS: Partial<Record<RelationKind, (q: string) => Promise<FilterOption[]>>> = {
  COMPANY: async (q) =>
    (await fetchCrmCompanies({ state: { q }, limit: 20 })).data.map((company) => ({
      value: company.id,
      label: company.name,
    })),
  PERSON: async (q) =>
    (await fetchCrmPeople({ state: { q }, limit: 20 })).data.map((person) => ({
      value: person.id,
      label: person.fullName,
    })),
  SITE: async (q) =>
    (await fetchCrmSites({ state: { q }, limit: 20 })).data.map((site) => ({
      value: site.id,
      label: site.name,
    })),
};

/** Records of another kind, searched by name, for a relation filter. */
export function useRelationSearch(relation: RelationKind | undefined, q: string, enabled: boolean) {
  const search = relation ? SEARCHERS[relation] : undefined;
  return useQuery({
    queryKey: ["crm", "relation-search", relation, q],
    queryFn: () => search!(q),
    enabled: enabled && Boolean(search),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * What the ids in a relation filter are called, for its chip: "Company: Acme"
 * after a reload, when all the address says is an id.
 */
export function useRecordNames(relation: RelationKind | undefined, ids: readonly string[]) {
  const results = useQueries({
    queries: ids.slice(0, 5).map((id) => ({
      queryKey: ["crm", "record-summary", relation, id],
      queryFn: () =>
        fetchJson<{ title: string }>(`/api/v2/crm/records/${relation!.toLowerCase()}/${id}/summary`),
      enabled: Boolean(relation),
      staleTime: 5 * 60_000,
    })),
  });
  const names = new Map<string, string>();
  results.forEach((result, index) => {
    if (result.data?.title) names.set(ids[index], result.data.title);
  });
  return names;
}
