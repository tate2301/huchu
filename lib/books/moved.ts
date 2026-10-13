/**
 * An old address forwarding to where its page moved, with its query intact:
 * `/accounting/journals?journal=…` opens `/books/journals?journal=…`.
 */
export function movedTo(path: string, searchParams: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) for (const one of value) query.append(key, one);
    else if (value !== undefined) query.append(key, value);
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
