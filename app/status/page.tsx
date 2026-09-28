import { PageChrome } from "@/components/layout/page-chrome";
import { SystemStatus } from "@/components/status/system-status";

export default function StatusPage() {
  return (
    <div className="mx-auto w-full max-w-9xl space-y-6">
      <PageChrome
        title="Implementation Status"
      />
      <SystemStatus />
    </div>
  );
}
