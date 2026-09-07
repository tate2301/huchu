import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import type { FiscalisationProviderConfig } from "@corelithzw/db";
import { issueWithFdmsConnector, syncWithFdmsConnector } from "./fdms-connector";

/**
 * FD-1 — the device half of the ZIMRA FDGA v7.2 protocol: keypair, CSR,
 * registration, certificate health.
 *
 * A virtual fiscal device is only a device because ZIMRA signed a certificate
 * for a key that never leaves us. Everything downstream — mTLS on every call,
 * the receipt signature in FD-3, the fiscal-day closing signature in FD-2 —
 * is that one private key. So the key is generated here, in the server
 * process, and the only thing that ever crosses the wire is a CSR: a public
 * key plus a proof we hold the matching private one.
 *
 * `node:crypto` can generate the key and produce the signature but has no
 * PKCS#10 builder, so the CertificationRequest DER below is assembled by hand.
 * That is why this file carries an ASN.1 encoder; it is deliberately the
 * smallest one that can express a CSR and nothing more.
 */

// ---------------------------------------------------------------------------
// Minimal DER
// ---------------------------------------------------------------------------

const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_NULL = 0x05;
const TAG_OID = 0x06;
const TAG_UTF8_STRING = 0x0c;
const TAG_PRINTABLE_STRING = 0x13;
const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;
/** [0] IMPLICIT, constructed — the CSR's attributes slot. */
const TAG_CONTEXT_0 = 0xa0;

const OID_COMMON_NAME = "2.5.4.3";
const OID_ORGANISATION_NAME = "2.5.4.10";
const OID_COUNTRY_NAME = "2.5.4.6";
const OID_SHA256_WITH_RSA = "1.2.840.113549.1.1.11";

function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value]);
}

function derInteger(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Only small non-negative integers are encodable here.");
  }
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  } while (remaining > 0);
  // DER integers are signed: a leading bit of 1 would read as negative.
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0x00);
  return tlv(TAG_INTEGER, Buffer.from(bytes));
}

