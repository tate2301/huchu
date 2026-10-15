import { redirect } from "next/navigation";

/** Settings → Activity moved to /activity, where the workspace's trail is the Workspace view. */
export default function PreferencesActivityPage() {
  redirect("/activity?view=workspace");
}
