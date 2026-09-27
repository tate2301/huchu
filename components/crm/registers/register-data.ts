"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { fetchCrmLists } from "@/lib/crm/collections-client";
import { fetchCrmCompanies, fetchCrmPeople, fetchCrmSites } from "@/lib/crm/crm-v2";
import { writeState } from "@/lib/crm/registers/codec";
import type { FilterDef, FilterOption, RegisterDef, ViewState } from "@/lib/crm/registers/types";

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
