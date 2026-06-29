"use client";

import { useMemo } from "react";
import DatePicker from "react-datepicker";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function EventScheduleField() {
  const { watch, setValue, getFieldState } = useFormContext<BookingRequestFormValues>();
  const eventDate = watch("eventDate");
  const flexibleSetupTime = watch("flexibleSetupTime");
  const selectedDate = useMemo(() => parseDateInput(eventDate), [eventDate]);

  const dateError = getFieldState("eventDate").error?.message;
  const startError = getFieldState("eventStartTime").error?.message;
  const endError = getFieldState("eventEndTime").error?.message;
  const setupError = getFieldState("setupTime").error?.message;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Event date</Label>
        <DatePicker
          selected={selectedDate}
          onChange={(date: Date | null) => {
            if (!date) {
              setValue("eventDate", "", { shouldDirty: true, shouldValidate: true });
              return;
            }
            setValue("eventDate", toDateInput(date), { shouldDirty: true, shouldValidate: true });
          }}
          minDate={new Date()}
          dateFormat="MMMM d, yyyy"
          customInput={<Input aria-invalid={Boolean(dateError)} />}
          wrapperClassName="app-date-time-wrapper"
          popperClassName="app-date-time-popper"
          calendarClassName="app-date-time-calendar"
          showPopperArrow={false}
          autoComplete="off"
        />
        {dateError ? <p className="text-sm text-destructive">{dateError}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <TimePicker
            label="Start time"
            value={watch("eventStartTime")}
            onChange={(value) => setValue("eventStartTime", value, { shouldDirty: true, shouldValidate: true })}
          />
          {startError ? <p className="mt-1 text-sm text-destructive">{startError}</p> : null}
        </div>
        <div>
          <TimePicker
            label="End time"
            value={watch("eventEndTime")}
            onChange={(value) => setValue("eventEndTime", value, { shouldDirty: true, shouldValidate: true })}
          />
          {endError ? <p className="mt-1 text-sm text-destructive">{endError}</p> : null}
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <TimePicker
          label="Earliest setup availability"
          value={watch("setupTime") ?? ""}
          onChange={(value) => setValue("setupTime", value, { shouldDirty: true, shouldValidate: true })}
          disabled={flexibleSetupTime}
        />
        {setupError ? <p className="text-sm text-destructive">{setupError}</p> : null}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={flexibleSetupTime}
            onChange={(event) =>
              setValue("flexibleSetupTime", event.target.checked, { shouldDirty: true, shouldValidate: true })
            }
          />
          Flexible setup time
        </label>
      </div>
    </div>
  );
}
