import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Huchu | Operations and finance platform",
    template: "%s | Huchu",
  },
  description:
    "Huchu is a multi-tenant operations and finance platform for mines, schools, retailers, dealerships, recyclers, and multi-site businesses.",
  openGraph: {
    title: "Huchu | Operations and finance platform",
    description:
      "Run sector-specific workflows on shared accounting, reporting, branding, and administration rails instead of stitching together separate systems.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Huchu | Operations and finance platform",
    description:
      "One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.",
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
