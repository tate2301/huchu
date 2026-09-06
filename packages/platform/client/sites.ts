/** The browser's client for the kernel's sites. */
import { fetchJson } from "../api-client";

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
