"use client";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { IdentitySettingsContent } from "@corelithzw/module-campus/components/academics/identity-settings-content";
import { SchoolCustomFieldsPanel } from "@corelithzw/module-campus/components/academics/school-custom-fields-panel";

/**
 * School records — how pupils are numbered, what their ID card says, and the
 * extra fields every record carries.
 *
 * The numbering and the custom fields sit together because they answer the
 * same question from two directions: what this school's record of a person
 * looks like.
 */
export default function SchoolsIdentityMasterDataPage() {
  return (
    <MasterDataShell
      activeTab="schools-identity"
      title="School Records"
      description="Admission numbering, and the extra fields every pupil and guardian record carries."
    >
      <div className="space-y-4">
        <IdentitySettingsContent />
        <SchoolCustomFieldsPanel />
      </div>
    </MasterDataShell>
  );
}
