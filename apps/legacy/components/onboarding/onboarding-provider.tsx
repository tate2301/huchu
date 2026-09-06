"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";

type OnboardingStatus = {
  needsOnboarding: boolean;
  companyId?: string;
  sitesCount?: number;
  departmentsCount?: number;
  reason?: string;
};

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);

  const user = session?.user as { role?: string } | undefined;
  const isEligibleRole = user?.role === "SUPERADMIN" || user?.role === "MANAGER";

  const { data: onboardingStatus } = useQuery<OnboardingStatus>({
    queryKey: ["onboarding", "status"],
    queryFn: async () => {
      const response = await fetch("/api/onboarding/status");
      if (!response.ok) {
        throw new Error("Failed to check onboarding status");
      }
      return response.json();
    },
    enabled: status === "authenticated" && isEligibleRole,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (onboardingStatus?.needsOnboarding) {
      setShowDialog(true);
    }
  }, [onboardingStatus]);

  const handleComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    setShowDialog(false);
  };

  if (status !== "authenticated" || !isEligibleRole) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <OnboardingDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onComplete={handleComplete}
      />
    </>
  );
}
