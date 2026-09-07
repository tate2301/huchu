import { describe, expect, it } from "vitest";

import { COLLAB_ENTITIES, collabRecordPath } from "@corelithzw/module-crm/collaboration";

// A comment can sit on a CRM record or a school record, and a notification
// deep link has to land somewhere real for every one of them. The path comes
// from the record registry, which this host fills from every module's
// manifest — so the assertion is about the host's composition, not the CRM's.
describe("comment record paths", () => {
  it("links every record type somewhere real", () => {
    for (const entity of COLLAB_ENTITIES) {
      expect(collabRecordPath({ entity, recordId: "r-1" })).toMatch(
        /^\/(crm|schools|management\/master-data\/schools)\/[a-z/-]+\/r-1$/,
      );
    }
  });
});
