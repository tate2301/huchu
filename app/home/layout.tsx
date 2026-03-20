import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Avenra | Multi-site operations platform",
    template: "%s | Avenra",
  },
  description:
    "Avenra is a multi-tenant operations and finance platform for mines, schools, retailers, dealerships, recyclers, and multi-site businesses.",
  openGraph: {
    title: "Avenra | Multi-site operations platform",
    description:
      "Run sector-specific workflows on shared accounting, reporting, branding, and administration rails instead of stitching together separate systems.",
    type: "website",
    siteName: "Avenra",
  },
  twitter: {
    card: "summary_large_image",
    title: "Avenra | Multi-site operations platform",
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
