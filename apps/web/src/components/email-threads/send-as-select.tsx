"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionViewer } from "@/components/session-shell-provider";

export type SendAs = "self" | "manager";

type BookingManager = { userId: string; name: string };

/**
 * Who a client email goes out as. The choice only exists for someone covering
 * for the booking's manager, so `choice` is null (and `sendAs` stays "self")
 * for the manager themselves and for a booking with no manager yet.
 */
export function useSendAs(manager: BookingManager | null | undefined) {
  const viewerId = useSessionViewer()?.userId;
  const [picked, setPicked] = useState<SendAs>("self");
  const choice = manager?.name.trim() && viewerId && manager.userId !== viewerId ? manager : null;
  return { choice, sendAs: choice ? picked : "self", setSendAs: setPicked } as const;
}

export function SendAsSelect({
  id,
  choice,
  value,
  onChange,
}: {
  id: string;
  choice: BookingManager | null;
  value: SendAs;
  onChange: (value: SendAs) => void;
}) {
  if (!choice) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Send as</Label>
      <Select value={value} onValueChange={(next) => onChange(next as SendAs)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="self">You</SelectItem>
          <SelectItem value="manager">{choice.name} (manager)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
