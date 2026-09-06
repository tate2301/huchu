/**
 * FD-3 — the receipt signature, the hash chain and the counters.
 *
 * These tests are the specification. Everything here is deterministic and
 * offline: the keypair is generated in-process, there is no database and no
 * network, so a failure here is always a change in what we would sign and never
 * an environment. That is deliberate — the day this module's output changes
 * silently is the day every receipt after it is rejected at a customer site,
 * and the only cheap way to notice is a test that pins the exact bytes.
 *
 * The chain is the point. A receipt that hashes correctly on its own proves
 * nothing; what ZIMRA relies on is that receipt N carries receipt N-1's hash,
 * so that removing or editing a receipt in the middle of a day cannot be hidden.
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { Prisma } from "@corelithzw/db";
import {
  FiscalSigningError,
  buildReceiptCanonicalString,
  buildVerificationQrUrl,
  centsFromDecimal,
  centsFromMinorUnits,
  formatReceiptDate,
  hashReceipt,
  hashReceiptInput,
  nextCounters,
  openFiscalDayCounters,
  signReceipt,
  verifyReceiptChain,
  verifyReceiptSignature,
  type ReceiptCanonicalInput,
  type ReceiptCounters,
} from "./fdms-receipt-signing";

/** A representative fiscal invoice: $115.00 total, 15% VAT of $15.00, and one
 *  exempt line, chained onto a previous receipt. */
function baseInput(): ReceiptCanonicalInput {
  return {
    deviceId: 21234,
    receiptType: "FISCALINVOICE",
    receiptCurrency: "USD",
    receiptGlobalNo: 42,
    receiptDate: "2026-08-18",
    receiptTotal: centsFromDecimal(new Prisma.Decimal("115.00")),
    taxes: [
      { taxId: 3, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) },
      { taxId: 1, taxPercent: null, taxAmount: centsFromMinorUnits(0) },
    ],
    previousReceiptHash: "hZ2Vv0dGVzdGhhc2hwcmV2aW91c3JlY2VpcHRoYXNoMDE=",
  };
}

let keys: crypto.KeyPairKeyObjectResult;
let privateKeyPem: string;
let publicKeyPem: string;
let otherPublicKeyPem: string;

beforeAll(() => {
  keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  otherPublicKeyPem = crypto
    .generateKeyPairSync("rsa", { modulusLength: 2048 })
    .publicKey.export({ type: "spki", format: "pem" })
    .toString();
});

