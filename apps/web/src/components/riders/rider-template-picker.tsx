"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import {
  buildRiderFromLineup,
  channelSpan,
  emptyRiderContent,
  LINEUP_PRESETS,
  LINEUP_ROLE_ORDER,
  LINEUP_ROLES,
  lineupFromPreset,
  lineupPerformerCount,
  memberDisplayNames,
  newLineupMember,
  type LineupMember,
  type LineupMonitors,
  type LineupRole,
} from "@arbor/rider-document";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RiderSymbolGlyph } from "@/components/riders/rider-symbol-glyph";
import { StagePlotCanvas } from "@/components/riders/stage-plot-canvas";

type RiderTemplatePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When a portal admin is editing another band's riders. */
  organizationId?: string;
};

/**
 * Starting a rider from the band: add who's on stage by what they play, make
 * the few choices that change the patch (amp or DI, wired or wireless, who
 * sings, wedges or in-ears), and watch the plot, channels and mixes build
 * themselves. Common lineups fill the list in one tap.
 */
export function RiderTemplatePicker({ open, onOpenChange, organizationId }: RiderTemplatePickerProps) {
  const router = useRouter();
  const createRider = useMutation(api.bandRiders.create);
  const [name, setName] = useState("Technical rider");
  const [members, setMembers] = useState<LineupMember[]>(() => lineupFromPreset("full_band"));
  const [monitors, setMonitors] = useState<LineupMonitors>("wedges");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = useMemo(() => buildRiderFromLineup({ members, monitors }), [members, monitors]);
  const names = useMemo(() => memberDisplayNames(members), [members]);
  const channelCount = content.inputs.reduce((count, input) => count + channelSpan(input), 0);

  function update(id: string, patch: Partial<LineupMember>) {
    setMembers((current) => current.map((member) => (member.id === id ? { ...member, ...patch } : member)));
  }

  async function create(startEmpty: boolean) {
    setBusy(true);
    setError(null);
    try {
      const riderId = await createRider({
        name: name.trim() || "Technical rider",
        content: startEmpty ? emptyRiderContent() : content,
        ...(organizationId ? { organizationId } : {}),
      });
      onOpenChange(false);
      router.push(`/dashboard/artists/riders/${riderId}`);
    } catch (err) {
      setError(getConvexErrorMessage(err));
      setBusy(false);
    }
  }

  const performers = lineupPerformerCount(members);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-5xl" data-testid="rider-new-sheet">
        <SheetHeader className="border-b">
          <SheetTitle>New technical rider</SheetTitle>
          <SheetDescription>
            Tell us who&apos;s on stage. We&apos;ll lay out the stage, the input list and the monitor mixes, and
            you fine-tune from there.
          </SheetDescription>
        </SheetHeader>

        <div className="grid flex-1 gap-6 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="rider-name">Name</Label>
              <Input
                id="rider-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Technical rider"
                maxLength={80}
              />
            </div>

            <section className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Who&apos;s on stage
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {performers === 0 ? "Nobody yet" : `${performers} ${performers === 1 ? "person" : "people"}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LINEUP_PRESETS.map((preset) => (
                  <Button
                    key={preset.key}
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setMembers(lineupFromPreset(preset.key))}
                  >
                    {preset.name}
                  </Button>
                ))}
                {members.length > 0 ? (
                  <Button type="button" size="xs" variant="ghost" onClick={() => setMembers([])}>
                    Clear
                  </Button>
                ) : null}
              </div>

              {members.length === 0 ? (
                <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  Add the first person below, or pick a common lineup above.
                </p>
              ) : (
                <ul className="divide-y border" data-testid="rider-lineup">
                  {members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      displayName={names.get(member.id) ?? ""}
                      onChange={(patch) => update(member.id, patch)}
                      onRemove={() => setMembers((current) => current.filter((entry) => entry.id !== member.id))}
                    />
                  ))}
                </ul>
              )}

              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Add someone</p>
                <div className="flex flex-wrap gap-1.5">
                  {LINEUP_ROLE_ORDER.map((role) => (
                    <AddRoleButton
                      key={role}
                      role={role}
                      onAdd={() => setMembers((current) => [...current, newLineupMember(role)])}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Monitors</h3>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={monitors}
                onValueChange={(value) => {
                  if (value) setMonitors(value as LineupMonitors);
                }}
                aria-label="Monitors"
              >
                <ToggleGroupItem value="wedges">Wedges</ToggleGroupItem>
                <ToggleGroupItem value="iem">In-ears</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {monitors === "iem"
                  ? "A pack and a mix per person, named after them."
                  : "A wedge for everyone, sharing three mixes by where they stand (centre, stage right, stage left), plus one for drums. Quicker to set up, and enough for most bands."}
              </p>
            </section>
          </div>

          <div className="min-w-0 space-y-3 md:sticky md:top-4 md:self-start">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preview</h3>
            <div className="border bg-muted/25 p-2">
              <StagePlotCanvas content={content} readOnly />
            </div>
            <p className="text-sm" data-testid="rider-new-summary">
              {members.length === 0
                ? "An empty stage. Add people to see the plot build."
                : [
                    `${channelCount} channel${channelCount === 1 ? "" : "s"}`,
                    `${content.monitorMixes.length} monitor mix${content.monitorMixes.length === 1 ? "" : "es"}`,
                    content.backline.length > 0
                      ? `${content.backline.length} backline item${content.backline.length === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Everything stays editable: move gear on the stage, rename channels, add or remove anything.
            </p>
          </div>
        </div>

        {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}

        <SheetFooter className="sticky bottom-0 flex-row flex-wrap items-center justify-between border-t bg-popover">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void create(true)}>
            Start with an empty stage
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void create(false)}>
              {busy ? "Creating…" : "Create rider"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AddRoleButton({ role, onAdd }: { role: LineupRole; onAdd: () => void }) {
  const definition = LINEUP_ROLES[role];
  return (
    <button
      type="button"
      onClick={onAdd}
      title={definition.hint}
      className="inline-flex h-9 items-center gap-1.5 border bg-card pr-2.5 pl-1.5 text-xs font-medium transition-colors hover:border-foreground/30 hover:bg-muted/40"
    >
      <RiderSymbolGlyph symbolKey={definition.symbol} size={24} />
      {definition.label}
      <PlusIcon className="size-3 text-muted-foreground" aria-hidden />
    </button>
  );
}

function MemberRow({
  member,
  displayName,
  onChange,
  onRemove,
}: {
  member: LineupMember;
  displayName: string;
  onChange: (patch: Partial<LineupMember>) => void;
  onRemove: () => void;
}) {
  const definition = LINEUP_ROLES[member.role];
  const nameId = `lineup-name-${member.id}`;
  const singsId = `lineup-sings-${member.id}`;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5" data-testid="rider-lineup-member">
      <RiderSymbolGlyph symbolKey={definition.symbol} size={32} />
      <div className="min-w-0 flex-1 basis-40">
        <Label htmlFor={nameId} className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {definition.label}
        </Label>
        <Input
          id={nameId}
          value={member.name ?? ""}
          placeholder={definition.notPerformer ? displayName : "Their name (optional)"}
          className="mt-0.5 h-8"
          onChange={(event) => onChange({ name: event.target.value || undefined })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {member.role === "vocals" ? (
          <ChoiceToggle
            label="Mic"
            value={member.wireless === false ? "wired" : "wireless"}
            options={[
              ["wireless", "Wireless"],
              ["wired", "Wired"],
            ]}
            onChange={(value) => onChange({ wireless: value === "wireless" })}
          />
        ) : null}
        {member.role === "guitar" || member.role === "bass" ? (
          <ChoiceToggle
            label="Capture"
            value={member.amp ? "amp" : "di"}
            options={[
              ["amp", "Amp"],
              ["di", "DI"],
            ]}
            onChange={(value) => onChange({ amp: value === "amp" })}
          />
        ) : null}
        {definition.canSing ? (
          <div className="flex items-center gap-1.5">
            <Switch id={singsId} size="sm" checked={member.sings ?? false} onCheckedChange={(sings) => onChange({ sings })} />
            <Label htmlFor={singsId} className="text-xs font-normal">
              Sings
            </Label>
          </div>
        ) : null}
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${displayName}`} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
    </li>
  );
}

function ChoiceToggle({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
      aria-label={label}
    >
      {options.map(([optionValue, optionLabel]) => (
        <ToggleGroupItem key={optionValue} value={optionValue} className="px-2 text-xs">
          {optionLabel}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
