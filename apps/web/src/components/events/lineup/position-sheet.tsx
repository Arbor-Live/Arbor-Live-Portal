"use client";

import { SheetSection } from "@/components/list-page";
import Link from "next/link";
import { useState } from "react";
import { EnvelopeSimpleIcon, MicrophoneStageIcon, UserIcon } from "@phosphor-icons/react";
import type { Id } from "@/lib/convex-api";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import {
  AddBandForm,
  EventBandPaymentForm,
  InviteBandForm,
  type InvoiceArtistSuggestion,
  type PerformerRow,
} from "@/components/events/lineup/lineup-forms";
import {
  SLOT_STATUS_OPTIONS,
  TYPE_OPTIONS,
  effectiveStatusClass,
  effectiveStatusLabel,
  rowActName,
  rowStatus,
  slotDraftsEqual,
  slotTitle,
  toSlotDraft,
  type ArtistNeedStatus,
  type ArtistNeedType,
  type ActTimesPatch,
  type BillRow,
  type RiderRow,
  type SlotDraft,
  type SlotRow,
  rowSetWindow,
  rowSoundcheckWindow,
} from "@/components/events/lineup/lineup-model";
import { dayKeyForStart, eventDayKeys, timeWindowToMs } from "@/lib/performance-times";
import { formatDate, formatUsd, pacificDateAndTimeToMs, toPacificDateTimeInput } from "@/lib/format";

import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { cn } from "@/lib/utils";

export type PositionSheetHandlers = {
  saveSlot: (slot: SlotRow, draft: SlotDraft) => Promise<unknown>;
  saveExternal: (slot: SlotRow, name: string) => Promise<unknown>;
  reopenExternal: (slot: SlotRow) => Promise<unknown>;
  removeAct: (performer: PerformerRow) => Promise<unknown>;
  /** Set/soundcheck times for the row's act, or its position when no platform act fills it. */
  saveTimes: (row: BillRow, times: ActTimesPatch) => Promise<unknown>;
  /** Cancels the act's unpaid payout (e.g. someone else pays them directly); the act stays. */
  removePayout: (performer: PerformerRow) => Promise<unknown>;
  /** Resolves true once the row is gone; false if cancelled or it failed. */
  removePosition: (row: BillRow) => Promise<boolean>;
  /** Books the inquiring artist into the position and closes the queue. */
  acceptInquiry: (inquiryId: Id<"eventArtistInquiries">) => Promise<unknown>;
  dismissInquiry: (inquiryId: Id<"eventArtistInquiries">) => Promise<unknown>;
};

