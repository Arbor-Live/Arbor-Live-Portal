"use client";

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
import { formatUsd } from "@/lib/format";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";
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
  /** Opens the time pickers on the event's day. */
  eventStartAt?: number;
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
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t px-4 py-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
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
        <Section title="Position">
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
        </Section>
      ) : null}

      {slot || performer ? (
        <Section title="Performance times">
          <PerformanceTimes
            key={`${rowSetWindow(row).join()}|${rowSoundcheckWindow(row).join()}`}
            eventId={eventId}
            set={rowSetWindow(row)}
            soundcheck={rowSoundcheckWindow(row)}
            eventStartAt={eventStartAt}
            busy={busy}
            onSave={(times) => run(() => handlers.saveTimes(row, times))}
          />
        </Section>
      ) : null}

      <Section title={actName ? "Act" : "Fill this position"}>
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
      </Section>

      {slot && slot.inquiries.length > 0 ? (
        <Section title={`Inquiries (${slot.inquiries.length})`}>
          <ul className="space-y-2">
            {slot.inquiries.map((inquiry) => (
              <li key={inquiry._id} className="flex items-start justify-between gap-3 border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {inquiry.name}
                    {inquiry.status === "dismissed" ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">Dismissed</span>
                    ) : null}
                  </p>
                  {inquiry.message ? <p className="mt-0.5 text-muted-foreground">{inquiry.message}</p> : null}
                </div>
                {inquiry.status === "submitted" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void handlers.dismissInquiry(inquiry._id)}>
                    Dismiss
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
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
  busy,
  onSave,
}: {
  eventId: Id<"events">;
  set: Window;
  soundcheck: Window;
  eventStartAt?: number;
  busy: boolean;
  onSave: (times: ActTimesPatch) => void;
}) {
  const openTo = eventStartAt != null ? toLocalDateTimeInput(eventStartAt) : undefined;
  return (
    <div className="space-y-3">
      <TimeWindowField
        label="Set"
        value={set}
        openTo={openTo}
        busy={busy}
        onChange={([setStartsAt, setEndsAt]) => onSave({ setStartsAt, setEndsAt })}
      />
      <TimeWindowField
        label="Soundcheck"
        value={soundcheck}
        openTo={openTo}
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

function TimeWindowField({
  label,
  value,
  openTo,
  busy,
  onChange,
}: {
  label: string;
  value: Window;
  openTo?: string;
  busy: boolean;
  onChange: (next: Window) => void;
}) {
  const [start, end] = value;
  // A draft while editing: picking the start before the end would otherwise be
  // thrown away (nothing saves until both ends are set and in order).
  const [draft, setDraft] = useState({
    start: start != null ? toLocalDateTimeInput(start) : "",
    end: end != null ? toLocalDateTimeInput(end) : "",
  });
  return (
    <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <DateTimeRangePicker
        startValue={draft.start}
        endValue={draft.end}
        openToDate={openTo}
        placeholder="Not set"
        onChange={(next) => {
          setDraft(next);
          const startMs = localDateTimeInputToMs(next.start);
          const endMs = localDateTimeInputToMs(next.end);
          // Save once both ends are picked and in order.
          if (startMs == null || endMs == null || endMs <= startMs) return;
          if (startMs === start && endMs === end) return;
          onChange([startMs, endMs]);
        }}
      />
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
      ) : (
        <span />
      )}
    </div>
  );
}