describe("buildReceiptCanonicalString", () => {
  it("concatenates the fields in ZIMRA's order, with money as integer cents", () => {
    // Pinned by hand, field by field, so that a refactor that changes the
    // concatenation has to change this literal too and be argued for:
    //   device 21234 | FISCALINVOICE | USD | globalNo 42 | 2026-08-18
    //   | total 11500c | taxID 1 exempt (no percent) 0c | taxID 3 "15.00" 1500c
    //   | previous hash
    expect(buildReceiptCanonicalString(baseInput())).toBe(
      "21234FISCALINVOICEUSD422026-08-18115000" +
        "15.001500" +
        "hZ2Vv0dGVzdGhhc2hwcmV2aW91c3JlY2VpcHRoYXNoMDE=",
    );
  });

  it("carries taxID only as the sort key, exactly as v7.2 does", () => {
    // Worth stating out loud because it looks like a hole: renumbering a tax
    // line's ID without changing its rate or its amount does not change what is
    // signed, since the concatenation carries percent and amount and uses the
    // ID only to order the lines. ZIMRA's own verifier re-derives the string the
    // same way, so adding the ID here would break every signature. What guards
    // the mapping is FD-0.2 (an unmapped TaxCode is refused before we get here)
    // and the fiscal day's counters, which ARE aggregated by taxID.
    const renumbered = {
      ...baseInput(),
      taxes: [
        { taxId: 9, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) },
        { taxId: 8, taxPercent: null, taxAmount: centsFromMinorUnits(0) },
      ],
    };
    expect(buildReceiptCanonicalString(renumbered)).toBe(
      buildReceiptCanonicalString(baseInput()),
    );
  });

  it("sorts tax lines by taxID regardless of the order they arrive in", () => {
    const ascending = baseInput();
    const descending = {
      ...baseInput(),
      taxes: [...baseInput().taxes].reverse(),
    };
    expect(buildReceiptCanonicalString(descending)).toBe(
      buildReceiptCanonicalString(ascending),
    );
  });

  it("signs an empty previous hash for the first receipt of a device", () => {
    const first = { ...baseInput(), previousReceiptHash: null };
    expect(buildReceiptCanonicalString(first).endsWith("15.001500")).toBe(true);
  });

  it("renders a credit note's negative total with its sign", () => {
    const canonical = buildReceiptCanonicalString({
      ...baseInput(),
      receiptType: "CREDITNOTE",
      receiptTotal: centsFromDecimal(new Prisma.Decimal("-115.00")),
    });
    expect(canonical).toContain("CREDITNOTE");
    expect(canonical).toContain("-11500");
  });

  it("dates a Date in Zimbabwe local time, not UTC", () => {
    // 23:30 UTC on the 18th is 01:30 on the 19th in Harare. Signing it as the
    // 18th would put the receipt in a fiscal day that is already closed.
    expect(formatReceiptDate(new Date("2026-08-18T23:30:00Z"))).toBe("2026-08-19");
    expect(formatReceiptDate(new Date("2026-08-18T20:30:00Z"))).toBe("2026-08-18");
    expect(
      buildReceiptCanonicalString({
        ...baseInput(),
        receiptDate: new Date("2026-08-18T23:30:00Z"),
      }),
    ).toContain("2026-08-19");
  });

  it("refuses input it would otherwise have to guess at", () => {
    expect(() =>
      buildReceiptCanonicalString({ ...baseInput(), receiptCurrency: "Dollars" }),
    ).toThrow(FiscalSigningError);
    expect(() =>
      buildReceiptCanonicalString({ ...baseInput(), receiptDate: "18/08/2026" }),
    ).toThrow(FiscalSigningError);
    expect(() =>
      buildReceiptCanonicalString({ ...baseInput(), receiptGlobalNo: 0 }),
    ).toThrow(FiscalSigningError);
    expect(() => buildReceiptCanonicalString({ ...baseInput(), taxes: [] })).toThrow(
      /at least one tax line/,
    );
    expect(() =>
      buildReceiptCanonicalString({
        ...baseInput(),
        taxes: [
          { taxId: 3, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) },
          { taxId: 3, taxPercent: 15, taxAmount: centsFromMinorUnits(200) },
        ],
      }),
    ).toThrow(/Duplicate taxId/);
    expect(() =>
      buildReceiptCanonicalString({
        ...baseInput(),
        taxes: [{ taxId: 3, taxPercent: 14.995, taxAmount: centsFromMinorUnits(1500) }],
      }),
    ).toThrow(/decimal places/);
  });
});

describe("money reaching a signature is exact", () => {
  it("takes cents from a Decimal and refuses anything finer", () => {
    expect(centsFromDecimal(new Prisma.Decimal("115.00"))).toBe(BigInt(11500));
    expect(centsFromDecimal("0.07")).toBe(BigInt(7));
    expect(centsFromDecimal(new Prisma.Decimal("-115.05"))).toBe(BigInt(-11505));
    // A third decimal place means the caller's arithmetic is wrong. Rounding it
    // here would bury that inside a signature that cannot be corrected.
    expect(() => centsFromDecimal(new Prisma.Decimal("10.505"))).toThrow(
      /finer than one cent/,
    );
  });

  it("refuses a float where cents are expected", () => {
    expect(centsFromMinorUnits(11500)).toBe(BigInt(11500));
    expect(() => centsFromMinorUnits(115.5)).toThrow(FiscalSigningError);
    // The classic: a Float total that arrived as 0.1 + 0.2 dollars.
    expect(() => centsFromMinorUnits((0.1 + 0.2) * 100)).toThrow(
      /exact number of cents/,
    );
    expect(centsFromDecimal(new Prisma.Decimal("0.1").plus("0.2"))).toBe(BigInt(30));
  });

  it("refuses a raw number smuggled past the type system", () => {
    const smuggled = { ...baseInput(), receiptTotal: 115.0 } as unknown as ReceiptCanonicalInput;
    expect(() => buildReceiptCanonicalString(smuggled)).toThrow(/must be Cents/);
  });
});

