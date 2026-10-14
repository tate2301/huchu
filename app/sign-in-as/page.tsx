import { headers } from "next/headers";

import { SignInAsEnter } from "@/components/sign-in-as/enter";
import { SignInAsFrame } from "@/components/sign-in-as/frame";
import { getProduct } from "@/lib/platform/products";
import { getHostHeaderFromRequestHeaders, resolveTenantFromHost } from "@/lib/platform/tenant";
import { prisma } from "@/lib/prisma";

export const metadata = { title: { absolute: "Signing in for Corelith support" } };

/** Where the workspace this host serves opens: its product's home. */
async function homeForHost() {
  const tenant = await resolveTenantFromHost(getHostHeaderFromRequestHeaders(await headers()));
  if (!tenant) return "/";
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId }, select: { product: true } });
  return getProduct(company?.product ?? "CORELITH").homePath;
}

export default async function SignInAsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <SignInAsFrame title="Signing in for Corelith support">
      <SignInAsEnter token={token ?? ""} next={await homeForHost()} />
    </SignInAsFrame>
  );
}