/** Details for one bill row: the position, the act filling it, payout, and inquiries. */
export function PositionSheet({
  row,
  onOpenChange,
  eventId,
  canEdit,
  rider,
  excludedOrganizationIds,
  invoiceLine,
  invoiceDefaultsReady,
  handlers,
  eventStartAt,
  eventEndAt,
}: {
  row: BillRow | null;
  onOpenChange: (open: boolean) => void;
  eventId: Id<"events">;
  canEdit: boolean;
  rider?: RiderRow;
  excludedOrganizationIds: string[];
  invoiceLine: InvoiceArtistSuggestion | null;
  invoiceDefaultsReady: boolean;
  handlers: PositionSheetHandlers;
  /** The event's window: performance times are entered as times on its day(s). */
  eventStartAt?: number;
  eventEndAt?: number;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="position-sheet">
        {row ? (
          // Keyed so drafts reset when another row opens.
          <PositionSheetBody
            key={row.key}
            row={row}
            eventId={eventId}
            canEdit={canEdit}
            rider={rider}
            excludedOrganizationIds={excludedOrganizationIds}
            invoiceLine={invoiceLine}
            invoiceDefaultsReady={invoiceDefaultsReady}
            handlers={handlers}
            eventStartAt={eventStartAt}
            eventEndAt={eventEndAt}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PositionSheetBody({
  row,
  eventId,
  canEdit,
  rider,
  excludedOrganizationIds,
  invoiceLine,
  invoiceDefaultsReady,
  handlers,
  eventStartAt,
  eventEndAt,
  onClose,
}: {
  row: BillRow;
  eventId: Id<"events">;
  canEdit: boolean;
  rider?: RiderRow;
  excludedOrganizationIds: string[];
  invoiceLine: InvoiceArtistSuggestion | null;
  invoiceDefaultsReady: boolean;
  handlers: PositionSheetHandlers;
  eventStartAt?: number;
  eventEndAt?: number;
  onClose: () => void;
}) {
  const { slot, performer } = row;
  const status = rowStatus(row);
  const actName = rowActName(row);
  const isExternal = Boolean(slot?.externalArtistName.trim());
  const [busy, setBusy] = useState(false);
  const serverDraft = slot ? toSlotDraft(slot) : null;
  const [draft, setDraft] = useState<SlotDraft | null>(serverDraft);
  const slotDirty = Boolean(serverDraft && draft && !slotDraftsEqual(draft, serverDraft));
  const [externalName, setExternalName] = useState(slot?.externalArtistName ?? "");
  const [editingPayout, setEditingPayout] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const title = actName ?? (slot ? slotTitle(slot) : "Act");
  return (
    <fieldset disabled={!canEdit} className="contents">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {title}
          <span
            className={cn("rounded-md px-2 py-0.5 text-xs font-medium", effectiveStatusClass(status))}
          >
            {effectiveStatusLabel(status)}
          </span>
        </SheetTitle>
        <SheetDescription>
          {slot
            ? slot.label.trim()
              ? `Position: ${slot.label.trim()}`
              : "Unnamed position"
            : "Not in a position yet"}
          {performer?.awaitingOnboarding ? " · Onboarding pending" : ""}
        </SheetDescription>
      </SheetHeader>

      {slot && draft ? (
        <SheetSection title="Position">
          <div className="space-y-1">
            <Label htmlFor="position-name">Name</Label>
            <Input
              id="position-name"
              value={draft.label}
              placeholder="e.g. Headliner, Opener"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </div>
          {!actName ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Looking for</Label>
                <SearchableSelect
                  value={draft.artistType}
                  onChange={(value) => setDraft({ ...draft, artistType: value as ArtistNeedType })}
                  options={TYPE_OPTIONS}
                  placeholder="Select type"
                  emptyLabel="Select type"
                  clearable
                  clearLabel="Clear"
                />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <SearchableSelect
                  value={draft.status}
                  onChange={(value) => setDraft({ ...draft, status: value as ArtistNeedStatus })}
                  options={SLOT_STATUS_OPTIONS}
                  placeholder="Select status"
                  emptyLabel="Select status"
                  clearable
                  clearLabel="Clear"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="position-genres">Genres / vibes</Label>
                <Input
                  id="position-genres"
                  value={draft.genres}
                  placeholder="e.g. indie, jazz, house"
                  onChange={(event) => setDraft({ ...draft, genres: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          {slotDirty ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => handlers.saveSlot(slot, draft))}>
              Save position
            </Button>
          ) : null}
        </SheetSection>
      ) : null}

      {slot || performer ? (
        <SheetSection title="Performance times">
          <PerformanceTimes
            key={`${rowSetWindow(row).join()}|${rowSoundcheckWindow(row).join()}`}
            eventId={eventId}
            set={rowSetWindow(row)}
            soundcheck={rowSoundcheckWindow(row)}
            eventStartAt={eventStartAt}
            eventEndAt={eventEndAt}
            busy={busy}
            onSave={(times) => run(() => handlers.saveTimes(row, times))}
          />
        </SheetSection>
      ) : null}

      <SheetSection title={actName ? "Act" : "Fill this position"}>
        {performer ? (
          <PlatformAct
            performer={performer}
            rider={rider}
            eventId={eventId}
            editingPayout={editingPayout}
            onEditPayout={setEditingPayout}
            busy={busy}
            onRemovePayout={() => void run(() => handlers.removePayout(performer))}
            invoiceLine={invoiceLine}
            invoiceDefaultsReady={invoiceDefaultsReady}
          />
        ) : slot && isExternal ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="outside-act">Outside act</Label>
              <Input
                id="outside-act"
                value={externalName}
                onChange={(event) => setExternalName(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Not on the platform, so there&apos;s no payout or rider through Arbor.
            </p>
            {externalName.trim() && externalName.trim() !== slot.externalArtistName ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => handlers.saveExternal(slot, externalName.trim()))}
              >
                Save name
              </Button>
            ) : null}
          </div>
        ) : slot ? (
          <FillPosition
            slot={slot}
            eventId={eventId}
            excludedOrganizationIds={excludedOrganizationIds}
            busy={busy}
            onOutside={(name) => run(() => handlers.saveExternal(slot, name))}
          />
        ) : null}
      </SheetSection>

      {slot && slot.inquiries.length > 0 ? (
        <SheetSection title={`Inquiries (${slot.inquiries.length})`}>
          <ul className="space-y-2">
            {slot.inquiries.map((inquiry) => (
              <li key={inquiry._id} className="flex items-start justify-between gap-3 border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {inquiry.name}
                    {inquiry.status === "accepted" ? (
                      <span className="ml-2 text-xs font-normal text-status-emerald-700 dark:text-status-emerald-300">
                        Accepted
                      </span>
                    ) : inquiry.status === "dismissed" ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">Dismissed</span>
                    ) : null}
                  </p>
                  {inquiry.message ? <p className="mt-0.5 text-muted-foreground">{inquiry.message}</p> : null}
                </div>
                {inquiry.status === "submitted" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(() => handlers.acceptInquiry(inquiry._id))}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => handlers.dismissInquiry(inquiry._id))}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </SheetSection>
      ) : null}

      {canEdit ? (
        <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
          {performer && performer.payment?.status !== "paid" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => handlers.removeAct(performer))}
            >
              {slot ? "Remove act, keep position" : "Remove act"}
            </Button>
          ) : null}
          {slot && isExternal ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => handlers.reopenExternal(slot))}>
              Reopen position
            </Button>
          ) : null}
          {slot && performer?.payment?.status !== "paid" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  // Cancelling the confirm (or a failed removal) keeps the panel open.
                  if (await handlers.removePosition(row)) onClose();
                })
              }
            >
              Remove from bill
            </Button>
          ) : null}
        </SheetFooter>
      ) : null}
    </fieldset>
  );
}

