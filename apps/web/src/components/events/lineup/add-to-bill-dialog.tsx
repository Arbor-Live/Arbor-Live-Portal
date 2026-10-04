"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { EnvelopeSimpleIcon, MicrophoneStageIcon, PlusIcon, UserIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/inventory/searchable-select";
import { AddBandForm, InviteBandForm } from "@/components/events/lineup/lineup-forms";
import { ArtistTypesPicker } from "@/components/events/lineup/artist-types-picker";
import type { ArtistNeedActType } from "@/components/events/lineup/lineup-model";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

type Mode = "existing" | "invite" | "outside" | "open";

const MODES: Array<{ value: Mode; label: string; icon: typeof UserIcon }> = [
  { value: "existing", label: "Existing artist", icon: UserIcon },
  { value: "invite", label: "Invite by email", icon: EnvelopeSimpleIcon },
  { value: "outside", label: "Outside act", icon: MicrophoneStageIcon },
  { value: "open", label: "Open position", icon: PlusIcon },
];

/**
 * One way onto the bill: book an artist already on the platform, invite a new
 * one, name an act that isn't on the platform, or open a position to fill later.
 * Acts go into a chosen open position or get a new one at the bottom of the bill.
 */
export function AddToBillDialog({
  open,
  onOpenChange,
  eventId,
  openPositions,
  excludedOrganizationIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<"events">;
  openPositions: SearchableSelectOption[];
  excludedOrganizationIds: string[];
}) {
  const [mode, setMode] = useState<Mode>("existing");
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to bill</DialogTitle>
          <DialogDescription>
            The bill follows the show order: give an act a set in the Run of Show to place it.
          </DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(value) => value && setMode(value as Mode)}
          className="flex w-full flex-wrap"
        >
          {MODES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5">
              <Icon className="size-4" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {mode === "existing" ? (
          <AddBandForm
            embedded
            eventId={eventId}
            positionOptions={openPositions}
            excludedOrganizationIds={excludedOrganizationIds}
            onSaved={close}
            onCancel={close}
          />
        ) : mode === "invite" ? (
          <InviteWithPosition eventId={eventId} openPositions={openPositions} onDone={close} />
        ) : mode === "outside" ? (
          <OutsideActForm eventId={eventId} openPositions={openPositions} onDone={close} />
        ) : (
          <OpenPositionForm eventId={eventId} onDone={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PositionPicker({
  value,
  onChange,
  openPositions,
}: {
  value: string;
  onChange: (value: string) => void;
  openPositions: SearchableSelectOption[];
}) {
  return (
    <div className="space-y-1">
      <Label>Position</Label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={[{ value: "", label: "New position" }, ...openPositions]}
        placeholder="Position"
        emptyLabel="New position"
      />
    </div>
  );
}

function InviteWithPosition({
  eventId,
  openPositions,
  onDone,
}: {
  eventId: Id<"events">;
  openPositions: SearchableSelectOption[];
  onDone: () => void;
}) {
  const [needId, setNeedId] = useState("");
  return (
    <div className="space-y-3">
      {openPositions.length > 0 ? (
        <PositionPicker value={needId} onChange={setNeedId} openPositions={openPositions} />
      ) : null}
      <InviteBandForm
        embedded
        key={needId}
        eventId={eventId}
        needId={(needId || undefined) as Id<"eventArtistNeeds"> | undefined}
        onSaved={onDone}
        onCancel={onDone}
      />
    </div>
  );
}

function OutsideActForm({
  eventId,
  openPositions,
  onDone,
}: {
  eventId: Id<"events">;
  openPositions: SearchableSelectOption[];
  onDone: () => void;
}) {
  const upsertSlot = useMutation(api.eventArtistNeeds.upsertSlot);
  const updateSlotLineup = useMutation(api.eventArtistNeeds.updateSlotLineup);
  const [name, setName] = useState("");
  const [positionName, setPositionName] = useState("");
  const [needId, setNeedId] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSave() {
    const artist = name.trim();
    if (!artist) {
      notify.error("Name the act.");
      return;
    }
    setBusy(true);
    try {
      if (needId) {
        await updateSlotLineup({
          needId: needId as Id<"eventArtistNeeds">,
          externalArtistName: artist,
        });
      } else {
        await upsertSlot({
          eventId,
          label: positionName.trim() || undefined,
          artistTypes: [],
          status: "open",
          externalArtistName: artist,
        });
      }
      notify.success(`${artist} added to the bill.`);
      onDone();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        For acts that aren&apos;t on the platform — no payout or rider through Arbor.
      </p>
      <div className="space-y-1">
        <Label htmlFor="outside-act-name">Act</Label>
        <Input
          id="outside-act-name"
          value={name}
          placeholder="Act name"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {openPositions.length > 0 ? (
        <PositionPicker value={needId} onChange={setNeedId} openPositions={openPositions} />
      ) : null}
      {needId ? null : (
        <div className="space-y-1">
          <Label htmlFor="outside-act-position">Position name (optional)</Label>
          <Input
            id="outside-act-position"
            value={positionName}
            placeholder="e.g. Opener"
            onChange={(event) => setPositionName(event.target.value)}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => void onSave()}>
          {busy ? "Adding…" : "Add to bill"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function OpenPositionForm({ eventId, onDone }: { eventId: Id<"events">; onDone: () => void }) {
  const upsertSlot = useMutation(api.eventArtistNeeds.upsertSlot);
  const [label, setLabel] = useState("");
  const [artistTypes, setArtistTypes] = useState<ArtistNeedActType[]>([]);
  const [genres, setGenres] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true);
    try {
      await upsertSlot({
        eventId,
        label: label.trim() || undefined,
        artistTypes,
        genres: genres.trim() || undefined,
        status: "open",
      });
      notify.success("Position added.");
      onDone();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Open positions show up for artists under Opportunities, where they can ask to play.
      </p>
      <div className="space-y-1">
        <Label htmlFor="open-position-name">Position name (optional)</Label>
        <Input
          id="open-position-name"
          value={label}
          placeholder="e.g. Opener, Late set"
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="open-position-types">Looking for</Label>
        <ArtistTypesPicker id="open-position-types" value={artistTypes} onChange={setArtistTypes} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="open-position-genres">Genres / vibes</Label>
        <Input
          id="open-position-genres"
          value={genres}
          placeholder="e.g. indie, jazz, house"
          onChange={(event) => setGenres(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => void onSave()}>
          {busy ? "Adding…" : "Add position"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
