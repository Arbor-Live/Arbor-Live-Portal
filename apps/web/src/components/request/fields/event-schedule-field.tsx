"use client";

import { useCallback, useMemo } from "react";
import DatePicker from "react-datepicker";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDefaultShowSlot, endsOnNextDay } from "@/lib/event-schedule";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function TimePicker({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const selected = useMemo(() => {
    if (!value) return null;
    const date = new Date(`1970-01-01T${value}:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [value]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <DatePicker
        selected={selected}
        onChange={(date: Date | null) => {
          if (!date) {
            onChange("");
            return;
          }
          const hh = String(date.getHours()).padStart(2, "0");
          const mm = String(date.getMinutes()).padStart(2, "0");
          onChange(`${hh}:${mm}`);
        }}
        showTimeSelect
        showTimeSelectOnly
        timeIntervals={15}
        timeCaption="Time"
        dateFormat="h:mm aa"
        disabled={disabled}
        customInput={<Input disabled={disabled} />}
        wrapperClassName="app-date-time-wrapper"
        popperClassName="app-date-time-popper"
        calendarClassName="app-date-time-calendar"
        showPopperArrow={false}
        autoComplete="off"
      />
    </div>
  );
}

function ShowDatePicker({
  value,
  onChange,
  minDate,
}: {
  value: string;
  onChange: (value: string) => void;
  minDate: Date;
}) {
  const selected = useMemo(() => parseDateInput(value), [value]);

  return (
    <DatePicker
      selected={selected}
      onChange={(date: Date | null) => {
        if (!date) {
          onChange("");
          return;
        }
        onChange(toDateInput(date));
      }}
      minDate={minDate}
      dateFormat="MMMM d, yyyy"
      customInput={<Input />}
      wrapperClassName="app-date-time-wrapper"
      popperClassName="app-date-time-popper"
      calendarClassName="app-date-time-calendar"
      showPopperArrow={false}
      autoComplete="off"
    />
  );
}

function ShowSlotRow({
  index,
  slot,
  canRemove,
  onChange,
  onRemove,
  errors,
}: {
  index: number;
  slot: BookingRequestFormValues["showSlots"][number];
  canRemove: boolean;
  onChange: (next: BookingRequestFormValues["showSlots"][number]) => void;
  onRemove: () => void;
  errors: {
    date?: string;
    startTime?: string;
    endTime?: string;
  };
}) {
  const crossesMidnight = endsOnNextDay(slot.startTime, slot.endTime);
  const label = index === 0 ? "Show" : `Show ${index + 1}`;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {canRemove ? (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Date</Label>
        <ShowDatePicker
          value={slot.date}
          minDate={new Date()}
          onChange={(date) => onChange({ ...slot, date })}
        />
        {errors.date ? <p className="text-sm text-destructive">{errors.date}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <TimePicker
            label="Start time"
            value={slot.startTime}
            onChange={(startTime) => onChange({ ...slot, startTime })}
          />
          {errors.startTime ? (
            <p className="mt-1 text-sm text-destructive">{errors.startTime}</p>
          ) : null}
        </div>
        <div>
          <TimePicker
            label="End time"
            value={slot.endTime}
            onChange={(endTime) => onChange({ ...slot, endTime })}
          />
          {errors.endTime ? <p className="mt-1 text-sm text-destructive">{errors.endTime}</p> : null}
          {crossesMidnight && !errors.endTime ? (
            <p className="mt-1 text-xs text-muted-foreground">
              End time is the next calendar day (after midnight).
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EventScheduleField() {
  const { watch, setValue, getFieldState, trigger, formState } =
    useFormContext<BookingRequestFormValues>();
  const showSlots = watch("showSlots");
  const flexibleSetupTime = watch("flexibleSetupTime");

  const revalidateSchedule = useCallback(async () => {
    await trigger(["showSlots", "setupTime"]);
  }, [trigger]);

  const updateSlot = useCallback(
    (index: number, next: BookingRequestFormValues["showSlots"][number]) => {
      const updated = [...showSlots];
      updated[index] = next;
      setValue("showSlots", updated, { shouldDirty: true });
      void revalidateSchedule();
    },
    [showSlots, setValue, revalidateSchedule],
  );

  const setupError = getFieldState("setupTime").error?.message;
  const showSlotsError = getFieldState("showSlots").error?.message;

  const slotErrors = showSlots.map((_, index) => ({
    date: formState.errors.showSlots?.[index]?.date?.message,
    startTime: formState.errors.showSlots?.[index]?.startTime?.message,
    endTime: formState.errors.showSlots?.[index]?.endTime?.message,
  }));

  return (
    <div className="space-y-4">
      {showSlots.map((slot, index) => (
        <ShowSlotRow
          key={`show-slot-${index}`}
          index={index}
          slot={slot}
          canRemove={showSlots.length > 1}
          errors={slotErrors[index] ?? {}}
          onChange={(next) => updateSlot(index, next)}
          onRemove={() => {
            const next = showSlots.filter((_, rowIndex) => rowIndex !== index);
            setValue("showSlots", next, { shouldDirty: true });
            void revalidateSchedule();
          }}
        />
      ))}

      {showSlotsError ? <p className="text-sm text-destructive">{showSlotsError}</p> : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const template = showSlots[0] ?? createDefaultShowSlot();
          setValue(
            "showSlots",
            [
              ...showSlots,
              {
                date: template.date,
                startTime: template.startTime,
                endTime: template.endTime,
              },
            ],
            { shouldDirty: true },
          );
          void revalidateSchedule();
        }}
      >
        Add another show
      </Button>
      <p className="text-xs text-muted-foreground">
        Optional. Use this for multiple performances, matinee and evening shows, or different
        dates and times.
      </p>

      <div className="space-y-3 rounded-md border p-3">
        <TimePicker
          label="Earliest setup availability"
          value={watch("setupTime") ?? ""}
          onChange={(value) => {
            setValue("setupTime", value, { shouldDirty: true });
            void revalidateSchedule();
          }}
          disabled={flexibleSetupTime}
        />
        {setupError ? <p className="text-sm text-destructive">{setupError}</p> : null}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={flexibleSetupTime}
            onChange={(event) => {
              setValue("flexibleSetupTime", event.target.checked, { shouldDirty: true });
              void revalidateSchedule();
            }}
          />
          Flexible setup time
        </label>
      </div>
    </div>
  );
}