function PlatformAct({
  performer,
  rider,
  eventId,
  editingPayout,
  onEditPayout,
  busy,
  onRemovePayout,
  invoiceLine,
  invoiceDefaultsReady,
}: {
  performer: PerformerRow;
  rider?: RiderRow;
  eventId: Id<"events">;
  editingPayout: boolean;
  onEditPayout: (editing: boolean) => void;
  busy: boolean;
  onRemovePayout: () => void;
  invoiceLine: InvoiceArtistSuggestion | null;
  invoiceDefaultsReady: boolean;
}) {
  const contact = rider?.contact;
  const paid = performer.payment?.status === "paid";
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Rider</dt>
        <dd>
          {rider?.rider
            ? rider.rider.status === "published"
              ? `Published · ${rider.rider.name}`
              : `Draft · ${rider.rider.name}`
            : "None yet"}
          {rider?.rider && rider.riderChosenForShow ? (
            <span className="block text-xs text-muted-foreground">Picked by the artist for this show</span>
          ) : null}
        </dd>
        {contact?.name || contact?.email || contact?.phone ? (
          <>
            <dt className="text-muted-foreground">Contact</dt>
            <dd className="space-y-0.5">
              {contact.name ? <p>{contact.name}</p> : null}
              {contact.email ? (
                <a className="text-primary hover:underline" href={`mailto:${contact.email}`}>
                  {contact.email}
                </a>
              ) : null}
              {contact.phone ? <p className="text-muted-foreground">{contact.phone}</p> : null}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Payout</dt>
        <dd>
          {performer.payment ? (
            <>
              {formatUsd(performer.payment.totalUsd)} · {performer.payment.statusLabel}
              <span className="block text-xs text-muted-foreground">
                Payment ID: {performer.payment.confirmationToken}
              </span>
            </>
          ) : (
            "No payout set"
          )}
        </dd>
      </dl>
      {paid ? null : editingPayout ? (
        <div className="border p-3">
          <EventBandPaymentForm
            embedded
            eventId={eventId}
            organizationId={performer.organizationId}
            role={performer.role}
            payment={performer.payment}
            organizationLocked
            excludedOrganizationIds={[]}
            invoiceLine={invoiceLine}
            invoiceDefaultsReady={invoiceDefaultsReady}
            onSaved={() => onEditPayout(false)}
            onCancel={() => onEditPayout(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onEditPayout(true)}>
            {performer.payment ? "Edit payout" : "Add payout"}
          </Button>
          {performer.payment ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemovePayout}>
              Remove payout
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

type FillMode = "existing" | "invite" | "outside";

function FillPosition({
  slot,
  eventId,
  excludedOrganizationIds,
  busy,
  onOutside,
}: {
  slot: SlotRow;
  eventId: Id<"events">;
  excludedOrganizationIds: string[];
  busy: boolean;
  onOutside: (name: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<FillMode>("existing");
  const [name, setName] = useState("");
  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        value={mode}
        onValueChange={(value) => value && setMode(value as FillMode)}
        className="flex w-full"
      >
        <ToggleGroupItem value="existing" className="flex-1 gap-1.5">
          <UserIcon className="size-4" />
          Book artist
        </ToggleGroupItem>
        <ToggleGroupItem value="invite" className="flex-1 gap-1.5">
          <EnvelopeSimpleIcon className="size-4" />
          Invite
        </ToggleGroupItem>
        <ToggleGroupItem value="outside" className="flex-1 gap-1.5">
          <MicrophoneStageIcon className="size-4" />
          Outside act
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === "existing" ? (
        <AddBandForm
          embedded
          hidePosition
          eventId={eventId}
          positionOptions={[]}
          defaultNeedId={slot.needId}
          excludedOrganizationIds={excludedOrganizationIds}
          onSaved={() => undefined}
          onCancel={() => undefined}
        />
      ) : mode === "invite" ? (
        <InviteBandForm
          embedded
          eventId={eventId}
          needId={slot.needId}
          onSaved={() => undefined}
          onCancel={() => setMode("existing")}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="fill-outside-act">Act name</Label>
          <Input
            id="fill-outside-act"
            value={name}
            placeholder="Act name"
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() => void onOutside(name.trim())}
          >
            Fill with this act
          </Button>
        </div>
      )}
    </div>
  );
}

type Window = [number | null, number | null];

/**
 * Set and soundcheck for the position. Saving writes the act's (or the open
 * position's) times, and the Run of Show's blocks follow.
 */
function PerformanceTimes({
  eventId,
  set,
  soundcheck,
  eventStartAt,
  eventEndAt,
  busy,
  onSave,
}: {
  eventId: Id<"events">;
  set: Window;
  soundcheck: Window;
  eventStartAt?: number;
  eventEndAt?: number;
  busy: boolean;
  onSave: (times: ActTimesPatch) => void;
}) {
  // Times only: the date comes from the event (a day picker appears on multi-day events).
  const dayKeys = eventStartAt != null ? eventDayKeys(eventStartAt, eventEndAt) : [];
  return (
    <div className="space-y-3">
      <TimeWindowField
        label="Set"
        value={set}
        dayKeys={dayKeys}
        busy={busy}
        onChange={([setStartsAt, setEndsAt]) => onSave({ setStartsAt, setEndsAt })}
      />
      <TimeWindowField
        label="Soundcheck"
        value={soundcheck}
        dayKeys={dayKeys}
        busy={busy}
        onChange={([soundcheckStartsAt, soundcheckEndsAt]) =>
          onSave({ soundcheckStartsAt, soundcheckEndsAt })
        }
      />
      <Link
        href={getEventEditorTabPath(eventId, "schedule")}
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        See it in the Run of Show
      </Link>
    </div>
  );
}

function timeOf(ms: number | null) {
  return ms != null ? toPacificDateTimeInput(ms).slice(11, 16) : "";
}

function dayLabel(dayKey: string, index: number) {
  const date = pacificDateAndTimeToMs(dayKey, "12:00");
  return `Day ${index + 1}${date != null ? ` · ${formatDate(date)}` : ""}`;
}

function TimeWindowField({
  label,
  value,
  dayKeys,
  busy,
  onChange,
}: {
  label: string;
  value: Window;
  dayKeys: string[];
  busy: boolean;
  onChange: (next: Window) => void;
}) {
  const [start, end] = value;
  // A draft while typing: nothing saves until both times are filled in.
  const [draft, setDraft] = useState({
    day: start != null ? dayKeyForStart(start, dayKeys) : "",
    start: timeOf(start),
    end: timeOf(end),
  });
  // The event can load after the panel opens (a deep link): until the user
  // picks a day, use the saved start's day or the event's first day.
  const day = draft.day || (start != null ? dayKeyForStart(start, dayKeys) : (dayKeys[0] ?? ""));
  const fieldId = `times-${label.toLowerCase()}`;

  // Saves when focus leaves the start/end pair (or the day changes), not on
  // each field: a save re-renders the section, and saving the start alone
  // would store a half-edited range.
  function commit(next: typeof draft) {
    const nextDay = next.day || day;
    if (!nextDay || !next.start || !next.end) return;
    const window = timeWindowToMs(nextDay, next.start, next.end);
    if (!window || (window[0] === start && window[1] === end)) return;
    onChange(window);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${fieldId}-start`}>{label}</Label>
        {start != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Clear ${label.toLowerCase()} time`}
            onClick={() => onChange([null, null])}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {dayKeys.length > 1 ? (
          <SearchableSelect
            value={day}
            onChange={(day) => {
              const next = { ...draft, day };
              setDraft(next);
              commit(next);
            }}
            options={dayKeys.map((key, index) => ({ value: key, label: dayLabel(key, index) }))}
            placeholder="Day"
            emptyLabel="Day"
          />
        ) : null}
        <span
          className="inline-flex items-center gap-2"
          onBlur={(event) => {
            // Moving between start and end stays inside this pair: don't save yet.
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            commit(draft);
          }}
        >
        <Input
          id={`${fieldId}-start`}
          type="time"
          step={300}
          className="w-32"
          aria-label={`${label} start`}
          value={draft.start}
          onChange={(event) => setDraft({ ...draft, start: event.target.value })}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="time"
          step={300}
          className="w-32"
          aria-label={`${label} end`}
          value={draft.end}
          onChange={(event) => setDraft({ ...draft, end: event.target.value })}
        />
        </span>
      </div>
    </div>
  );
}
