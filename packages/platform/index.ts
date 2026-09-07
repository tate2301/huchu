// Deep imports are the norm (`@corelithzw/platform/api-utils`); this entry
// carries what a host needs by name to compose itself.
export { registerAuthOptions, type AuthOptionsProvider } from "./auth-core/auth-options";
export { registerModules, registeredModules, unmetModuleRequirements, type ModuleManifest, type ModuleId } from "./manifest";
export { registerCapabilities, type CapabilitySet } from "./permission-catalog";
export type { AuthenticatedSession } from "./auth-core/types";
