"use client";

import { Suspense } from "react";

import { ImportProductsPage } from "@/components/retail/products/import-page";

/** Import products (W-08, SET-11): a spreadsheet checked, fixed in place and imported. */
export default function ImportPage() {
  return (
    <Suspense>
      <ImportProductsPage />
    </Suspense>
  );
}
