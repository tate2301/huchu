import { spawnSync } from "node:child_process";
import { X509Certificate, createPublicKey, createSign, verify } from "node:crypto";
import type { FiscalisationProviderConfig } from "@corelithzw/db";
import { describe, expect, it } from "vitest";
import {
  buildCertificateBundle,
  buildCertificateSigningRequest,
  certificateExpiry,
  describeCertificate,
  generateDeviceKeypair,
  getDeviceConfig,
  getDeviceStatus,
  isCertificateExpiring,
  normaliseCertificatePem,
  providerCertificatePem,
  registerDevice,
  verifyTaxpayerInformation,
  type FdmsDeviceTransport,
} from "./fdms-device";

/**
 * The DER helpers below are written independently of the ones in the module
 * under test on purpose. The reader is what checks the module's encoder; the
 * encoder here is what builds a certificate for the expiry tests, and it is
 * itself checked by handing its output to Node's X509Certificate parser. Two
 * implementations that agree, plus one third-party parser, is the closest we
 * get to a spec conformance test without a network.
 */

// --- DER reader -------------------------------------------------------------

type Tlv = { tag: number; content: Buffer; full: Buffer; end: number };

function readTlv(buffer: Buffer, offset = 0): Tlv {
  const tag = buffer[offset];
  const first = buffer[offset + 1];
  let length = first;
  let header = 2;
  if ((first & 0x80) !== 0) {
    const count = first & 0x7f;
    length = 0;
    for (let i = 0; i < count; i += 1) length = length * 256 + buffer[offset + 2 + i];
    header = 2 + count;
  }
  const end = offset + header + length;
  return {
    tag,
    content: buffer.subarray(offset + header, end),
    full: buffer.subarray(offset, end),
    end,
  };
}

function readChildren(content: Buffer): Tlv[] {
  const children: Tlv[] = [];
  let offset = 0;
  while (offset < content.length) {
    const child = readTlv(content, offset);
    children.push(child);
    offset = child.end;
  }
  return children;
}

function decodeOid(content: Buffer): string {
  const arcs = [Math.floor(content[0] / 40), content[0] % 40];
  let value = 0;
  for (const byte of content.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      arcs.push(value);
      value = 0;
    }
  }
  return arcs.join(".");
}

function pemToDer(pem: string, label: string): Buffer {
  const match = pem.match(
    new RegExp(`-----BEGIN ${label}-----\\n([\\s\\S]+?)\\n-----END ${label}-----`),
  );
  if (!match) throw new Error(`Not a ${label} PEM block`);
  return Buffer.from(match[1].replace(/\n/g, ""), "base64");
}

// --- DER writer (test-only, for the self-signed certificate) ----------------

function len(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  let rest = n;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, ...parts: Buffer[]): Buffer {
  const value = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), len(value.length), value]);
}

const SHA256_RSA_ALG = Buffer.from("300d06092a864886f70d01010b0500", "hex");
const CN_OID = Buffer.from("0603550403", "hex");

function name(commonName: string): Buffer {
  return der(0x30, der(0x31, der(0x30, CN_OID, der(0x13, Buffer.from(commonName, "utf8")))));
}

