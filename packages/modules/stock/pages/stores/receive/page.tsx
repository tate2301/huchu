import { redirect } from "next/navigation";

/** Receiving stock is a dialog now. See the issue route for why. */
export default function StoresReceivePage() {
  redirect("/stores/movements?record=receive");
}
