import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const configSchema = z.object({
  providerKey: z.string().min(1).max(50),
  apiBaseUrl: z.string().max(500).optional(),
  username: z.string().max(200).optional(),
  password: z.string().max(200).optional(),
  apiToken: z.string().max(400).optional(),
  authType: z.string().max(50).optional(),
  deviceId: z.string().max(200).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  retryPolicyJson: z.string().max(4000).optional(),
  certificateRef: z.string().max(500).optional(),
  webhookSecretRef: z.string().max(500).optional(),
  metadataJson: z.string().max(2000).optional(),
  supplier: z
    .object({
      legalName: z.string().max(200).optional(),
      tradingName: z.string().max(200).optional(),
      vatNumber: z.string().max(100).optional(),
      taxNumber: z.string().max(100).optional(),
      address: z.string().max(300).optional(),
      phone: z.string().max(100).optional(),
      email: z.string().email().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const [provider, settings] = await Promise.all([
      prisma.fiscalisationProviderConfig.findFirst({
        where: { companyId: session.user.companyId, isActive: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.accountingSettings.findUnique({
        where: { companyId: session.user.companyId },
      }),
    ]);

    return successResponse({ provider, settings });
  } catch (error) {
    console.error("[API] GET /api/accounting/fiscalisation/config error:", error);
    return errorResponse("Failed to fetch fiscalisation config");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = configSchema.parse(body);

    const provider = await prisma.fiscalisationProviderConfig.upsert({
      where: {
        companyId_providerKey: {
          companyId: session.user.companyId,
          providerKey: validated.providerKey,
        },
      },
      update: {
        apiBaseUrl: validated.apiBaseUrl,
        username: validated.username,
        password: validated.password,
        apiToken: validated.apiToken,
        authType: validated.authType,
        deviceId: validated.deviceId,
        timeoutMs: validated.timeoutMs,
        retryPolicyJson: validated.retryPolicyJson,
        certificateRef: validated.certificateRef,
        webhookSecretRef: validated.webhookSecretRef,
        metadataJson: validated.metadataJson,
        isActive: true,
      },
      create: {
        companyId: session.user.companyId,
        providerKey: validated.providerKey,
        apiBaseUrl: validated.apiBaseUrl,
        username: validated.username,
        password: validated.password,
        apiToken: validated.apiToken,
        authType: validated.authType,
        deviceId: validated.deviceId,
        timeoutMs: validated.timeoutMs,
        retryPolicyJson: validated.retryPolicyJson,
        certificateRef: validated.certificateRef,
        webhookSecretRef: validated.webhookSecretRef,
        metadataJson: validated.metadataJson,
        isActive: true,
      },
    });

    if (validated.supplier) {
      await prisma.accountingSettings.upsert({
        where: { companyId: session.user.companyId },
        update: {
          legalName: validated.supplier.legalName,
          tradingName: validated.supplier.tradingName,
          vatNumber: validated.supplier.vatNumber,
          taxNumber: validated.supplier.taxNumber,
          address: validated.supplier.address,
          phone: validated.supplier.phone,
          email: validated.supplier.email,
        },
        create: {
          companyId: session.user.companyId,
          legalName: validated.supplier.legalName,
          tradingName: validated.supplier.tradingName,
          vatNumber: validated.supplier.vatNumber,
          taxNumber: validated.supplier.taxNumber,
          address: validated.supplier.address,
          phone: validated.supplier.phone,
          email: validated.supplier.email,
        },
      });
    }

    return successResponse({ provider }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/config error:", error);
    return errorResponse("Failed to save fiscalisation config");
  }
}