function utcTime(date: Date): Buffer {
  const pad = (value: number) => String(value).padStart(2, "0");
  const text =
    `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return der(0x17, Buffer.from(text, "ascii"));
}

function selfSignedCertificate(input: {
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  keypair?: { privateKeyPem: string; publicKeyPem: string };
}) {
  const keypair = input.keypair ?? generateDeviceKeypair();
  const spki = Buffer.from(
    createPublicKey(keypair.publicKeyPem).export({ type: "spki", format: "der" }),
  );
  const tbs = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([0x02]))),
    der(0x02, Buffer.from([0x2a])),
    SHA256_RSA_ALG,
    name(input.commonName),
    der(0x30, utcTime(input.notBefore), utcTime(input.notAfter)),
    name(input.commonName),
    spki,
  );
  const signature = createSign("sha256").update(tbs).sign(keypair.privateKeyPem);
  const certificate = der(
    0x30,
    tbs,
    SHA256_RSA_ALG,
    der(0x03, Buffer.from([0x00]), signature),
  );
  const body = certificate.toString("base64").replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return {
    der: certificate,
    pem: `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`,
    keypair,
  };
}

// --- fixtures ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

// One 2048-bit keypair for the whole file: RSA generation is the slowest thing
// here and none of these tests need a fresh one.
const keypair = generateDeviceKeypair();

function fakeProvider(
  overrides: Partial<FiscalisationProviderConfig> = {},
): FiscalisationProviderConfig {
  return {
    id: "provider-1",
    companyId: "company-1",
    providerKey: "ZIMRA_FDMS",
    apiBaseUrl: "https://fdmsapitest.zimra.co.zw",
    username: null,
    password: null,
    apiToken: null,
    authType: null,
    deviceId: "12345",
    timeoutMs: 20000,
    retryPolicyJson: null,
    certificateRef: null,
    webhookSecretRef: null,
    metadataJson: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

type IssueCall = Parameters<FdmsDeviceTransport["issue"]>[0];
type SyncCall = Parameters<FdmsDeviceTransport["sync"]>[0];

function fakeTransport(responses: { issue?: unknown; sync?: unknown } = {}) {
  const issueCalls: IssueCall[] = [];
  const syncCalls: SyncCall[] = [];
  const transport: FdmsDeviceTransport = {
    issue: async (input) => {
      issueCalls.push(input);
      return {
        status: "SUCCESS",
        rawResponseJson: JSON.stringify(responses.issue ?? {}),
      };
    },
    sync: async (input) => {
      syncCalls.push(input);
      return {
        status: "SUCCESS",
        rawResponseJson: JSON.stringify(responses.sync ?? {}),
      };
    },
  };
  return { transport, issueCalls, syncCalls };
}

const hasOpenssl = spawnSync("openssl", ["version"]).status === 0;

// --- keypair ----------------------------------------------------------------

describe("generateDeviceKeypair", () => {
  it("produces a PEM RSA-2048 pair whose halves belong together", () => {
    expect(keypair.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(keypair.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);

    const publicKey = createPublicKey(keypair.publicKeyPem);
    expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);

    const message = Buffer.from("fiscal-day-1");
    const signature = createSign("sha256").update(message).sign(keypair.privateKeyPem);
    expect(verify("sha256", message, publicKey, signature)).toBe(true);
  });
});

// --- CSR --------------------------------------------------------------------

describe("buildCertificateSigningRequest", () => {
  const serialNo = "SN-DEV-000123";

  it("emits a PKCS#10 structure whose signature verifies over the request info", () => {
    const csr = buildCertificateSigningRequest({ commonName: serialNo, keypair });

    expect(csr).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n/);
    expect(csr.trimEnd()).toMatch(/-----END CERTIFICATE REQUEST-----$/);
    for (const line of csr.split("\n").slice(1, -2)) {
      expect(line.length).toBeLessThanOrEqual(64);
    }

    const bytes = pemToDer(csr, "CERTIFICATE REQUEST");
    const outer = readTlv(bytes);
    expect(outer.tag).toBe(0x30);
    // Nothing may trail the outer SEQUENCE: extra bytes are how a
    // hand-rolled length bug shows up.
    expect(outer.end).toBe(bytes.length);

    const [requestInfo, algorithm, signatureBits] = readChildren(outer.content);

    // signatureAlgorithm: sha256WithRSAEncryption, explicit NULL parameters.
    const [algOid, algParams] = readChildren(algorithm.content);
    expect(decodeOid(algOid.content)).toBe("1.2.840.113549.1.1.11");
    expect(algParams.tag).toBe(0x05);
    expect(algParams.content.length).toBe(0);

    // CertificationRequestInfo: version 0, subject, SPKI, empty [0] attributes.
    const [version, subject, spki, attributes] = readChildren(requestInfo.content);
    expect(version.tag).toBe(0x02);
    expect(version.content).toEqual(Buffer.from([0x00]));
    expect(attributes.tag).toBe(0xa0);
    expect(attributes.content.length).toBe(0);

    const expectedSpki = Buffer.from(
      createPublicKey(keypair.publicKeyPem).export({ type: "spki", format: "der" }),
    );
    expect(Buffer.compare(spki.full, expectedSpki)).toBe(0);

    const rdns = readChildren(subject.content);
    expect(rdns).toHaveLength(1);
    const [attrType, attrValue] = readChildren(readChildren(rdns[0].content)[0].content);
    expect(decodeOid(attrType.content)).toBe("2.5.4.3");
    expect(attrValue.tag).toBe(0x13); // PrintableString
    expect(attrValue.content.toString("utf8")).toBe(serialNo);

    expect(signatureBits.tag).toBe(0x03);
    expect(signatureBits.content[0]).toBe(0x00); // unused bits
    const signature = signatureBits.content.subarray(1);
    expect(
      verify("sha256", requestInfo.full, createPublicKey(keypair.publicKeyPem), signature),
    ).toBe(true);
  });

  it("does not verify once the signed region is altered", () => {
    // Guards against a signature computed over the wrong bytes: if it were,
    // tampering with the request info would go undetected.
    const bytes = pemToDer(
      buildCertificateSigningRequest({ commonName: serialNo, keypair }),
      "CERTIFICATE REQUEST",
    );
    const [requestInfo, , signatureBits] = readChildren(readTlv(bytes).content);
    const tampered = Buffer.from(requestInfo.full);
    tampered[tampered.length - 1] ^= 0xff;

    expect(
      verify(
        "sha256",
        tampered,
        createPublicKey(keypair.publicKeyPem),
        signatureBits.content.subarray(1),
      ),
    ).toBe(false);
  });

  it("carries optional organisation and country RDNs when given", () => {
    const csr = buildCertificateSigningRequest({
      commonName: serialNo,
      keypair,
      organizationName: "Huchu Mine (Pvt) Ltd",
      countryName: "zw",
    });
    const [requestInfo] = readChildren(readTlv(pemToDer(csr, "CERTIFICATE REQUEST")).content);
    const [, subject] = readChildren(requestInfo.content);
    const decoded = readChildren(subject.content).map((rdn) => {
      const [type, value] = readChildren(readChildren(rdn.content)[0].content);
      return [decodeOid(type.content), value.content.toString("utf8")];
    });
    expect(decoded).toEqual([
      ["2.5.4.3", serialNo],
      ["2.5.4.10", "Huchu Mine (Pvt) Ltd"],
      ["2.5.4.6", "ZW"],
    ]);
  });

  it("falls back to UTF8String for a common name outside PrintableString", () => {
    const csr = buildCertificateSigningRequest({ commonName: "DEV_ZW#1", keypair });
    const [requestInfo] = readChildren(readTlv(pemToDer(csr, "CERTIFICATE REQUEST")).content);
    const [, subject] = readChildren(requestInfo.content);
    const [, value] = readChildren(readChildren(readChildren(subject.content)[0].content)[0].content);
    expect(value.tag).toBe(0x0c);
  });

  it("refuses a missing or oversized common name", () => {
    expect(() => buildCertificateSigningRequest({ commonName: "  ", keypair })).toThrow(
      /common name/i,
    );
    expect(() =>
      buildCertificateSigningRequest({ commonName: "A".repeat(65), keypair }),
    ).toThrow(/64 characters/);
    expect(() =>
      buildCertificateSigningRequest({ commonName: "SN1", keypair, countryName: "ZWE" }),
    ).toThrow(/alpha-2/);
  });

  it.skipIf(!hasOpenssl)("verifies as a CSR under openssl", () => {
    const csr = buildCertificateSigningRequest({
      commonName: "SN-OPENSSL-1",
      keypair,
      organizationName: "Corelith",
    });
    const result = spawnSync("openssl", ["req", "-noout", "-verify", "-subject"], {
      input: csr,
      encoding: "utf8",
    });
    expect(`${result.stdout}${result.stderr}`).toMatch(/verify OK/i);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/CN\s*=\s*SN-OPENSSL-1/);
  });
});

// --- certificate material ---------------------------------------------------

describe("certificate helpers", () => {
  const notBefore = new Date("2026-01-01T00:00:00Z");
  const notAfter = new Date("2027-01-01T00:00:00Z");
  const cert = selfSignedCertificate({ commonName: "SN-DEV-000123", notBefore, notAfter, keypair });

  it("builds a certificate Node itself can parse (self-check on the fixture)", () => {
    const parsed = new X509Certificate(cert.pem);
    expect(parsed.subject).toContain("SN-DEV-000123");
  });

  it("reads notAfter out of the certificate", () => {
    expect(certificateExpiry(cert.pem).toISOString()).toBe(notAfter.toISOString());
  });

  it("flags a certificate inside the renewal window, and one already expired", () => {
    const wellBefore = new Date("2026-06-01T00:00:00Z");
    expect(isCertificateExpiring(cert.pem, 30, wellBefore)).toBe(false);
    expect(isCertificateExpiring(cert.pem, 30, new Date(notAfter.getTime() - 10 * DAY_MS))).toBe(
      true,
    );
    // Already expired is the loudest renewal case, not a quiet false.
    expect(isCertificateExpiring(cert.pem, 30, new Date(notAfter.getTime() + DAY_MS))).toBe(true);
  });

  it("describes health for the console", () => {
    const health = describeCertificate(cert.pem, {
      warnDays: 30,
      now: new Date(notAfter.getTime() - 45 * DAY_MS),
    });
    expect(health.subject).toContain("SN-DEV-000123");
    expect(health.validFrom.toISOString()).toBe(notBefore.toISOString());
    expect(health.validTo.toISOString()).toBe(notAfter.toISOString());
    expect(health.daysRemaining).toBe(45);
    expect(health.expired).toBe(false);
    expect(health.expiring).toBe(false);

    const expired = describeCertificate(cert.pem, {
      now: new Date(notAfter.getTime() + 5 * DAY_MS),
    });
    expect(expired.expired).toBe(true);
    expect(expired.expiring).toBe(true);
    expect(expired.daysRemaining).toBeLessThan(0);
  });

  it("normalises a bare base64 DER certificate into PEM", () => {
    const base64 = cert.der.toString("base64");
    const normalised = normaliseCertificatePem(base64);
    expect(normalised).toMatch(/^-----BEGIN CERTIFICATE-----\n/);
    expect(new X509Certificate(normalised).subject).toContain("SN-DEV-000123");
    // Already-PEM input is returned unchanged apart from trailing whitespace.
    expect(normaliseCertificatePem(cert.pem)).toBe(cert.pem);
    expect(() => normaliseCertificatePem("  ")).toThrow(/Empty certificate/);
    expect(() => normaliseCertificatePem("not a certificate!")).toThrow(/PEM nor base64/);
  });

  it("bundles cert and key in the shape the connector's https agent reads", () => {
    const bundle = JSON.parse(
      buildCertificateBundle({ certificatePem: cert.pem, privateKeyPem: keypair.privateKeyPem }),
    );
    expect(Object.keys(bundle).sort()).toEqual(["cert", "key"]);
    expect(bundle.cert).toBe(cert.pem);
    expect(bundle.key).toBe(keypair.privateKeyPem);
    expect(new X509Certificate(bundle.cert).subject).toContain("SN-DEV-000123");
  });

  it("resolves the provider certificate through both ref forms", () => {
    expect(providerCertificatePem(fakeProvider({ certificateRef: null }))).toBeNull();
    expect(providerCertificatePem(fakeProvider({ certificateRef: cert.pem }))).toBe(cert.pem);

    const bundle = buildCertificateBundle({
      certificatePem: cert.pem,
      privateKeyPem: keypair.privateKeyPem,
    });
    expect(providerCertificatePem(fakeProvider({ certificateRef: bundle }))).toBe(cert.pem);

    process.env.FDMS_TEST_CERT_REF = bundle;
    try {
      expect(
        providerCertificatePem(fakeProvider({ certificateRef: "env:FDMS_TEST_CERT_REF" })),
      ).toBe(cert.pem);
    } finally {
      delete process.env.FDMS_TEST_CERT_REF;
    }
  });
});

// --- device endpoints -------------------------------------------------------

describe("registerDevice", () => {
  const csr = buildCertificateSigningRequest({ commonName: "SN-DEV-000123", keypair });
  const issued = selfSignedCertificate({
    commonName: "SN-DEV-000123",
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2027-01-01T00:00:00Z"),
    keypair,
  });

  function register(transport: FdmsDeviceTransport, provider = fakeProvider()) {
    return registerDevice(
      {
        provider,
        activationKey: "AAAA-BBBB-CCCC",
        certificateRequestPem: csr,
        deviceModelName: "Corelith",
        deviceModelVersion: "1.0",
      },
      transport,
    );
  }

  it("posts the CSR to the device registration path and returns the certificate", async () => {
    const { transport, issueCalls } = fakeTransport({
      issue: { operationID: "op-1", certificate: issued.der.toString("base64") },
    });

    const result = await register(transport);

    expect(result.status).toBe("SUCCESS");
    expect(result.operationId).toBe("op-1");
    expect(result.data?.certificatePem).toMatch(/^-----BEGIN CERTIFICATE-----\n/);
    expect(new X509Certificate(result.data!.certificatePem).subject).toContain("SN-DEV-000123");

    const [call] = issueCalls;
    const metadata = JSON.parse(call.provider.metadataJson ?? "{}");
    expect(metadata.issuePath).toBe("/Device/v1/12345/RegisterDevice");
    // The connector merges its own `deviceId` into every POST body; FDGA
    // carries the device id in the path, so the derived provider nulls it and
    // JSON.stringify drops the key.
    expect(call.provider.deviceId).toBeNull();
    expect(call.payload.payload).toEqual({
      certificateRequest: csr,
      activationKey: "AAAA-BBBB-CCCC",
      deviceModelName: "Corelith",
      deviceModelVersion: "1.0",
    });
  });

  it("keys registration on the device, so a retry cannot burn a second activation key", async () => {
    const response = { operationID: "op-1", certificate: issued.pem };
    const { transport, issueCalls } = fakeTransport({ issue: response });
    await register(transport);
    await register(transport);
    expect(issueCalls.map((call) => call.payload.idempotencyKey)).toEqual([
      "company-1:device-register:12345",
      "company-1:device-register:12345",
    ]);
  });

  it("keeps unrelated provider metadata intact and honours a custom path prefix", async () => {
    const { transport, issueCalls } = fakeTransport({
      issue: { certificate: issued.pem },
    });
    await register(
      transport,
      fakeProvider({
        metadataJson: JSON.stringify({ issuePath: "/receipts", devicePathPrefix: "/Device/v2/" }),
      }),
    );
    const metadata = JSON.parse(issueCalls[0].provider.metadataJson ?? "{}");
    expect(metadata.issuePath).toBe("/Device/v2/12345/RegisterDevice");
    expect(metadata.devicePathPrefix).toBe("/Device/v2/");
  });

  it("treats a 200 with no certificate as a failure", async () => {
    const { transport } = fakeTransport({ issue: { operationID: "op-2" } });
    const result = await register(transport);
    expect(result.status).toBe("FAILED");
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/no device certificate/i);
  });

  it("passes a connector failure through with its retry schedule", async () => {
    const nextRetryAt = new Date("2026-08-18T12:05:00Z");
    const transport: FdmsDeviceTransport = {
      issue: async () => ({
        status: "FAILED",
        rawResponseJson: JSON.stringify({ errorCode: "DEV02" }),
        error: "FDMS request failed with status code 422",
        nextRetryAt,
      }),
      sync: async () => ({ status: "SUCCESS", rawResponseJson: "{}" }),
    };
    const result = await register(transport);
    expect(result.status).toBe("FAILED");
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/422/);
    expect(result.nextRetryAt).toEqual(nextRetryAt);
    expect(result.rawResponseJson).toContain("DEV02");
  });

  it("refuses to call FDGA without a device id, activation key or CSR", async () => {
    const { transport } = fakeTransport();
    await expect(
      register(transport, fakeProvider({ deviceId: null })),
    ).rejects.toThrow(/device id/i);
    await expect(
      registerDevice(
        {
          provider: fakeProvider(),
          activationKey: "",
          certificateRequestPem: csr,
          deviceModelName: "Corelith",
          deviceModelVersion: "1.0",
        },
        transport,
      ),
    ).rejects.toThrow(/activation key/i);
    await expect(
      registerDevice(
        {
          provider: fakeProvider(),
          activationKey: "AAAA",
          certificateRequestPem: "not-a-csr",
          deviceModelName: "Corelith",
          deviceModelVersion: "1.0",
        },
        transport,
      ),
    ).rejects.toThrow(/certificate signing request/i);
  });
});

describe("verifyTaxpayerInformation", () => {
  it("reads the taxpayer back before the activation key is spent", async () => {
    const { transport, issueCalls } = fakeTransport({
      issue: {
        operationID: "op-9",
        taxPayerName: "Huchu Mine (Pvt) Ltd",
        taxPayerTIN: "1234567890",
        vatNumber: "220123456",
        deviceBranchName: "Head Office",
      },
    });

    const result = await verifyTaxpayerInformation(
      {
        provider: fakeProvider(),
        activationKey: "AAAA-BBBB-CCCC",
        deviceSerialNo: "SN-DEV-000123",
      },
      transport,
    );

    expect(result.status).toBe("SUCCESS");
    expect(result.data?.taxPayerName).toBe("Huchu Mine (Pvt) Ltd");
    expect(result.data?.taxPayerTIN).toBe("1234567890");
    expect(JSON.parse(issueCalls[0].provider.metadataJson ?? "{}").issuePath).toBe(
      "/Device/v1/12345/VerifyTaxpayerInformation",
    );
  });
});

describe("getDeviceConfig", () => {
  it("extracts the fields the rest of the FDMS workstream depends on", async () => {
    const { transport, syncCalls } = fakeTransport({
      sync: {
        operationID: "op-3",
        taxPayerName: "Huchu Mine (Pvt) Ltd",
        taxPayerTIN: "1234567890",
        vatNumber: "220123456",
        deviceSerialNo: "SN-DEV-000123",
        deviceBranchName: "Head Office",
        deviceOperatingMode: "Online",
        taxPayerDayMaxHrs: 24,
        qrUrl: "https://fdms.zimra.co.zw",
        certificateValidTill: "2027-01-01T00:00:00Z",
        applicableTaxes: [
          { taxID: 1, taxPercent: 0, taxName: "Zero rate 0%", validFrom: "2023-01-01" },
          { taxID: 3, taxPercent: 15, taxName: "Standard rated 15%", validFrom: "2023-01-01" },
          { taxID: 2, taxName: "Exempt", validFrom: "2023-01-01" },
        ],
      },
    });

    const result = await getDeviceConfig({ provider: fakeProvider() }, transport);

    expect(result.status).toBe("SUCCESS");
    expect(result.operationId).toBe("op-3");
    expect(result.data?.qrUrl).toBe("https://fdms.zimra.co.zw");
    expect(result.data?.taxPayerDayMaxHrs).toBe(24);
    expect(result.data?.certificateValidTill?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(result.data?.applicableTaxes.map((tax) => [tax.taxID, tax.taxPercent])).toEqual([
      [1, 0],
      [3, 15],
      // An exempt line has no percent at all; a 0 here would silently invent
      // a zero-rated supply when FD-0.2 maps tax codes.
      [2, null],
    ]);

    const metadata = JSON.parse(syncCalls[0].provider.metadataJson ?? "{}");
    expect(metadata.syncPathTemplate).toBe("/Device/v1/12345/GetConfig");
    expect(syncCalls[0].providerReference).toBe("12345");
  });

  it("returns no data when the call did not succeed", async () => {
    const transport: FdmsDeviceTransport = {
      issue: async () => ({ status: "SUCCESS", rawResponseJson: "{}" }),
      sync: async () => ({
        status: "FAILED",
        rawResponseJson: "<html>gateway timeout</html>",
        error: "FDMS request failed with status code 504",
      }),
    };
    const result = await getDeviceConfig({ provider: fakeProvider() }, transport);
    expect(result.status).toBe("FAILED");
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/504/);
  });
});

describe("getDeviceStatus", () => {
  it("surfaces the counters the receipt chain is reconciled against", async () => {
    const { transport, syncCalls } = fakeTransport({
      sync: {
        operationID: "op-4",
        fiscalDayStatus: "FiscalDayOpened",
        fiscalDayReconciliationMode: "Auto",
        lastFiscalDayNo: 7,
        lastReceiptGlobalNo: 1042,
        fiscalDayServerSignature: { hash: "abc", signature: "def" },
      },
    });

    const result = await getDeviceStatus({ provider: fakeProvider(), deviceId: "99" }, transport);

    expect(result.data?.fiscalDayStatus).toBe("FiscalDayOpened");
    expect(result.data?.lastFiscalDayNo).toBe(7);
    expect(result.data?.lastReceiptGlobalNo).toBe(1042);
    expect(result.data?.fiscalDayServerSignature).toEqual({ hash: "abc", signature: "def" });
    expect(JSON.parse(syncCalls[0].provider.metadataJson ?? "{}").syncPathTemplate).toBe(
      "/Device/v1/99/GetStatus",
    );
  });

  it("reports a zero global number rather than losing it to a falsy check", async () => {
    // A freshly registered device legitimately reports 0; treating that as
    // "unknown" would let the first receipt reuse a global number.
    const { transport } = fakeTransport({
      sync: { fiscalDayStatus: "FiscalDayClosed", lastFiscalDayNo: 0, lastReceiptGlobalNo: 0 },
    });
    const result = await getDeviceStatus({ provider: fakeProvider() }, transport);
    expect(result.data?.lastReceiptGlobalNo).toBe(0);
    expect(result.data?.lastFiscalDayNo).toBe(0);
  });
});
