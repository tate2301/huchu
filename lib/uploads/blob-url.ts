/**
 * Whether a URL is one our own blob store handed out: https on Vercel Blob,
 * and, when a folder is given, under it. Anything else (another host, a
 * `javascript:` link) would be rendered as an <img> or link inside the app.
 */
export function isOwnBlobUrl(value: string, folder?: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".blob.vercel-storage.com")) return false;
    return folder ? url.pathname.startsWith(`/${folder.replace(/^\/+|\/+$/g, "")}/`) : true;
  } catch {
    return false;
  }
}
