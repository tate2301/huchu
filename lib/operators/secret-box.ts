import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for an operator's authenticator secret.
 *
 * The second factor is only a second factor if a copy of the database is not
 * enough to produce codes, so the secret is stored sealed with a key the
 * database never holds: AES-256-GCM, a random IV per value, the tag alongside,
 * `v1.<iv>.<tag>.<ciphertext>` in base64url.
 *
 * Its own key rather than `NEXTAUTH_SECRET`, because rotating the session
 * secret must not silently break every operator's authenticator.
 */

const SCHEME = "v1";
const IV_BYTES = 12;
export const OPERATOR_SECRET_KEY_ENV = "OPERATOR_SECRET_KEY";

export class OperatorSecretError extends Error {}

function key(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env[OPERATOR_SECRET_KEY_ENV]?.trim();
  if (!raw) {
    throw new OperatorSecretError(
      `${OPERATOR_SECRET_KEY_ENV} is not set. Generate one with \`openssl rand -base64 32\`.`,
    );
  }
  const bytes = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new OperatorSecretError(`${OPERATOR_SECRET_KEY_ENV} must decode to 32 bytes.`);
  }
  return bytes;
}

export function sealSecret(plaintext: string, env?: NodeJS.ProcessEnv): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(env), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [SCHEME, iv, cipher.getAuthTag(), ciphertext].map((part) =>
    typeof part === "string" ? part : part.toString("base64url"),
  ).join(".");
}

export function openSecret(sealed: string, env?: NodeJS.ProcessEnv): string {
  const [scheme, iv, tag, ciphertext] = sealed.split(".");
  if (scheme !== SCHEME || !iv || !tag || !ciphertext) {
    throw new OperatorSecretError("The stored authenticator secret is not in a form this server can read.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
