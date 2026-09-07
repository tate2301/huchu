/** The browser's client for the kernel's sites. */
import { fetchJson, buildQuery } from "../api-client";

export type Site = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  measurementUnit: string;
  isActive: boolean;
};

export async function fetchSites() {
  const response = await fetchJson<{ sites: Site[] }>("/api/sites");
  return response.sites;
}

export async function fetchSitesList(
  params: {
    active?: boolean | "all";
    search?: string;
  } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ sites: Site[] }>(`/api/sites${query}`);
  return response.sites;
}

export async function createSite(input: {
  name: string;
  code?: string;
  location?: string;
  measurementUnit?: "tonnes" | "trips" | "wheelbarrows";
}) {
  return fetchJson<Site>("/api/sites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSite(
  id: string,
  input: {
    name?: string;
    code?: string;
    location?: string | null;
    measurementUnit?: "tonnes" | "trips" | "wheelbarrows";
    isActive?: boolean;
  },
) {
  return fetchJson<Site>(`/api/sites/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSite(id: string) {
  return fetchJson<{ success: boolean; archived?: boolean }>(`/api/sites/${id}`, {
    method: "DELETE",
  });
}
