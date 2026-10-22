/**
 * Whether this server can keep files in Vercel Blob. A store connected on
 * Vercel sets `BLOB_STORE_ID` and signs in with the deployment's OIDC token;
 * a machine without OIDC (local dev, scripts) uses `BLOB_READ_WRITE_TOKEN`.
 * `@vercel/blob` picks whichever is set.
 */
export const isBlobStorageConfigured = () =>
  Boolean(process.env.BLOB_STORE_ID?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim())
