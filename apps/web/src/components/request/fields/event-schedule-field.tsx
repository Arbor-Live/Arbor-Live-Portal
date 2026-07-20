"use client";

import { useCallback, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import { useFormContext } from "react-hook-form";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/convex-api";
import {
  formatSelectedDateLabel,
  monthDateRange,
  UNAVAILABLE_DAY_WARNING,
} from "@/lib/booking-day-load";
import { createDefaultShowSlot, endsOnNextDay } from "@/lib/event-schedule";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";
import {
  BookingAvailabilityCalendar,
  getDayLoadLevel,
} from "@/components/request/booking-availability-calendar";
import { cn } from "@/lib/utils";

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

function ShowSlotPanel({
  index,
  slot,
  isActive,
  canRemove,
  onActivate,
  onChange,
  onRemove,
  errors,
}: {
  index: number;
  slot: BookingRequestFormValues["showSlots"][number];
  isActive: boolean;
  canRemove: boolean;
  onActivate: () => void;
  onChange: (next: BookingRequestFormValues["showSlots"][number]) => void;
  onRemove: () => void;
  errors: {
    date?: string;
    startTime?: string;
    endTime?: string;
  };
}) {
  const crossesMidnight = endsOnNextDay(slot.startTime, slot.endTime);
  const label = index === 0 ? "Event" : `Event ${index + 1}`;
  const selectedDateLabel = slot.date ? formatSelectedDateLabel(slot.date) : "Select a date on the calendar";

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border p-4 transition-colors",
        isActive ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="text-left"
          onClick={onActivate}
        >
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{selectedDateLabel}</p>
        </button>
        {canRemove ? (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      {errors.date ? <p className="text-sm text-destructive">{errors.date}</p> : null}

      <div className="grid gap-4">
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
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);

  const activeIndex = Math.min(activeSlotIndex, Math.max(showSlots.length - 1, 0));
  const activeSlot = showSlots[activeIndex] ?? showSlots[0] ?? createDefaultShowSlot();
  const visibleMonth = useMemo(() => {
    const parsed = activeSlot.date ? new Date(`${activeSlot.date}T12:00:00`) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [activeSlot.date]);
  const { rangeStart, rangeEnd } = useMemo(() => monthDateRange(visibleMonth), [visibleMonth]);
  const dayLoad = useQuery(api.eventRequests.getPublicBookingDayLoad, { rangeStart, rangeEnd });
  const activeDayLevel = getDayLoadLevel(dayLoad, activeSlot.date);

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

  const highlightedDates = showSlots
    .map((slot, index) => (index === activeIndex ? null : slot.date.trim()))
    .filter((date): date is string => Boolean(date));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 lg:w-[340px]">
          <BookingAvailabilityCalendar
            selectedDate={activeSlot.date}
            highlightedDates={highlightedDates}
            minDate={new Date()}
            onSelectDate={(date) => updateSlot(activeIndex, { ...activeSlot, date })}
          />
        </div>

        <div className="booking-show-slots-scroll min-h-0 w-full flex-1 space-y-3 lg:max-h-[25.5rem] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-1">
          {showSlots.map((slot, index) => (
            <ShowSlotPanel
              key={`show-slot-${index}`}
              index={index}
              slot={slot}
              isActive={index === activeIndex}
              canRemove={showSlots.length > 1}
              errors={slotErrors[index] ?? {}}
              onActivate={() => setActiveSlotIndex(index)}
              onChange={(next) => updateSlot(index, next)}
              onRemove={() => {
                const next = showSlots.filter((_, rowIndex) => rowIndex !== index);
                setValue("showSlots", next, { shouldDirty: true });
                setActiveSlotIndex((current) => Math.min(current, Math.max(next.length - 1, 0)));
                void revalidateSchedule();
              }}
            />
          ))}
        </div>
      </div>

      {activeDayLevel === "unavailable" && activeSlot.date ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {UNAVAILABLE_DAY_WARNING}
        </p>
      ) : null}

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
          setActiveSlotIndex(showSlots.length);
          void revalidateSchedule();
        }}
      >
        Add another event
      </Button>
      <p className="text-xs text-muted-foreground">
        Optional. Use this for multiple performances, matinee and evening events, or different
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
