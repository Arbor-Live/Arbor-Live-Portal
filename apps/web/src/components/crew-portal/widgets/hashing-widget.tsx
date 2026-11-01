"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { BroomIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDateTime, plural } from "@/lib/format";
import { HASHING_BASE_PATH } from "@/lib/hashing-tabs";

export function HashingWidget() {
  const [now] = useState(() => Date.now());
  const prompt = useQuery(api.hashing.getMyPrompt, { now });

  // Hidden unless the viewer has something to do: the query returns null.
  if (!prompt) return null;

  return (
    <DashboardWidget
      icon={BroomIcon}
      title="Hashing"
      link={{ href: HASHING_BASE_PATH, label: "Open" }}
      testId="home-hashing"
      summary={`${prompt.quarterLabel} · one hash this quarter`}
    >
      <WidgetRows loading={false} empty={null}>
        {prompt.toConfirm.map((row) => (
          <ListRow key={row.startsAt} href={HASHING_BASE_PATH}>
            <RowText title={`Confirm ${formatDateTime(row.startsAt)}`} detail="Your hash moved." />
          </ListRow>
        ))}
        {prompt.toAnswer > 0 ? (
          <ListRow href={HASHING_BASE_PATH}>
            <RowText title={`${plural(prompt.toAnswer, "date")} to answer`} />
          </ListRow>
        ) : null}
      </WidgetRows>
    </DashboardWidget>
  );
}
