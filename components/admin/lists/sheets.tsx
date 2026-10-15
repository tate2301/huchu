"use client";

import type { ComponentType } from "react";

import type { AdminSheetProps } from "./admin-list";
import { ExtendTrialSheet } from "./extend-trial-sheet";
import { AddVerticalSheet, CatalogueBundleSheet, CatalogueFeatureSheet, RemoveVerticalSheet } from "./features/sheets";
import { LibraryPublishSheet } from "./library/publish-sheet";
import { ChangeOperatorRoleSheet, InviteOperatorSheet, NewInviteSheet } from "./operators/operator-sheets";
import { AddSiteSheet, EditSiteSheet } from "./sites/site-sheet";
import { AddMembersSheet, ChangeRoleSheet, EditMemberSheet, SignInAsSheet } from "./members/sheets";

/** The sheets admin list actions open, by `?sheet=`. */
export const ADMIN_SHEETS: Record<string, ComponentType<AdminSheetProps>> = {
  "extend-trial": ExtendTrialSheet,
  "add-members": AddMembersSheet,
  "change-role": ChangeRoleSheet,
  "edit-member": EditMemberSheet,
  "sign-in-as": SignInAsSheet,
  "add-vertical": AddVerticalSheet,
  "remove-vertical": RemoveVerticalSheet,
  "catalogue-bundle": CatalogueBundleSheet,
  "catalogue-feature": CatalogueFeatureSheet,
  "site-add": AddSiteSheet,
  "site-edit": EditSiteSheet,
  "operator-invite": InviteOperatorSheet,
  "operator-new-invite": NewInviteSheet,
  "operator-role": ChangeOperatorRoleSheet,
  "library-publish": LibraryPublishSheet,
};
