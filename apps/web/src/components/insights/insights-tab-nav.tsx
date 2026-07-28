"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type InsightsTabId = "finances" | "demand" | "crew" | "ops";

const TABS: Array<{ id: InsightsTabId; label: string }> = [
  { id: "finances", label: "Finances" },
  { id: "demand", label: "Demand" },
  { id: "crew", label: "Crew" },
  { id: "ops", label: "Ops" },
];

type InsightsTabNavProps = {
  value: InsightsTabId;
  onChange: (tab: InsightsTabId) => void;
};

export function InsightsTabNav({ value, onChange }: InsightsTabNavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          size="sm"
          variant={value === tab.id ? "default" : "outline"}
          className={cn(value === tab.id ? undefined : "bg-background")}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
