import { SettingsFrame } from "@/components/settings-frame/settings-frame";

/**
 * Setup › Shop (W-02, board CompanySettings): the business type, the liquor
 * store's features and licence, the business it trades as and its money, on
 * the SettingsFrame. The owner changes it; the manager and the bookkeeper
 * read it.
 */
export default function ShopSettingsPage() {
  return <SettingsFrame page="company" />;
}