function derOid(dotted: string): Buffer {
  const arcs = dotted.split(".").map((arc) => Number(arc));
  if (arcs.length < 2 || arcs.some((arc) => !Number.isInteger(arc) || arc < 0)) {
    throw new Error(`Malformed OID: ${dotted}`);
  }
  const bytes: number[] = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const base128: number[] = [arc & 0x7f];
    let remaining = arc >>> 7;
    while (remaining > 0) {
      base128.unshift((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    bytes.push(...base128);
  }
  return tlv(TAG_OID, Buffer.from(bytes));
}

/** X.520 PrintableString character set. Anything outside it must be UTF8String. */
const PRINTABLE_STRING = /^[A-Za-z0-9 '()+,\-./:=?]*$/;

function derDirectoryString(value: string): Buffer {
  const tag = PRINTABLE_STRING.test(value) ? TAG_PRINTABLE_STRING : TAG_UTF8_STRING;
  return tlv(tag, Buffer.from(value, "utf8"));
}

/** One RDN carrying exactly one attribute — the only shape a CSR subject needs. */
function derRelativeDistinguishedName(oid: string, value: string): Buffer {
  return tlv(TAG_SET, tlv(TAG_SEQUENCE, Buffer.concat([derOid(oid), derDirectoryString(value)])));
}

/** AlgorithmIdentifier for sha256WithRSAEncryption; RSA PKCS#1 v1.5 params are NULL, not absent. */
function derSha256WithRsaAlgorithmIdentifier(): Buffer {
  return tlv(
    TAG_SEQUENCE,
    Buffer.concat([derOid(OID_SHA256_WITH_RSA), tlv(TAG_NULL, Buffer.alloc(0))]),
  );
}

function pemArmour(label: string, der: Buffer): string {
  const body = der.toString("base64").replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

// ---------------------------------------------------------------------------
// Keypair and CSR
// ---------------------------------------------------------------------------

export type DeviceKeypair = {
  privateKeyPem: string;
  publicKeyPem: string;
};

/**
 * RSA-2048 is not a preference, it is what FDGA v7.2 accepts; the certificate
 * ZIMRA signs is bound to this modulus size and an ECDSA key would be refused.
 *
 * The key is emitted unencrypted PKCS#8 because the connector hands it
 * straight to `https.Agent`. It is never persisted by this module — the caller
 * stores it behind `FiscalisationProviderConfig.certificateRef`'s `env:`
 * indirection, which is where the platform keeps secrets it must not put in a
 * table.
 */
export function generateDeviceKeypair(options?: { modulusLength?: number }): DeviceKeypair {
  const modulusLength = options?.modulusLength ?? 2048;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

export type CertificateSigningRequestInput = {
  /** ZIMRA matches the CSR subject CN against the device serial number it issued. */
  commonName: string;
  keypair: DeviceKeypair;
  organizationName?: string;
  countryName?: string;
};

/**
 * A PKCS#10 CertificationRequest in PEM.
 *
 *   CertificationRequest ::= SEQUENCE {
 *     certificationRequestInfo CertificationRequestInfo,
 *     signatureAlgorithm       AlgorithmIdentifier,
 *     signature                BIT STRING }
 *
 *   CertificationRequestInfo ::= SEQUENCE {
 *     version       INTEGER (0),
 *     subject       Name,
 *     subjectPKInfo SubjectPublicKeyInfo,
 *     attributes    [0] IMPLICIT SET OF Attribute }
 *
 * The signature covers the *encoded* CertificationRequestInfo byte-for-byte,
 * which is why the DER for it is built once and both signed and embedded —
 * re-encoding it for the signature would risk a different-but-equivalent
 * encoding and a CSR nobody can verify.
 */
export function buildCertificateSigningRequest(input: CertificateSigningRequestInput): string {
  const commonName = String(input.commonName ?? "").trim();
  if (!commonName) {
    throw new Error("Device certificate common name (device serial number) is required.");
  }
  // ub-common-name in X.520. ZIMRA serial numbers are far shorter; a longer
  // value means the caller passed the wrong field.
  if (commonName.length > 64) {
    throw new Error("Device certificate common name must be 64 characters or fewer.");
  }

  const privateKey = createPrivateKey(input.keypair.privateKeyPem);
  const publicKey = createPublicKey(input.keypair.publicKeyPem);
  const subjectPublicKeyInfo = publicKey.export({ type: "spki", format: "der" });

  const rdns: Buffer[] = [derRelativeDistinguishedName(OID_COMMON_NAME, commonName)];
  const organizationName = String(input.organizationName ?? "").trim();
  if (organizationName) {
    rdns.push(derRelativeDistinguishedName(OID_ORGANISATION_NAME, organizationName));
  }
  const countryName = String(input.countryName ?? "").trim().toUpperCase();
  if (countryName) {
    if (countryName.length !== 2) {
      throw new Error("Country name must be a two-letter ISO 3166-1 alpha-2 code.");
    }
    rdns.push(derRelativeDistinguishedName(OID_COUNTRY_NAME, countryName));
  }

  const certificationRequestInfo = tlv(
    TAG_SEQUENCE,
    Buffer.concat([
      derInteger(0),
      tlv(TAG_SEQUENCE, Buffer.concat(rdns)),
      Buffer.from(subjectPublicKeyInfo),
      // No attributes: ZIMRA takes the extensions it wants from its own
      // records, and an empty SET here is what OpenSSL emits too.
      tlv(TAG_CONTEXT_0, Buffer.alloc(0)),
    ]),
  );

  const signature = createSign("sha256").update(certificationRequestInfo).sign(privateKey);

  const certificationRequest = tlv(
    TAG_SEQUENCE,
    Buffer.concat([
      certificationRequestInfo,
      derSha256WithRsaAlgorithmIdentifier(),
      // BIT STRING payload is prefixed by its count of unused trailing bits,
      // which for a whole-byte signature is always zero.
      tlv(TAG_BIT_STRING, Buffer.concat([Buffer.from([0x00]), signature])),
    ]),
  );

  return pemArmour("CERTIFICATE REQUEST", certificationRequest);
}

// ---------------------------------------------------------------------------
// Certificate material
// ---------------------------------------------------------------------------

const CERTIFICATE_PEM = /-----BEGIN CERTIFICATE-----/;
const CSR_PEM = /-----BEGIN CERTIFICATE REQUEST-----/;

/**
 * FDGA has been observed returning the signed certificate both PEM-armoured
 * and as bare base64 DER. Storing whichever arrived would leave `https.Agent`
 * failing at the first mTLS call with an opaque error, so normalise at the
 * boundary instead.
 */
export function normaliseCertificatePem(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Empty certificate.");
  if (CERTIFICATE_PEM.test(raw)) return `${raw.replace(/\r\n/g, "\n").trim()}\n`;
  const base64 = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new Error("Certificate is neither PEM nor base64 DER.");
  }
  return pemArmour("CERTIFICATE", Buffer.from(base64, "base64"));
}

/**
 * The exact JSON shape `buildHttpsAgent` in the connector parses out of
 * `certificateRef`. Written here so registration and transport cannot drift
 * apart: if that shape changes, this is the other end of it.
 */
export function buildCertificateBundle(input: {
  certificatePem: string;
  privateKeyPem: string;
  caPem?: string | null;
}): string {
  return JSON.stringify({
    cert: normaliseCertificatePem(input.certificatePem),
    key: input.privateKeyPem,
    ...(input.caPem ? { ca: normaliseCertificatePem(input.caPem) } : {}),
  });
}

/** Mirrors the connector's `env:` indirection, which is not exported from it. */
function resolveRefValue(ref?: string | null): string {
  const value = String(ref ?? "").trim();
  if (!value) return "";
  if (!value.startsWith("env:")) return value;
  return process.env[value.slice(4).trim()] ?? "";
}

function tryParseJson(value?: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The certificate a provider row is actually using, whichever of the two
 * `certificateRef` forms it holds (bare PEM, or the `{cert,key,ca}` bundle).
 * The console needs this to show expiry without knowing how the secret is
 * stored.
 */
export function providerCertificatePem(
  provider: Pick<FiscalisationProviderConfig, "certificateRef">,
): string | null {
  const raw = resolveRefValue(provider.certificateRef);
  if (!raw) return null;
  const parsed = tryParseJson(raw);
  const pem = (parsed ? (typeof parsed.cert === "string" ? parsed.cert : "") : raw).trim();
  // One shape out, whichever form went in: callers compare and parse this.
  return pem ? `${pem}\n` : null;
}

export type CertificateHealth = {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;
  expired: boolean;
  expiring: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Node exposes exact `validFromDate`/`validToDate` from v18.13, but the
 * `@types/node` this repo pins predates them. Reading them through a narrow
 * cast keeps the exact value; parsing the human-readable `validTo` string is
 * only the fallback, because that string is a formatted rendering and a
 * certificate expiry is not a thing to guess at.
 */
function certificateDates(certificate: X509Certificate) {
  const exact = certificate as unknown as { validFromDate?: Date; validToDate?: Date };
  return {
    notBefore: exact.validFromDate ?? new Date(certificate.validFrom),
    notAfter: exact.validToDate ?? new Date(certificate.validTo),
  };
}

/** The `notAfter` of a device certificate, as a Date. */
export function certificateExpiry(pem: string): Date {
  const certificate = new X509Certificate(pem);
  const { notAfter } = certificateDates(certificate);
  if (Number.isNaN(notAfter.getTime())) {
    throw new Error("Device certificate has an unreadable notAfter date.");
  }
  return notAfter;
}

/**
 * True inside the renewal window — and also true once the certificate has
 * already expired. An expired device is the most urgent renewal there is, and
 * a caller that only alerted on "expiring" would go quiet at exactly the
 * moment fiscalisation stops working.
 */
export function isCertificateExpiring(pem: string, days = 30, now: Date = new Date()): boolean {
  return certificateExpiry(pem).getTime() - now.getTime() <= days * MS_PER_DAY;
}

export function describeCertificate(
  pem: string,
  options?: { warnDays?: number; now?: Date },
): CertificateHealth {
  const certificate = new X509Certificate(pem);
  const now = options?.now ?? new Date();
  const warnDays = options?.warnDays ?? 30;
  const { notBefore: validFrom, notAfter: validTo } = certificateDates(certificate);
  const remainingMs = validTo.getTime() - now.getTime();

  return {
    subject: certificate.subject,
    issuer: certificate.issuer,
    serialNumber: certificate.serialNumber,
    validFrom,
    validTo,
    daysRemaining: Math.floor(remainingMs / MS_PER_DAY),
    expired: remainingMs <= 0,
    expiring: remainingMs <= warnDays * MS_PER_DAY,
  };
}

// ---------------------------------------------------------------------------
// FDGA device endpoints, over the connector seam
// ---------------------------------------------------------------------------

/**
 * The one transport is `lib/accounting/fdms-connector.ts`; it owns idempotency
 * keys, retry backoff and the mTLS agent, and nothing else in the codebase is
 * allowed to open a socket to ZIMRA. The connector's two entry points are
 * shaped for receipts, but both take their path from provider metadata, so a
 * device call rides them by handing them a *derived* provider row whose
 * `issuePath`/`syncPathTemplate` point at the device endpoint.
 *
 * The derived row also nulls `deviceId`: the connector merges
 * `deviceId: provider.deviceId ?? undefined` into every POST body, `undefined`
 * is dropped by `JSON.stringify`, and FDGA carries the device id in the path
 * rather than the body.
 */
export type FdmsDeviceTransport = {
  issue: typeof issueWithFdmsConnector;
  sync: typeof syncWithFdmsConnector;
};

const defaultTransport: FdmsDeviceTransport = {
  issue: issueWithFdmsConnector,
  sync: syncWithFdmsConnector,
};

const DEFAULT_DEVICE_PATH_PREFIX = "/Device/v1";

function devicePath(provider: FiscalisationProviderConfig, deviceId: string, operation: string) {
  const metadata = tryParseJson(provider.metadataJson) ?? {};
  const prefix = (
    typeof metadata.devicePathPrefix === "string" && metadata.devicePathPrefix.trim()
      ? metadata.devicePathPrefix.trim()
      : DEFAULT_DEVICE_PATH_PREFIX
  ).replace(/\/+$/, "");
  return `${prefix}/${encodeURIComponent(deviceId)}/${operation}`;
}

function deviceProvider(
  provider: FiscalisationProviderConfig,
  paths: { issuePath?: string; syncPathTemplate?: string },
): FiscalisationProviderConfig {
  const metadata = tryParseJson(provider.metadataJson) ?? {};
  return {
    ...provider,
    deviceId: null,
    metadataJson: JSON.stringify({ ...metadata, ...paths }),
  };
}

function requireDeviceId(provider: FiscalisationProviderConfig, override?: string | null): string {
  const deviceId = String(override ?? provider.deviceId ?? "").trim();
  if (!deviceId) {
    throw new Error("FDMS device id is not configured for this provider.");
  }
  return deviceId;
}

export type FdmsDeviceCallResult<TData> = {
  status: "SUCCESS" | "PENDING" | "FAILED";
  /** Null on anything but SUCCESS — a partial device result is never useful. */
  data: TData | null;
  operationId: string | null;
  error: string | null;
  nextRetryAt: Date | null;
  rawResponseJson: string;
};

function readBody(raw: string): Record<string, unknown> {
  return tryParseJson(raw) ?? {};
}

function readOperationId(body: Record<string, unknown>): string | null {
  const value = body.operationID ?? body.operationId;
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
}

function str(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function num(body: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

export type DeviceRegistrationInput = {
  provider: FiscalisationProviderConfig;
  deviceId?: string;
  /** Issued by ZIMRA with the device id; single-use. */
  activationKey: string;
  certificateRequestPem: string;
  deviceModelName: string;
  deviceModelVersion: string;
  attemptCount?: number;
  companyId?: string;
};

export type DeviceRegistration = {
  certificatePem: string;
  /** The bundle to write to `certificateRef`, ready for the connector's agent. */
  certificateChainPem: string[];
};

/**
 * POST /Device/v1/{deviceID}/RegisterDevice — exchange a CSR plus the
 * activation key for a signed device certificate.
 *
 * The activation key is single-use, so the idempotency key is derived from the
 * device rather than the moment: a retry of the same registration must be the
 * same request, or a network timeout burns the tenant's only activation key.
 *
 * Known gap: v7.2 also expects `DeviceModelName`/`DeviceModelVersion` as HTTP
 * headers. The connector exposes no hook for caller-supplied headers, so they
 * travel in the body here and the header form is a follow-up on the connector
 * itself.
 */
export async function registerDevice(
  input: DeviceRegistrationInput,
  transport: FdmsDeviceTransport = defaultTransport,
): Promise<FdmsDeviceCallResult<DeviceRegistration>> {
  const deviceId = requireDeviceId(input.provider, input.deviceId);
  const activationKey = String(input.activationKey ?? "").trim();
  if (!activationKey) {
    throw new Error("A ZIMRA activation key is required to register a device.");
  }
  if (!CSR_PEM.test(String(input.certificateRequestPem ?? ""))) {
    throw new Error("A PEM-encoded certificate signing request is required.");
  }

  const result = await transport.issue({
    provider: deviceProvider(input.provider, {
      issuePath: devicePath(input.provider, deviceId, "RegisterDevice"),
    }),
    payload: {
      idempotencyKey: `${input.companyId ?? input.provider.companyId}:device-register:${deviceId}`,
      payload: {
        certificateRequest: input.certificateRequestPem,
        activationKey,
        deviceModelName: input.deviceModelName,
        deviceModelVersion: input.deviceModelVersion,
      },
    },
    attemptCount: input.attemptCount ?? 0,
  });

  const body = readBody(result.rawResponseJson);
  const base = {
    operationId: readOperationId(body),
    error: result.error ?? null,
    nextRetryAt: result.nextRetryAt ?? null,
    rawResponseJson: result.rawResponseJson,
  };

  if (result.status !== "SUCCESS") {
    return { status: result.status, data: null, ...base };
  }

  const rawCertificate = str(body, "certificate", "deviceCertificate", "certificatePem");
  if (!rawCertificate) {
    // A 200 with no certificate is a failed registration however it is
    // dressed: reporting SUCCESS here would have the caller store a bundle
    // with no cert and fail every later mTLS call instead of this one.
    return {
      status: "FAILED",
      data: null,
      ...base,
      error: base.error ?? "FDMS registration returned no device certificate.",
    };
  }

  const chain = Array.isArray(body.certificateChain)
    ? body.certificateChain.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    status: "SUCCESS",
    data: {
      certificatePem: normaliseCertificatePem(rawCertificate),
      certificateChainPem: chain.map((entry) => normaliseCertificatePem(entry)),
    },
    ...base,
  };
}

export type TaxpayerInformation = {
  taxPayerName: string | null;
  taxPayerTIN: string | null;
  vatNumber: string | null;
  deviceBranchName: string | null;
  raw: Record<string, unknown>;
};

/**
 * POST /Device/v1/{deviceID}/VerifyTaxpayerInformation — the pre-flight for
 * registration. It answers "is this activation key really for this taxpayer"
 * before the key is spent, which is the difference between a typo and a
 * support ticket to ZIMRA.
 */
export async function verifyTaxpayerInformation(
  input: {
    provider: FiscalisationProviderConfig;
    deviceId?: string;
    activationKey: string;
    deviceSerialNo: string;
    attemptCount?: number;
  },
  transport: FdmsDeviceTransport = defaultTransport,
): Promise<FdmsDeviceCallResult<TaxpayerInformation>> {
  const deviceId = requireDeviceId(input.provider, input.deviceId);

  const result = await transport.issue({
    provider: deviceProvider(input.provider, {
      issuePath: devicePath(input.provider, deviceId, "VerifyTaxpayerInformation"),
    }),
    payload: {
      idempotencyKey: `${input.provider.companyId}:device-verify:${deviceId}`,
      payload: {
        activationKey: String(input.activationKey ?? "").trim(),
        deviceSerialNo: String(input.deviceSerialNo ?? "").trim(),
      },
    },
    attemptCount: input.attemptCount ?? 0,
  });

  const body = readBody(result.rawResponseJson);
  return {
    status: result.status,
    data:
      result.status === "SUCCESS"
        ? {
            taxPayerName: str(body, "taxPayerName", "taxpayerName"),
            taxPayerTIN: str(body, "taxPayerTIN", "taxpayerTIN", "tin"),
            vatNumber: str(body, "vatNumber"),
            deviceBranchName: str(body, "deviceBranchName"),
            raw: body,
          }
        : null,
    operationId: readOperationId(body),
    error: result.error ?? null,
    nextRetryAt: result.nextRetryAt ?? null,
    rawResponseJson: result.rawResponseJson,
  };
}

export type DeviceApplicableTax = {
  taxID: number | null;
  taxPercent: number | null;
  taxName: string | null;
  validFrom: string | null;
  validTill: string | null;
};

export type DeviceConfig = {
  taxPayerName: string | null;
  taxPayerTIN: string | null;
  vatNumber: string | null;
  deviceSerialNo: string | null;
  deviceBranchName: string | null;
  deviceOperatingMode: string | null;
  /** Hours a fiscal day may stay open before ZIMRA expects it closed (FD-2). */
  taxPayerDayMaxHrs: number | null;
  /** Base of the receipt verification URL the QR encodes (FD-3.2). */
  qrUrl: string | null;
  /** The taxID values `TaxCode.zimraTaxId` must map onto (FD-0.2). */
  applicableTaxes: DeviceApplicableTax[];
  certificateValidTill: Date | null;
  raw: Record<string, unknown>;
};

function parseApplicableTaxes(value: unknown): DeviceApplicableTax[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      taxID: num(entry, "taxID", "taxId"),
      taxPercent: num(entry, "taxPercent"),
      taxName: str(entry, "taxName"),
      validFrom: str(entry, "validFrom"),
      validTill: str(entry, "validTill"),
    }));
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * GET /Device/v1/{deviceID}/GetConfig — the device's own view of what ZIMRA
 * thinks it is. Everything downstream reads from here rather than from local
 * settings: the applicable tax list is the authority for FD-0.2's taxID
 * mapping, `qrUrl` for FD-3.2's QR, and `certificateValidTill` is ZIMRA's
 * expiry, which is the one to trust over the local certificate if they differ.
 */
export async function getDeviceConfig(
  input: { provider: FiscalisationProviderConfig; deviceId?: string; attemptCount?: number },
  transport: FdmsDeviceTransport = defaultTransport,
): Promise<FdmsDeviceCallResult<DeviceConfig>> {
  const deviceId = requireDeviceId(input.provider, input.deviceId);

  const result = await transport.sync({
    // No `{reference}` placeholder: the connector's replace is a no-op and the
    // path it fetches is exactly this one.
    provider: deviceProvider(input.provider, {
      syncPathTemplate: devicePath(input.provider, deviceId, "GetConfig"),
    }),
    providerReference: deviceId,
    attemptCount: input.attemptCount ?? 0,
  });

  const body = readBody(result.rawResponseJson);
  return {
    status: result.status,
    data:
      result.status === "SUCCESS"
        ? {
            taxPayerName: str(body, "taxPayerName", "taxpayerName"),
            taxPayerTIN: str(body, "taxPayerTIN", "taxpayerTIN"),
            vatNumber: str(body, "vatNumber"),
            deviceSerialNo: str(body, "deviceSerialNo"),
            deviceBranchName: str(body, "deviceBranchName"),
            deviceOperatingMode: str(body, "deviceOperatingMode"),
            taxPayerDayMaxHrs: num(body, "taxPayerDayMaxHrs"),
            qrUrl: str(body, "qrUrl"),
            applicableTaxes: parseApplicableTaxes(body.applicableTaxes),
            certificateValidTill: parseDate(str(body, "certificateValidTill")),
            raw: body,
          }
        : null,
    operationId: readOperationId(body),
    error: result.error ?? null,
    nextRetryAt: result.nextRetryAt ?? null,
    rawResponseJson: result.rawResponseJson,
  };
}

export type DeviceStatus = {
  /** FiscalDayClosed | FiscalDayOpened | FiscalDayCloseInitiated | FiscalDayCloseFailed */
  fiscalDayStatus: string | null;
  fiscalDayReconciliationMode: string | null;
  /** ZIMRA's counters — the truth FD-2 and FD-3 reconcile local state against. */
  lastFiscalDayNo: number | null;
  lastReceiptGlobalNo: number | null;
  fiscalDayServerSignature: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

/**
 * GET /Device/v1/{deviceID}/GetStatus.
 *
 * This is the reconciliation point for the receipt chain: if ZIMRA's
 * `lastReceiptGlobalNo` and ours disagree, the chain has forked and no further
 * receipt may be signed until that is resolved.
 */
export async function getDeviceStatus(
  input: { provider: FiscalisationProviderConfig; deviceId?: string; attemptCount?: number },
  transport: FdmsDeviceTransport = defaultTransport,
): Promise<FdmsDeviceCallResult<DeviceStatus>> {
  const deviceId = requireDeviceId(input.provider, input.deviceId);

  const result = await transport.sync({
    provider: deviceProvider(input.provider, {
      syncPathTemplate: devicePath(input.provider, deviceId, "GetStatus"),
    }),
    providerReference: deviceId,
    attemptCount: input.attemptCount ?? 0,
  });

  const body = readBody(result.rawResponseJson);
  const signature = body.fiscalDayServerSignature;
  return {
    status: result.status,
    data:
      result.status === "SUCCESS"
        ? {
            fiscalDayStatus: str(body, "fiscalDayStatus"),
            fiscalDayReconciliationMode: str(body, "fiscalDayReconciliationMode"),
            lastFiscalDayNo: num(body, "lastFiscalDayNo"),
            lastReceiptGlobalNo: num(body, "lastReceiptGlobalNo"),
            fiscalDayServerSignature:
              signature && typeof signature === "object"
                ? (signature as Record<string, unknown>)
                : null,
            raw: body,
          }
        : null,
    operationId: readOperationId(body),
    error: result.error ?? null,
    nextRetryAt: result.nextRetryAt ?? null,
    rawResponseJson: result.rawResponseJson,
  };
}
