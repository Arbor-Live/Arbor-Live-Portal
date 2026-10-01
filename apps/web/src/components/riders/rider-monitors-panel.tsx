"use client";

import { useState } from "react";
import { HeadphonesIcon, PlusIcon } from "@phosphor-icons/react";
import {
  blankMix,
  MONITOR_TYPE_LABELS,
  MONITOR_TYPE_OPTIONS,
  moveInArray,
  renumberMixes,
  type RiderMonitorMix,
  type RiderMonitorType,
} from "@arbor/rider-document";
import { ListRow } from "@/components/list-row";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowList,
  RowMenu,
  RowText,
  SheetSection,
} from "@/components/list-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  OptionSelect,
  RowMenuItems,
  SheetStepper,
  type RiderPanelProps,
} from "@/components/riders/rider-editor-parts";

/** Offered types, plus the stored one so a legacy side fill stays selectable. */
function typeOptions(mix: RiderMonitorMix): RiderMonitorType[] {
  const options: RiderMonitorType[] = [...MONITOR_TYPE_OPTIONS];
  return options.includes(mix.type) ? options : [...options, mix.type];
}

function mixDetail(mix: RiderMonitorMix): string {
  return [
    mix.type !== "iem" && mix.sends > 1 ? `${mix.sends} wedges` : MONITOR_TYPE_LABELS[mix.type],
    mix.notes,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RiderMonitorsPanel({ content, readOnly, onChange }: RiderPanelProps) {
  const mixes = content.monitorMixes;
  const [openId, setOpenId] = useState<string | null>(null);

  function setMixes(next: RiderMonitorMix[], historyKey?: string) {
    onChange((current) => ({ ...current, monitorMixes: next }), historyKey);
  }

  function patch(id: string, next: Partial<RiderMonitorMix>) {
    setMixes(
      mixes.map((mix) => (mix.id === id ? { ...mix, ...next } : mix)),
      `mix:${id}:${Object.keys(next).join()}`,
    );
  }

  function addMix() {
    const mix = blankMix(mixes);
    setMixes([...mixes, mix]);
    setOpenId(mix.id);
  }

  function remove(id: string) {
    setMixes(renumberMixes(mixes.filter((mix) => mix.id !== id)));
    setOpenId((current) => (current === id ? null : current));
  }

  const wedges = mixes.filter((mix) => mix.type !== "iem").length;
  const inEars = mixes.length - wedges;
  const openIndex = mixes.findIndex((mix) => mix.id === openId);
  const openMix = openIndex === -1 ? null : mixes[openIndex];

  return (
    <Card data-testid="rider-monitors-panel">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <HeadphonesIcon className="size-4 text-muted-foreground" aria-hidden />
            Monitor mixes
          </CardTitle>
          <CardDescription>
            In mix order. Each wedge or in-ear pack on the stage is its own mix.
          </CardDescription>
        </div>
        {!readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={addMix}>
            <PlusIcon />
            Add mix
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {mixes.length === 0 ? (
          <EmptyState>
            No monitor mixes yet. Drop wedges or in-ears on the stage plot to add them.
          </EmptyState>
        ) : (
          <>
            <ListSummary testId="rider-monitors-summary">
              {[
                `${mixes.length} mix${mixes.length === 1 ? "" : "es"}`,
                wedges > 0 ? `${wedges} wedge${wedges === 1 ? "" : "s"}` : null,
                inEars > 0 ? `${inEars} in-ear` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ListSummary>
            <RowList joined>
              {mixes.map((mix, index) => (
                <ListRow
                  key={mix.id}
                  data-testid="rider-mix-row"
                  leading={
                    <span className="w-9 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {mix.mixNumber}
                    </span>
                  }
                  onOpen={() => setOpenId(mix.id)}
                  actions={
                    !readOnly ? (
                      <RowMenu label={`More for mix ${mix.mixNumber}`}>
                        <RowMenuItems
                          noun="mix"
                          index={index}
                          total={mixes.length}
                          onOpen={() => setOpenId(mix.id)}
                          onMove={(to) => setMixes(renumberMixes(moveInArray(mixes, index, to)))}
                          onRemove={() => remove(mix.id)}
                        />
                      </RowMenu>
                    ) : null
                  }
                >
                  <RowText
                    title={
                      mix.label.trim() || (
                        <span className="text-muted-foreground italic">Who is this mix for?</span>
                      )
                    }
                    detail={mixDetail(mix)}
                  />
                  <RowCell hideBelow="sm" className="w-20" align="left" muted>
                    {MONITOR_TYPE_LABELS[mix.type]}
                  </RowCell>
                </ListRow>
              ))}
            </RowList>
          </>
        )}
      </CardContent>

      <DetailSheet
        open={openMix !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        testId="rider-mix-sheet"
      >
        {openMix ? (
          <MixSheetBody
            key={openMix.id}
            mix={openMix}
            index={openIndex}
            total={mixes.length}
            readOnly={readOnly}
            onPatch={(next) => patch(openMix.id, next)}
            onStep={(next) => setOpenId(mixes[next]?.id ?? null)}
            onRemove={() => remove(openMix.id)}
            onDone={() => setOpenId(null)}
          />
        ) : null}
      </DetailSheet>
    </Card>
  );
}

function MixSheetBody({
  mix,
  index,
  total,
  readOnly,
  onPatch,
  onStep,
  onRemove,
  onDone,
}: {
  mix: RiderMonitorMix;
  index: number;
  total: number;
  readOnly: boolean;
  onPatch: (next: Partial<RiderMonitorMix>) => void;
  onStep: (index: number) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <DetailSheetHeader
        title={`Mix ${mix.mixNumber}`}
        description="Changes go into the draft. Save the rider to keep them."
      />
      <SheetSection title="Mix">
        <Field id="rider-mix-label" label="For">
          <Input
            id="rider-mix-label"
            placeholder="e.g. Lead vocal"
            disabled={readOnly}
            value={mix.label}
            onChange={(event) => onPatch({ label: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rider-mix-type" label="Type">
            <OptionSelect
              id="rider-mix-type"
              value={mix.type}
              options={typeOptions(mix)}
              labels={MONITOR_TYPE_LABELS}
              disabled={readOnly}
              onChange={(type) => onPatch({ type })}
            />
          </Field>
          <Field
            id="rider-mix-sends"
            label="Wedges"
            hint={mix.type === "iem" ? "In-ears don't need wedges." : undefined}
          >
            <NumberInput
              id="rider-mix-sends"
              min={0}
              max={8}
              disabled={readOnly || mix.type === "iem"}
              value={mix.sends}
              onValueChange={(sends) => onPatch({ sends })}
            />
          </Field>
        </div>
      </SheetSection>
      <SheetSection title="Notes">
        <Label htmlFor="rider-mix-notes" className="sr-only">
          Notes
        </Label>
        <Textarea
          id="rider-mix-notes"
          rows={3}
          placeholder="What goes in this mix"
          disabled={readOnly}
          value={mix.notes ?? ""}
          onChange={(event) => onPatch({ notes: event.target.value || undefined })}
        />
      </SheetSection>
      <DetailSheetFooter
        start={
          !readOnly ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
              Remove mix
            </Button>
          ) : undefined
        }
      >
        <SheetStepper index={index} total={total} noun="mix" onStep={onStep} />
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </DetailSheetFooter>
    </>
  );
}
