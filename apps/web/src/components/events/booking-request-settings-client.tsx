"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { buildUserSelectDescription } from "@/lib/user-select-description";

export function BookingRequestSettingsClient() {
  const settings = useQuery(api.eventRequests.getBookingRequestSettings, {});
  const managers = useQuery(api.invoices.listManagers, {});
  const updateSettings = useMutation(api.eventRequests.updateBookingRequestSettings);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!settings || hydrated) return;
    setSelectedIds(settings.roundRobinUserIds);
    setHydrated(true);
  }, [settings, hydrated]);

  const options: UserSelectOption[] = useMemo(
    () =>
      (managers ?? []).map((row) => ({
        value: row.id,
        label: row.name?.trim() || row.email || row.id,
        description: buildUserSelectDescription(row),
      })),
    [managers],
  );

  const selectedOptions = options.filter((option) => selectedIds.includes(option.value));

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ roundRobinUserIds: selectedIds });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/events/requests">Back to requests</Link>
      </Button>

      <div className="rounded-md border p-4 space-y-3">
        <div>
          <h2 className="font-medium">Round-robin assignees</h2>
          <p className="text-sm text-muted-foreground">
            New booking requests are assigned to the next person in this rotation. Leave empty to
            leave requests unassigned.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          {selectedOptions.map((option) => (
            <div key={option.value} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                {option.description ? (
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== option.value))}
              >
                Remove
              </Button>
            </div>
          ))}
          {selectedOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one in the rotation yet.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <UserSelect
              value={pickerValue}
              onChange={setPickerValue}
              options={options.filter((option) => !selectedIds.includes(option.value))}
              placeholder="Add person to rotation..."
              emptyLabel="No more users"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!pickerValue}
            onClick={() => {
              if (!pickerValue) return;
              setSelectedIds((ids) => [...ids, pickerValue]);
              setPickerValue("");
            }}
          >
            Add
          </Button>
        </div>

        <Button type="button" onClick={() => void handleSave()} disabled={saving || !hydrated}>
          {saving ? "Saving..." : "Save rotation"}
        </Button>
      </div>
    </div>
  );
}