describe("hashReceipt", () => {
  it("is stable for the same input", () => {
    const first = hashReceiptInput(baseInput());
    const second = hashReceiptInput(baseInput());
    expect(first).toBe(second);
    expect(first).toBe(hashReceipt(buildReceiptCanonicalString(baseInput())));
    // base64 of a 32-byte digest.
    expect(Buffer.from(first, "base64")).toHaveLength(32);
  });

  it("changes when any signed field changes — including a single cent", () => {
    const original = hashReceiptInput(baseInput());
    const mutations: Array<[string, ReceiptCanonicalInput]> = [
      ["deviceId", { ...baseInput(), deviceId: 21235 }],
      ["receiptType", { ...baseInput(), receiptType: "DEBITNOTE" }],
      ["receiptCurrency", { ...baseInput(), receiptCurrency: "ZWG" }],
      ["receiptGlobalNo", { ...baseInput(), receiptGlobalNo: 43 }],
      ["receiptDate", { ...baseInput(), receiptDate: "2026-08-19" }],
      [
        "receiptTotal by one cent",
        { ...baseInput(), receiptTotal: centsFromMinorUnits(11501) },
      ],
      [
        "taxAmount by one cent",
        {
          ...baseInput(),
          taxes: [
            { taxId: 3, taxPercent: 15, taxAmount: centsFromMinorUnits(1501) },
            { taxId: 1, taxPercent: null, taxAmount: centsFromMinorUnits(0) },
          ],
        },
      ],
      [
        "taxPercent",
        {
          ...baseInput(),
          taxes: [
            { taxId: 3, taxPercent: 14.5, taxAmount: centsFromMinorUnits(1500) },
            { taxId: 1, taxPercent: null, taxAmount: centsFromMinorUnits(0) },
          ],
        },
      ],
      [
        "taxId (through the ordering it imposes)",
        {
          ...baseInput(),
          taxes: [
            { taxId: 0, taxPercent: 15, taxAmount: centsFromMinorUnits(1500) },
            { taxId: 1, taxPercent: null, taxAmount: centsFromMinorUnits(0) },
          ],
        },
      ],
      [
        "previousReceiptHash",
        { ...baseInput(), previousReceiptHash: "c29tZW90aGVyaGFzaHZhbHVlZm9ydGVzdGluZzAxMjM=" },
      ],
    ];

    const seen = new Set<string>([original]);
    for (const [label, mutated] of mutations) {
      const hash = hashReceiptInput(mutated);
      expect(hash, `${label} must change the hash`).not.toBe(original);
      expect(seen.has(hash), `${label} must not collide with another mutation`).toBe(
        false,
      );
      seen.add(hash);
    }
  });
});

describe("the hash chain", () => {
  /** Build receipts 1..3 the way the issuing service must: each one chains onto
   *  the hash of the one before, and the first onto nothing. */
  function buildChain() {
    const totals = [BigInt(11500), BigInt(23000), BigInt(5750)];
    const links: Array<{ input: ReceiptCanonicalInput; receiptHash: string }> = [];
    let previousReceiptHash: string | null = null;
    let counters: ReceiptCounters | null = null;

    totals.forEach((total, index) => {
      counters = nextCounters(counters);
      const input: ReceiptCanonicalInput = {
        deviceId: 21234,
        receiptType: "FISCALINVOICE",
        receiptCurrency: "USD",
        receiptGlobalNo: counters.receiptGlobalNo,
        receiptDate: "2026-08-18",
        receiptTotal: centsFromMinorUnits(total),
        taxes: [
          {
            taxId: 3,
            taxPercent: 15,
            taxAmount: centsFromMinorUnits((total * BigInt(15)) / BigInt(115)),
          },
        ],
        previousReceiptHash,
      };
      const receiptHash = hashReceiptInput(input);
      previousReceiptHash = receiptHash;
      links.push({ input, receiptHash });
      expect(counters.receiptCounter).toBe(index + 1);
    });

    return links;
  }

  it("carries each predecessor's hash and verifies end to end", () => {
    const links = buildChain();
    expect(links[0].input.previousReceiptHash).toBeNull();
    expect(links[1].input.previousReceiptHash).toBe(links[0].receiptHash);
    expect(links[2].input.previousReceiptHash).toBe(links[1].receiptHash);
    expect(verifyReceiptChain(links)).toEqual({ ok: true });
  });

  it("detects a tampered middle receipt", () => {
    const links = buildChain();
    // Somebody edits receipt 2's total after it was signed — the amount ZIMRA
    // holds a signature over and the amount in our database now differ.
    links[1] = {
      ...links[1],
      input: { ...links[1].input, receiptTotal: centsFromMinorUnits(BigInt(23001)) },
    };

    const result = verifyReceiptChain(links);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.index).toBe(1);
    expect(result.reason).toMatch(/altered after signing/);
  });

  it("detects a fork — a receipt chained onto the wrong predecessor", () => {
    const links = buildChain();
    const forked = [...links];
    forked[2] = {
      input: { ...links[2].input, previousReceiptHash: links[0].receiptHash },
      receiptHash: hashReceiptInput({
        ...links[2].input,
        previousReceiptHash: links[0].receiptHash,
      }),
    };

    const result = verifyReceiptChain(forked);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.index).toBe(2);
    expect(result.reason).toMatch(/forked/);
  });

  it("detects a gap where a receipt was removed", () => {
    const links = buildChain();
    const withHole = [links[0], links[2]];
    const result = verifyReceiptChain(withHole);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.index).toBe(1);
  });
});

