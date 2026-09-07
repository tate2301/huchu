import "../themes/admin.css";

export default function AdminAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div data-portal="admin">{children}</div>;
}
