import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Customers (60-customers, CUS-02, W-45): everyone who shops here under their
 * name, drawn by ListFrame from the `retail-customers` source; "+ New
 * customer" opens the `customer-new` sheet.
 */
export default function RetailCustomersPage() {
  return (
    <Suspense>
      <ListFrame source="retail-customers" title="Customers" />
    </Suspense>
  );
}
