"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { QrCodeIcon } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/convex-api";
import { DashboardWidget } from "@/components/dashboard/dashboard-widget";

export function CohoGiftCardWidget() {
  const [now] = useState(() => Date.now());
  const card = useQuery(api.cohoGiftCard.getMyCohoGiftCard, { now });

  // Hidden unless the viewer is working now or soon — the query returns null.
  if (!card) return null;

  return (
    <DashboardWidget icon={QrCodeIcon} title="CoHo gift card" testId="home-coho-gift-card">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="rounded-lg border bg-white p-3">
          <QRCodeSVG value={card.cardNumber} size={168} level="M" />
        </div>
        <p className="font-mono text-sm tracking-wide">{card.cardNumber}</p>
      </div>
    </DashboardWidget>
  );
}
