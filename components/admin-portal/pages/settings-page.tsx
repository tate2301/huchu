"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--text-muted)]">Keep admin portal aligned with main app conventions and branding.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>Use the same tokens as the main app. Secrets stay in .env.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="primary-color">Primary color</Label>
            <Input id="primary-color" placeholder="e.g. #2CA47C" />
            <Button size="sm" className="mt-2">Save branding</Button>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>Configure alert channels for billing, health, and catalog drift.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="ops@example.com" />
            <Label htmlFor="webhook">Webhook URL</Label>
            <Input id="webhook" type="url" placeholder="https://hooks.example.com/support" />
            <Button size="sm" className="mt-2">Save notifications</Button>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Advanced Mode</CardTitle>
            <CardDescription>Fallback tools stay out of the main operator path and live behind explicit advanced entrypoints.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--text-muted)]">
            <p>Use advanced tools only when the typed control-plane flows do not yet cover the task you need.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/advanced">Open advanced tools</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/commercial">Open Commercial Center</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
