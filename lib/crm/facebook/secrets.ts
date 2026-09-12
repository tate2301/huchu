/**
 * Encryption at rest for the two Facebook credentials that are not ours.
 *
 * A Page access token can read a customer's leads and a Meta app secret can
 * forge deliveries into their CRM, so neither belongs in the database as text
 * the way `CrmApiKey` hashes do — a hash is enough for a credential we only
 * ever compare, and useless for one we have to replay to Meta.
 *
 * AES-256-GCM with a random IV per value and the tag stored alongside it:
 * `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version prefix is there so
 * a key rotation has somewhere to say what it did; today there is one scheme.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SCHEME = "v1";
const IV_BYTES = 12;
const KEY_ENV = "CRM_INTEGRATION_ENCRYPTION_KEY";

export class IntegrationSecretError extends Error {}

/**
 * The 32-byte key, from 64 hex characters or 44 base64 ones.
 *
 * Read per call rather than at import: a deployment without a Facebook
 * connection configured should not fail to boot over a variable nothing asks
 * for, and the one that does ask for it should fail where an operator can see
 * which feature wanted it.
 */
function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env[KEY_ENV]?.trim();
  if (!raw) {
    throw new IntegrationSecretError(
      `${KEY_ENV} is not set. Generate one with \`openssl rand -base64 32\` before connecting a Facebook Page.`,
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new IntegrationSecretError(
      `${KEY_ENV} must decode to 32 bytes (64 hex characters, or 32 bytes of base64).`,
    );
  }
  return key;
}

/** Whether a key is configured and usable — for a settings screen to say so
 *  before an operator types a token into a form that cannot store it. */
export function integrationEncryptionAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    encryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, env?: NodeJS.ProcessEnv): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SCHEME,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, env?: NodeJS.ProcessEnv): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== SCHEME) {
    throw new IntegrationSecretError("Stored secret is not in the expected format.");
  }
  const [, iv, tag, ciphertext] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(env),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM failing to authenticate means the key changed or the row was
    // tampered with. Either way the value is gone, and saying so beats
    // handing a caller garbage that looks like a token.
    throw new IntegrationSecretError(
      `Stored secret could not be decrypted. ${KEY_ENV} may have been rotated since it was saved.`,
    );
  }
}

/** The last four characters, for a settings screen to show which token is
 *  saved without showing the token. */
export function secretTail(plaintext: string): string {
  return plaintext.slice(-4);
}
