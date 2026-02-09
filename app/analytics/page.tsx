import { redirect } from "next/navigation";

function toQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (typeof value === "string") params.set(key, value);
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default function AnalyticsRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  redirect(`/reports/downtime${toQueryString(searchParams)}`);
}
