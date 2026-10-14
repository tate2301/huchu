import { SignInAsFrame } from "@/components/sign-in-as/frame";
import { OwnerEnd } from "@/components/sign-in-as/owner-end";

export const metadata = { title: { absolute: "End Corelith support's session" } };

export default async function OwnerEndPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <SignInAsFrame title="End Corelith support's session">
      <OwnerEnd token={token ?? ""} />
    </SignInAsFrame>
  );
}