describe("signReceipt", () => {
  it("verifies with the matching public key and fails with a different one", () => {
    const hash = hashReceiptInput(baseInput());
    const signature = signReceipt(hash, privateKeyPem);

    expect(verifyReceiptSignature({ hash, signature, publicKeyPem })).toBe(true);
    expect(
      verifyReceiptSignature({ hash, signature, publicKeyPem: otherPublicKeyPem }),
    ).toBe(false);
  });

  it("does not verify against a different receipt's hash", () => {
    const signature = signReceipt(hashReceiptInput(baseInput()), privateKeyPem);
    const otherHash = hashReceiptInput({ ...baseInput(), receiptGlobalNo: 43 });
    expect(
      verifyReceiptSignature({ hash: otherHash, signature, publicKeyPem }),
    ).toBe(false);
  });

  it("is an ordinary RSA-SHA256 signature over the canonical string", () => {
    // v7.2 signs the hash, but the bytes must still be verifiable by any
    // standard verifier holding the device certificate and the canonical
    // string — that is what ZIMRA and an auditor will actually do.
    const canonical = buildReceiptCanonicalString(baseInput());
    const signature = signReceipt(hashReceipt(canonical), privateKeyPem);
    expect(
      crypto
        .createVerify("RSA-SHA256")
        .update(canonical, "utf8")
        .verify(publicKeyPem, Buffer.from(signature, "base64")),
    ).toBe(true);
  });

  it("is deterministic for the same hash and key (PKCS#1 v1.5)", () => {
    const hash = hashReceiptInput(baseInput());
    expect(signReceipt(hash, privateKeyPem)).toBe(signReceipt(hash, privateKeyPem));
  });

  it("refuses a malformed hash or a non-RSA key", () => {
    expect(() => signReceipt("not-a-digest", privateKeyPem)).toThrow(
      /base64 SHA-256 digest/,
    );
    const ec = crypto
      .generateKeyPairSync("ec", { namedCurve: "P-256" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(() => signReceipt(hashReceiptInput(baseInput()), ec)).toThrow(/must be RSA/);
  });
});

describe("buildVerificationQrUrl", () => {
  it("builds the padded FDMS URL with the MD5 of the raw signature bytes", () => {
    const signature = signReceipt(hashReceiptInput(baseInput()), privateKeyPem);
    const url = buildVerificationQrUrl({
      portalBase: "https://fdms.zimra.co.zw/",
      deviceId: 21234,
      receiptDate: "2026-08-18",
      receiptGlobalNo: 42,
      signature,
    });

    const expectedCode = crypto
      .createHash("md5")
      .update(Buffer.from(signature, "base64"))
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();

    expect(url).toBe(
      `https://fdms.zimra.co.zw/0000021234180820260000000042${expectedCode}`,
    );
    expect(expectedCode).toHaveLength(16);
  });

  it("hashes the signature bytes, not its base64 text", () => {
    // Easy to get wrong and impossible to spot by eye: the URL still looks
    // plausible and simply resolves to nothing on the portal.
    const signature = signReceipt(hashReceiptInput(baseInput()), privateKeyPem);
    const wrong = crypto.createHash("md5").update(signature, "utf8").digest("hex").slice(0, 16);
    const url = buildVerificationQrUrl({
      portalBase: "https://fdms.zimra.co.zw",
      deviceId: 21234,
      receiptDate: "2026-08-18",
      receiptGlobalNo: 42,
      signature,
    });
    expect(url.toLowerCase()).not.toContain(wrong.toLowerCase());
  });

  it("changes when the receipt changes", () => {
    const args = {
      portalBase: "https://fdms.zimra.co.zw",
      deviceId: 21234,
      receiptDate: "2026-08-18",
      receiptGlobalNo: 42,
      signature: signReceipt(hashReceiptInput(baseInput()), privateKeyPem),
    };
    const other = {
      ...args,
      signature: signReceipt(
        hashReceiptInput({ ...baseInput(), receiptTotal: centsFromMinorUnits(11501) }),
        privateKeyPem,
      ),
    };
    expect(buildVerificationQrUrl(args)).not.toBe(buildVerificationQrUrl(other));
  });

  it("refuses an empty signature or portal base", () => {
    const signature = signReceipt(hashReceiptInput(baseInput()), privateKeyPem);
    expect(() =>
      buildVerificationQrUrl({
        portalBase: "",
        deviceId: 21234,
        receiptDate: "2026-08-18",
        receiptGlobalNo: 42,
        signature,
      }),
    ).toThrow(/portalBase/);
    expect(() =>
      buildVerificationQrUrl({
        portalBase: "https://fdms.zimra.co.zw",
        deviceId: 21234,
        receiptDate: "2026-08-18",
        receiptGlobalNo: 42,
        signature: "",
      }),
    ).toThrow(/signature is required/);
  });
});

describe("nextCounters", () => {
  it("starts a device at 1/1", () => {
    expect(nextCounters(null)).toEqual({ receiptCounter: 1, receiptGlobalNo: 1 });
  });

  it("is gap-free across a fiscal day boundary", () => {
    // Day 1: three receipts. Day 2 opens: the day counter resets, the device's
    // global number does not — a gap in it is what ZIMRA reads as a receipt we
    // failed to declare.
    let counters: ReceiptCounters | null = null;
    const dayOne: ReceiptCounters[] = [];
    for (let i = 0; i < 3; i += 1) {
      counters = nextCounters(counters);
      dayOne.push(counters);
    }
    expect(dayOne).toEqual([
      { receiptCounter: 1, receiptGlobalNo: 1 },
      { receiptCounter: 2, receiptGlobalNo: 2 },
      { receiptCounter: 3, receiptGlobalNo: 3 },
    ]);

    let dayTwoCounters: ReceiptCounters | null = openFiscalDayCounters(
      dayOne[dayOne.length - 1],
    );
    expect(dayTwoCounters).toEqual({ receiptCounter: 0, receiptGlobalNo: 3 });

    const dayTwo: ReceiptCounters[] = [];
    for (let i = 0; i < 2; i += 1) {
      dayTwoCounters = nextCounters(dayTwoCounters);
      dayTwo.push(dayTwoCounters);
    }
    expect(dayTwo).toEqual([
      { receiptCounter: 1, receiptGlobalNo: 4 },
      { receiptCounter: 2, receiptGlobalNo: 5 },
    ]);

    const globals = [...dayOne, ...dayTwo].map((c) => c.receiptGlobalNo);
    expect(globals).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(globals).size).toBe(globals.length);
  });

  it("opens the very first fiscal day of a device at 0/0", () => {
    expect(openFiscalDayCounters(null)).toEqual({
      receiptCounter: 0,
      receiptGlobalNo: 0,
    });
  });

  it("refuses counters that cannot have come from one device", () => {
    expect(() =>
      nextCounters({ receiptCounter: 5, receiptGlobalNo: 3 }),
    ).toThrow(/cannot exceed/);
    expect(() =>
      nextCounters({ receiptCounter: -1, receiptGlobalNo: 3 }),
    ).toThrow(FiscalSigningError);
    expect(() =>
      nextCounters({ receiptCounter: 1.5, receiptGlobalNo: 3 }),
    ).toThrow(FiscalSigningError);
  });
});
