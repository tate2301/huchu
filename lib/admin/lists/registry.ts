import { auditSource, workspaceAuditSource } from "./audit";
import { catalogueBundlesSource, catalogueFeaturesSource, catalogueTemplatesSource } from "./catalogue";
import type { AdminListSource } from "./engine";
import { workspaceBundlesSource, workspaceFeaturesSource, workspaceVerticalsSource } from "./features";
import { librarySource } from "./library";
import { membersSource } from "./members";
import { operatorsSource } from "./operators";
import { paymentsSource } from "./payments";
import { peopleSource } from "./people";
import { sitesSource } from "./sites";
import { workspacesSource } from "./workspaces";

/** Every admin list, by the key its page and its API use. */
const SOURCES: AdminListSource[] = [
  workspacesSource,
  membersSource,
  peopleSource,
  workspaceVerticalsSource,
  workspaceBundlesSource,
  workspaceFeaturesSource,
  catalogueFeaturesSource,
  catalogueBundlesSource,
  catalogueTemplatesSource,
  sitesSource,
  paymentsSource,
  operatorsSource,
  auditSource,
  workspaceAuditSource,
  librarySource,
];

const BY_KEY = new Map(SOURCES.map((source) => [source.key, source]));

export function getAdminList(key: string): AdminListSource | null {
  return BY_KEY.get(key) ?? null;
}
