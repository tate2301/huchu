import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getFeatureMap } from "@corelithzw/platform/features";
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions";
import {
  PEOPLE_SEARCH_FEATURES,
  PEOPLE_SEARCH_RESOURCES,
  PEOPLE_SEARCH_TYPES,
  type PeopleSearchType,
} from "@corelithzw/module-people/people/search";
import { groupSearchResults, searchRecords, type SearchScope } from "@corelithzw/module-records/search";
import { canSchoolRoleDo } from "@corelithzw/module-campus/permissions";
import {
  SCHOOL_SEARCH_FEATURES,
  SCHOOL_SEARCH_RESOURCES,
  SCHOOL_SEARCH_TYPES,
  type SchoolSearchType,
} from "@corelithzw/module-campus/search";

/**
 * One search box for the whole host.
 *
 * Host composition rather than a module's route: the arms are the modules this
 * host runs, and the scope handed to the records module names exactly those.
 * Under `/api/v2/records/**` because a URL prefix carries one feature gate and
 * this endpoint serves two modules, so it is reachable by any signed-in user
 * and decides for itself what that user may search — per arm, on both axes:
 * the FEATURE says the tenant bought it, the ROLE says this person may look.
 * An arm that fails either check is not run at all, and a caller with nothing
 * to search gets an empty result rather than a 403.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();
    if (query.length < 2) return successResponse({ query, groups: [], total: 0 });

    const limitPerType = Number(searchParams.get("limit") ?? 5);
    const companyId = session.user.companyId;

    // One read of the feature map for every arm rather than `hasFeature` per
    // type. A key missing from it is one the catalogue does not have, which
    // is not enabled either.
    const features = await getFeatureMap(companyId);
    const enabled = (key: string) => features[key] === true;

    const role = session.user.role;
    const schools: SchoolSearchType[] = SCHOOL_SEARCH_TYPES.filter(
      (type) =>
        enabled(SCHOOL_SEARCH_FEATURES[type]) &&
        canSchoolRoleDo(role, SCHOOL_SEARCH_RESOURCES[type], "view"),
    );
    // `hrPermissionDenial` returns a message when refused and null when
    // allowed, the inverse of `canSchoolRoleDo` — hence the `=== null`.
    const people: PeopleSearchType[] = PEOPLE_SEARCH_TYPES.filter(
      (type) =>
        enabled(PEOPLE_SEARCH_FEATURES[type]) &&
        hrPermissionDenial(session, PEOPLE_SEARCH_RESOURCES[type], "view") === null,
    );

    const scope: SearchScope = { schools, people };

    const results = await searchRecords(prisma, {
      companyId,
      query,
      limitPerType: Number.isFinite(limitPerType) ? Math.min(Math.max(limitPerType, 1), 20) : 5,
      scope,
    });

    return successResponse({
      query,
      groups: groupSearchResults(results),
      total: results.length,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/records/search error:", error);
    return errorResponse("Search failed");
  }
}
