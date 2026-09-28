import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SignupCodeForm } from "@/components/signup/signup-code-form";
import { SIGNUP_STEPS, SignupFrame } from "@/components/signup/signup-frame";
import { getSelfServeProductBySlug } from "@/lib/platform/products";
import { readCurrentSignupRequest } from "@/lib/signup/request-cookie";

export const metadata: Metadata = { title: { absolute: "Check your email" } };

export default async function SignupVerifyPage({ params }: { params: Promise<{ product: string }> }) {
  const product = getSelfServeProductBySlug((await params).product);
  if (!product) notFound();

  const request = await readCurrentSignupRequest();
  if (!request || request.product !== product.id || request.companyId) redirect(`/signup/${product.slug}`);
  if (request.verifiedAt) redirect(`/signup/${product.slug}/workspace`);

  return (
    <SignupFrame
      productName={product.name}
      step={2}
      totalSteps={SIGNUP_STEPS}
      title="Check your email"
      lede={`We sent a six-digit code to ${request.email}.`}
      footer={
        <>
          Wrong address?{" "}
          <a className="text-[var(--text-link)] underline" href={`/signup/${product.slug}`}>
            Start again
          </a>
        </>
      }
    >
      <SignupCodeForm productSlug={product.slug} />
    </SignupFrame>
  );
}
