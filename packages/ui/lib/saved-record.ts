type SavedRecordQuery = {
  createdId?: string | null;
  createdAt?: string | Date | null;
  source?: string | null;
};

type QueryValue = string | number | boolean | null | undefined;

const toIsoString = (value: string | Date | null | undefined) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export function buildSavedRecordQuery(
  record: SavedRecordQuery,
  extras: Record<string, QueryValue> = {},
) {
  const params = new URLSearchParams();

  Object.entries(extras).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  if (record.createdId) {
    params.set("createdId", record.createdId);
  }
  if (record.source) {
    params.set("source", record.source);
  }

  const createdAt = toIsoString(record.createdAt);
  if (createdAt) {
    params.set("createdAt", createdAt);
  }

  return params;
}

export function buildSavedRecordRedirect(
  pathname: string,
  record: SavedRecordQuery,
  extras: Record<string, QueryValue> = {},
) {
  const params = buildSavedRecordQuery(record, extras);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function formatSavedRecordTimestamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}
