import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "@/lib/icons";

export default function AccessBlockedPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle>Access Blocked</CardTitle>
          <CardDescription>
            Your organization is currently restricted on this tenant host.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you think this is incorrect, contact your platform administrator to verify tenant and subscription status.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/">Retry Access</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Switch Account</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
