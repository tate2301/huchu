export type ScaleReading = {
  kg: number;
  source: "manual" | "local-helper";
  capturedAt: string;
};

export async function fetchScaleReadingFromLocalHelper(): Promise<ScaleReading> {
  const response = await fetch("/api/scrap-metal/scale/last-weight", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const data = (await response.json()) as { data?: ScaleReading; error?: string };
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Scale helper unavailable");
  }
  return data.data;
}

