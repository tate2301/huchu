import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SIGNUP_STEPS, SignupFrame } from "@/components/signup/signup-frame";
import { SignupWorkspaceForm } from "@/components/signup/signup-workspace-form";
import { getSelfServeProductBySlug } from "@/lib/platform/products";
import { suggestBusinessName } from "@/lib/signup/service";
import { readCurrentSignupRequest } from "@/lib/signup/request-cookie";

export const metadata: Metadata = { title: { absolute: "Set up your workspace" } };

export default async function SignupWorkspacePage({ params }: { params: Promise<{ product: string }> }) {
  const product = getSelfServeProductBySlug((await params).product);
  if (!product) notFound();

  const request = await readCurrentSignupRequest();
  if (!request || request.product !== product.id) redirect(`/signup/${product.slug}`);
  if (!request.verifiedAt) redirect(`/signup/${product.slug}/verify`);

  return (
    <SignupFrame
      productName={product.name}
      step={3}
      totalSteps={SIGNUP_STEPS}
      title="Set up your workspace"
      lede="You can rename it later."
    >
      <SignupWorkspaceForm
        productSlug={product.slug}
        defaultBusinessName={suggestBusinessName(request.email)}
        rootDomain={process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase() || null}
      />
    </SignupFrame>
  );
}
