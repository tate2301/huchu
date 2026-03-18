"use client";

import { BellRing, Palette, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-[var(--border)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--text-muted)]" />
              <CardTitle className="text-lg">Portal presentation</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary action color</Label>
              <Input id="primary-color" placeholder="e.g. #4C64D4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-copy">Support banner copy</Label>
              <Input id="support-copy" placeholder="Banner text" />
            </div>
            <Button size="sm">Save presentation settings</Button>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-[var(--text-muted)]" />
              <CardTitle className="text-lg">Operator notifications</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Notification email</Label>
              <Input id="email" type="email" placeholder="ops@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook">Webhook URL</Label>
              <Input id="webhook" type="url" placeholder="https://hooks.example.com/platform" />
            </div>
            <Button size="sm">Save notification settings</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />
            <CardTitle className="text-lg">Production safeguards</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--text-muted)]">
          <p>Raw execution stays out of primary navigation.</p>
          <p>Workspace switching stays primary.</p>
          <p>Destructive changes stay confirmed.</p>
        </CardContent>
      </Card>
    </section>
  );
}
