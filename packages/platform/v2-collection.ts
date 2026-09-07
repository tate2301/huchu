/**
 * The empty collection response a v2 endpoint returns while its resource has
 * no listing yet: the session validated, the resource named, no records.
 */
import { NextRequest, NextResponse } from "next/server";
import { successResponse, validateSession } from "./api-utils";

export type V2SuccessPayload<T> = {
  success: true;
  data: T;
};

/** A resource a v2 collection endpoint names; the modules choose the words. */
type V2CollectionResource = string;

type V2CollectionRecord = {
  id: string;
  name: string;
};

export type V2CollectionData<TResource extends V2CollectionResource> = {
  resource: TResource;
  companyId: string;
  count: number;
  records: V2CollectionRecord[];
};

export async function buildV2CollectionResponse<TResource extends V2CollectionResource>(
  request: NextRequest,
  resource: TResource,
) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) {
    return sessionResult;
  }

  const payload: V2SuccessPayload<V2CollectionData<TResource>> = {
    success: true,
    data: {
      resource,
      companyId: sessionResult.session.user.companyId,
      count: 0,
      records: [],
    },
  };

  return successResponse(payload);
}
