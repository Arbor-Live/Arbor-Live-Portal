"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { RIDER_TEMPLATES } from "@arbor/rider-document";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type RiderTemplatePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When a portal admin is editing another band's riders. */
  organizationId?: string;
};

export function RiderTemplatePicker({
  open,
  onOpenChange,
  organizationId,
}: RiderTemplatePickerProps) {
  const router = useRouter();
  const createRider = useMutation(api.bandRiders.create);
  const [selectedKey, setSelectedKey] = useState("full_band");
  const [name, setName] = useState("Technical rider");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    const template = RIDER_TEMPLATES.find((entry) => entry.key === selectedKey);
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const riderId = await createRider({
        name: name.trim() || template.name,
        content: template.build(),
        ...(organizationId ? { organizationId } : {}),
      });
      onOpenChange(false);
      router.push(`/dashboard/bands-and-performers/riders/${riderId}`);
    } catch (err) {
      setError(getConvexErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New technical rider</SheetTitle>
          <SheetDescription>
            Start from a layout that matches your band, then drag to rearrange.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="rider-name">Name</Label>
            <Input
              id="rider-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Technical rider"
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label>Starter layout</Label>
            <div className="grid gap-2">
              {RIDER_TEMPLATES.map((template) => {
                const selected = template.key === selectedKey;
                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => setSelectedKey(template.key)}
                    className={cn(
                      "rounded-md border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-foreground bg-muted/50"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <div className="text-sm font-medium">{template.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {template.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void onCreate()}>
            {busy ? "Creating…" : "Create rider"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
