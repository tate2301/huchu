import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getFeatureMap } from "@corelithzw/platform/features";
import { hrPermissionDenial } from "@/lib/hr/permissions";
import { GOLD_SEARCH_FEATURES, GOLD_SEARCH_TYPES, type GoldSearchType } from "@/lib/gold/search";
import {
  OPERATIONS_SEARCH_FEATURES,
  OPERATIONS_SEARCH_TYPES,
  type OperationsSearchType,
} from "@/lib/operations/search";
import {
  RETAIL_SEARCH_FEATURES,
  RETAIL_SEARCH_TYPES,
  type RetailSearchType,
} from "@/lib/retail/search";
import {
  PEOPLE_SEARCH_FEATURES,
  PEOPLE_SEARCH_RESOURCES,
  PEOPLE_SEARCH_TYPES,
  type PeopleSearchType,
} from "@/lib/people/search";
import { groupSearchResults, searchRecords, type SearchScope } from "@corelithzw/module-records/search";
import { canSchoolRoleDo } from "@/lib/schools/permissions";
import {
  SCHOOL_SEARCH_FEATURES,
  SCHOOL_SEARCH_RESOURCES,
  SCHOOL_SEARCH_TYPES,
  type SchoolSearchType,
} from "@/lib/schools/search";

/**
 * One search box for the whole product.
 *
 * S-4.5. Deliberately under `/api/v2/records/**`, which is the prefix
 * `app/api/v2/records/_guard.ts` explains: a URL prefix can carry exactly one
 * feature gate, and this endpoint serves two modules, so it is reachable by any
 * signed-in user and decides for itself what that user may search.
 *
 * The decision is made per arm rather than per module, and it takes both axes:
 *
 * - the FEATURE says the tenant bought it. A school without `schools.boarding`
 *   has no hostels to find; a tenant without `crm.core` should not have deals
 *   surface in a box when every list of them is switched off.
 * - the ROLE says this person may look. Feature-enabled plus signed-in describes
 *   a class teacher as accurately as it describes the bursar.
 *
 * An arm that fails either check is not run at all, so an unentitled type cannot
 * leak through a count or an empty group. And a caller with nothing to search
 * gets an empty result rather than a 403: the box lives in the app bar on every
 * page, and one that answers with an error is worse than one that finds nothing.
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

    // One read of the feature map for every arm rather than `hasFeature`
    // per type: that helper reads the map each time, and the map is four
    // uncached queries — twenty-eight to answer one keystroke. The map is built
    // from every active `PlatformFeature`, so a key missing from it is one the
    // catalogue does not have, which is not enabled either.
    const features = await getFeatureMap(companyId);
    const enabled = (key: string) => features[key] === true;

    const role = session.user.role;
    const schools: SchoolSearchType[] = SCHOOL_SEARCH_TYPES.filter(
      (type) =>
        enabled(SCHOOL_SEARCH_FEATURES[type]) &&
        canSchoolRoleDo(role, SCHOOL_SEARCH_RESOURCES[type], "view"),
    );

    // The People arms, resolved the same two ways. `hrPermissionDenial` returns
    // a message when refused and null when allowed, which is the inverse of
    // `canSchoolRoleDo` — hence the `=== null` rather than a bare call.
    const people: PeopleSearchType[] = PEOPLE_SEARCH_TYPES.filter(
      (type) =>
        enabled(PEOPLE_SEARCH_FEATURES[type]) &&
        hrPermissionDenial(session, PEOPLE_SEARCH_RESOURCES[type], "view") === null,
    );

    // The remaining verticals resolve on the feature axis only, because that is
    // all they have: `lib/gold/**`, `lib/retail/**` and the rest ship no
    // role-resource matrix of their own — the modules gate on features and on
    // route access, and there is no `canGoldRoleDo` to consult. Inventing a
    // second, search-only permission model for them would be a rule enforced in
    // one place and nowhere else, which is worse than the honest gap. If those
    // modules grow a role matrix, these filters gain their second clause exactly
    // as the school and People ones have.
    const gold: GoldSearchType[] = GOLD_SEARCH_TYPES.filter((type) =>
      enabled(GOLD_SEARCH_FEATURES[type]),
    );
    const retail: RetailSearchType[] = RETAIL_SEARCH_TYPES.filter((type) =>
      enabled(RETAIL_SEARCH_FEATURES[type]),
    );
    const operations: OperationsSearchType[] = OPERATIONS_SEARCH_TYPES.filter((type) =>
      enabled(OPERATIONS_SEARCH_FEATURES[type]),
    );

    const scope: SearchScope = {
      crm: enabled("crm.core"),
      schools,
      people,
      gold,
      retail,
      operations,
    };

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
