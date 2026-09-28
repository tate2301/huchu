import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SIGNUP_STEPS, SignupFrame } from "@/components/signup/signup-frame";
import { SignupStartForm } from "@/components/signup/signup-start-form";
import { getSelfServeProductBySlug } from "@/lib/platform/products";


type Params = { params: Promise<{ product: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const product = getSelfServeProductBySlug((await params).product);
  return { title: { absolute: product ? `Start ${product.name}` : "Sign up" } };
}

export default async function SignupStartPage({ params }: Params) {
  const product = getSelfServeProductBySlug((await params).product);
  if (!product?.signup) notFound();

  return (
    <SignupFrame
      productName={product.name}
      step={1}
      totalSteps={SIGNUP_STEPS}
      title={product.signup.headline}
      lede={product.signup.lede}
      footer={
        <>
          Already have a workspace? Sign in at its address. By continuing you agree to the{" "}
          <a className="text-[var(--text-link)] underline" href="/home/terms">
            terms
          </a>
          .
        </>
      }
    >
      <SignupStartForm productSlug={product.slug} />
    </SignupFrame>
  );
}
