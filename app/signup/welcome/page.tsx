import type { Metadata } from "next";
import { headers } from "next/headers";

import { SignupFrame } from "@/components/signup/signup-frame";
import { SignupWelcome } from "@/components/signup/signup-welcome";
import { prisma } from "@/lib/prisma";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getProduct } from "@/lib/platform/products";
import { getHostHeaderFromRequestHeaders, resolveTenantFromHost } from "@/lib/platform/tenant";

export const metadata: Metadata = { title: { absolute: "Opening your workspace" } };

/** The workspace this host serves, for its product's name; Corelith otherwise. */
async function productNameForHost() {
  const tenant = await resolveTenantFromHost(getHostHeaderFromRequestHeaders(await headers()));
  if (!tenant) return getProduct("CORELITH").name;
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId }, select: { product: true } });
  return getProduct(company?.product ?? "CORELITH").name;
}

export default async function SignupWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;

  return (
    <SignupFrame productName={await productNameForHost()} title="Your workspace is ready">
      <SignupWelcome token={token ?? ""} next={normalizeCallbackUrl(next, "/")} />
    </SignupFrame>
  );
}
