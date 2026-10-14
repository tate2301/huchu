export type AuthRuntimeConfig = {
  nextAuthSecret: string;
  enableEmailLink: boolean;
};

let didValidateAuthConfiguration = false;

function isProductionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

export function getAuthRuntimeConfig(): AuthRuntimeConfig {
  return {
    nextAuthSecret: process.env.NEXTAUTH_SECRET?.trim() || "",
    enableEmailLink: process.env.AUTH_ENABLE_EMAIL_LINK === "true",
  };
}

export function validateAuthConfiguration(): void {
  if (didValidateAuthConfiguration) {
    return;
  }

  const config = getAuthRuntimeConfig();
  if (!config.nextAuthSecret && !isProductionBuildPhase()) {
    throw new Error("NEXTAUTH_SECRET is required.");
  }

  didValidateAuthConfiguration = true;
}
