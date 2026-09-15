"use client";

import { ManagementShell } from "@/components/settings/management-shell";
import { IdentitySettingsContent } from "@/components/schools/academics/identity-settings-content";
import { SchoolCustomFieldsPanel } from "@/components/schools/academics/school-custom-fields-panel";

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
    <ManagementShell
      area="master-data"
      title="School records"
      description="admission numbering, and the extra fields every pupil and guardian record carries"
    >
      <IdentitySettingsContent />
      <SchoolCustomFieldsPanel />
    </ManagementShell>
  );
}
