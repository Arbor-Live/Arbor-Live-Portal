"use client";

import { memo, useCallback, useId, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimeInput } from "@/components/ui/date-time-picker";
import { api } from "@/lib/convex-api";
import {
  formatSelectedDateLabel,
  monthDateRange,
  parseDateInput,
  UNAVAILABLE_DAY_WARNING,
} from "@/lib/booking-day-load";
import { createDefaultShowSlot, endsOnNextDay } from "@/lib/event-schedule";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";
import {
  BookingAvailabilityCalendar,
  getDayLoadLevel,
} from "@/components/request/booking-availability-calendar";
import { cn } from "@/lib/utils";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
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
  const id = useId();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <TimeInput id={id} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

type ShowSlot = BookingRequestFormValues["showSlots"][number];

const ShowSlotPanel = memo(function ShowSlotPanel({
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
  slot: ShowSlot;
  isActive: boolean;
  canRemove: boolean;
  onActivate: (index: number) => void;
  onChange: (index: number, next: ShowSlot) => void;
  onRemove: (index: number) => void;
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
        <button type="button" className="text-left" onClick={() => onActivate(index)}>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{selectedDateLabel}</p>
        </button>
        {canRemove ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
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
            onChange={(startTime) => onChange(index, { ...slot, startTime })}
          />
          {errors.startTime ? (
            <p className="mt-1 text-sm text-destructive">{errors.startTime}</p>
          ) : null}
        </div>
        <div>
          <TimePicker
            label="End time"
            value={slot.endTime}
            onChange={(endTime) => onChange(index, { ...slot, endTime })}
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
});

export function EventScheduleField() {
  const { setValue, getFieldState, formState } = useFormContext<BookingRequestFormValues>();
  const showSlots =
    (useWatch({ name: "showSlots" }) as BookingRequestFormValues["showSlots"] | undefined) ?? [];
  const flexibleSetupTime = Boolean(useWatch({ name: "flexibleSetupTime" }));
  const setupTime = (useWatch({ name: "setupTime" }) as string | undefined) ?? "";
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const minDate = useMemo(() => startOfToday(), []);
  const showSlotsRef = useRef(showSlots);
  showSlotsRef.current = showSlots;

  const activeIndex = Math.min(activeSlotIndex, Math.max(showSlots.length - 1, 0));
  const activeSlot = showSlots[activeIndex] ?? showSlots[0] ?? createDefaultShowSlot();
  const visibleMonth = useMemo(() => {
    const parsed = activeSlot.date ? parseDateInput(activeSlot.date) : new Date();
    return parsed ?? new Date();
  }, [activeSlot.date]);
  const { rangeStart, rangeEnd } = useMemo(() => monthDateRange(visibleMonth), [visibleMonth]);
  const dayLoad = useQuery(api.eventRequests.getPublicBookingDayLoad, { rangeStart, rangeEnd });
  const activeDayLevel = getDayLoadLevel(dayLoad, activeSlot.date);

  const updateSlotAt = useCallback(
    (index: number, next: ShowSlot) => {
      const slots = showSlotsRef.current;
      setValue(
        "showSlots",
        slots.map((slot, slotIndex) => (slotIndex === index ? next : slot)),
        { shouldDirty: true, shouldValidate: true },
      );
    },
    [setValue],
  );

  const handleSelectDate = useCallback(
    (date: string) => {
      updateSlotAt(activeIndex, { ...activeSlot, date });
    },
    [activeIndex, activeSlot, updateSlotAt],
  );

  const setupError = getFieldState("setupTime").error?.message;
  const showSlotsError = getFieldState("showSlots").error?.message;

  const slotErrors = useMemo(
    () =>
      showSlots.map((_, index) => ({
        date: formState.errors.showSlots?.[index]?.date?.message,
        startTime: formState.errors.showSlots?.[index]?.startTime?.message,
        endTime: formState.errors.showSlots?.[index]?.endTime?.message,
      })),
    [formState.errors.showSlots, showSlots],
  );

  const highlightedDates = useMemo(
    () =>
      showSlots
        .map((slot, index) => (index === activeIndex ? null : slot.date.trim()))
        .filter((date): date is string => Boolean(date)),
    [activeIndex, showSlots],
  );

  const handleActivateSlot = useCallback((index: number) => {
    setActiveSlotIndex(index);
  }, []);

  const handleRemoveSlotAt = useCallback(
    (index: number) => {
      const slots = showSlotsRef.current;
      const next = slots.filter((_, rowIndex) => rowIndex !== index);
      setValue("showSlots", next, { shouldDirty: true, shouldValidate: true });
      setActiveSlotIndex((current) => {
        const adjusted = index < current ? current - 1 : current;
        return Math.min(adjusted, Math.max(next.length - 1, 0));
      });
    },
    [setValue],
  );

  const handleAddSlot = useCallback(() => {
    const slots = showSlotsRef.current;
    const template = slots[0] ?? createDefaultShowSlot();
    setValue(
      "showSlots",
      [
        ...slots,
        {
          date: template.date,
          startTime: template.startTime,
          endTime: template.endTime,
        },
      ],
      { shouldDirty: true, shouldValidate: true },
    );
    setActiveSlotIndex(slots.length);
  }, [setValue]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 lg:w-[340px]">
          <BookingAvailabilityCalendar
            selectedDate={activeSlot.date}
            highlightedDates={highlightedDates}
            minDate={minDate}
            onSelectDate={handleSelectDate}
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
              onActivate={handleActivateSlot}
              onChange={updateSlotAt}
              onRemove={handleRemoveSlotAt}
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

      <Button type="button" variant="outline" size="sm" onClick={handleAddSlot}>
        Add another event
      </Button>
      <p className="text-xs text-muted-foreground">
        Optional. Use this for multiple performances, matinee and evening events, or different
        dates and times.
      </p>

      <div className="space-y-3 rounded-md border p-3">
        <TimePicker
          label="Earliest setup availability"
          value={setupTime}
          onChange={(value) => setValue("setupTime", value, { shouldDirty: true, shouldValidate: true })}
          disabled={flexibleSetupTime}
        />
        {setupError ? <p className="text-sm text-destructive">{setupError}</p> : null}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={flexibleSetupTime}
            onChange={(event) => {
              setValue("flexibleSetupTime", event.target.checked, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
          />
          Flexible setup time
        </label>
      </div>
    </div>
  );
}
