import { NextRequest, NextResponse } from "next/server";
import { successResponse, validateSession } from "@/lib/api-utils";

export type V2SuccessPayload<T> = {
  success: true;
  data: T;
};

type V2CollectionResource =
  | "schools"
  | "schools-boarding"
  | "schools-results"
  | "autos"
  | "pos"
  | "thrift"
  | "portal-parent"
  | "portal-student"
  | "portal-teacher";

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
