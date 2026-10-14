import { SignInAsFrame } from "@/components/sign-in-as/frame";

export const metadata = { title: { absolute: "Session ended" } };

export default function SignInAsEndedPage() {
  return (
    <SignInAsFrame title="Session ended">
      <p className="t-body text-[var(--text-body)]">
        You are out of the workspace. The session and its reason are in the workspace&apos;s audit log. You can close this tab.
      </p>
    </SignInAsFrame>
  );
}
