"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DotsSixVerticalIcon, PlugsConnectedIcon, PlusIcon } from "@phosphor-icons/react";
import {
  blankInput,
  captureFor,
  channelSpan,
  defaultCapture,
  inputFamilyLabel,
  insertByFamily,
  INPUT_TYPE_LABELS,
  RIDER_SOURCE_FAMILY_LABELS,
  RIDER_SOURCES,
  moveInArray,
  PROVIDED_BY_EDITOR_LABELS,
  renumberInputs,
  riderSource,
  sourceOrdinals,
  STAND_LABELS,
  type RiderInputChannel,
  type RiderSourceDefinition,
  type RiderInputType,
  type RiderStandType,
} from "@arbor/rider-document";
import { StatusPill } from "@/components/page-header";
import { ListRow } from "@/components/list-row";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowMenu,
  RowText,
  SheetSection,
} from "@/components/list-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import {
  Field,
  OptionSelect,
  PROVIDED_BY,
  RowMenuItems,
  SheetStepper,
  SwitchRow,
  type RiderPanelProps,
} from "@/components/riders/rider-editor-parts";
import { RiderSymbolGlyph } from "@/components/riders/rider-symbol-glyph";
import { cn } from "@/lib/utils";

const INPUT_TYPES = Object.keys(INPUT_TYPE_LABELS) as RiderInputType[];

/** A pick from the source catalogue, or none ("Not listed"). */
type RiderSourceSelection = {
  source?: RiderSourceDefinition;
  /** The channel's name after the pick. */
  text: string;
};

/** Every instrument in the catalogue, searchable by its other names too. */
const INSTRUMENT_OPTIONS: SearchableSelectOption[] = RIDER_SOURCES.map((source) => ({
  value: source.key,
  label: source.label,
  description: RIDER_SOURCE_FAMILY_LABELS[source.family],
  keywords: (source.aliases ?? []).join(" "),
}));

/** The instrument a channel is, for display (undefined when not listed). */
function instrumentLabel(input: RiderInputChannel): string | undefined {
  return input.sourceKey ? riderSource(input.sourceKey)?.label : undefined;
}
const STAND_TYPES = Object.keys(STAND_LABELS) as RiderStandType[];

/**
 * Picking a role rewrites the row's capture defaults too, so the band gets the
 * right Type, stand, phantom and width without touching four more fields.
 * Keeping the typed text is deliberate: the label is theirs, the key is ours.
 */
function applySourceSelection(selection: RiderSourceSelection): Partial<RiderInputChannel> {
  const { source, text } = selection;
  if (!source) return { source: text, sourceKey: undefined };
  const capture = defaultCapture(source);
  return {
    source: text,
    sourceKey: source.key,
    inputType: capture.inputType,
    stand: capture.stand,
    phantom: capture.phantom,
    stereo: source.stereo ?? false,
  };
}

/**
 * A mapped role knows how it can be picked up (a guitar is amp-or-DI, a kick is
 * always a mic), so the Type list narrows to those. Unmapped rows keep the full
 * list, since we have nothing to narrow it with.
 */
function captureOptionsFor(input: RiderInputChannel): RiderInputType[] {
  const source = input.sourceKey ? riderSource(input.sourceKey) : undefined;
  if (!source) return INPUT_TYPES;
  const options = source.captures.map((capture) => capture.inputType);
  // Keep whatever is stored selectable, so an older value never vanishes.
  return options.includes(input.inputType) ? options : [...options, input.inputType];
}

/** Changing capture carries its stand and phantom defaults with it. */
function applyCaptureChange(
  input: RiderInputChannel,
  inputType: RiderInputType,
): Partial<RiderInputChannel> {
  const source = input.sourceKey ? riderSource(input.sourceKey) : undefined;
  const capture = source ? captureFor(source, inputType) : undefined;
  if (!capture) return { inputType };
  return { inputType, stand: capture.stand, phantom: capture.phantom };
}

function channelLabel(input: RiderInputChannel): string {
  return input.stereo ? `${input.channel}–${input.channel + 1}` : String(input.channel);
}

function inputDetail(input: RiderInputChannel): string {
  const instrument = instrumentLabel(input);
  const named = input.source.trim();
  return [
    instrument && instrument.toLowerCase() !== named.toLowerCase() ? instrument : null,
    INPUT_TYPE_LABELS[input.inputType],
    input.micPreference,
    input.stand !== "none" ? STAND_LABELS[input.stand] : null,
    input.phantom ? "48V" : null,
    input.stereo ? "Stereo" : null,
    input.notes,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RiderInputsPanel({ content, readOnly, onChange }: RiderPanelProps) {
  const inputs = content.inputs;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `?channel=` opens one channel's panel: the stage plot links here.
  const channelParam = searchParams.get("channel");
  const [openId, setOpenId] = useState<string | null>(channelParam);
  // Follow later changes too (Back/Forward, or a link while already on this
  // tab), adjusting during render rather than in an effect.
  const [followedParam, setFollowedParam] = useState(channelParam);
  if (channelParam !== followedParam) {
    setFollowedParam(channelParam);
    setOpenId(channelParam);
  }

  function setInputs(next: RiderInputChannel[], historyKey?: string) {
    onChange((current) => ({ ...current, inputs: next }), historyKey);
  }

  function patch(id: string, next: Partial<RiderInputChannel>) {
    setInputs(
      inputs.map((input) => (input.id === id ? { ...input, ...next } : input)),
      `input:${id}:${Object.keys(next).join()}`,
    );
  }

  /**
   * Applying a role can change the strip width, so this renumbers, and a row
   * that had no role yet slides into its family group rather than staying at
   * the bottom where "Add channel" put it. A row that already had a role stays
   * put: the band may have positioned it deliberately.
   */
  function selectSource(input: RiderInputChannel, selection: RiderSourceSelection) {
    const updated = { ...input, ...applySourceSelection(selection) };
    // A mic note ("SM57 on cab") doesn't survive a change of capture (a DI).
    if (updated.inputType !== input.inputType) updated.micPreference = undefined;
    const next = input.sourceKey
      ? inputs.map((row) => (row.id === input.id ? updated : row))
      : insertByFamily(
          inputs.filter((row) => row.id !== input.id),
          updated,
        );
    setInputs(renumberInputs(next));
  }

  function closeSheet() {
    setOpenId(null);
    if (searchParams.get("channel")) window.history.replaceState(null, "", `${pathname}?tab=inputs`);
  }

  function addChannel() {
    const row = blankInput(inputs);
    setInputs([...inputs, row]);
    setOpenId(row.id);
  }

  function remove(id: string) {
    setInputs(renumberInputs(inputs.filter((row) => row.id !== id)));
    setOpenId((current) => (current === id ? null : current));
  }

  function move(from: number, to: number) {
    setInputs(renumberInputs(moveInArray(inputs, from, to)));
  }

  const ordinals = useMemo(() => sourceOrdinals(inputs), [inputs]);
  const itemsById = useMemo(
    () => new Map(content.items.map((item) => [item.id, item])),
    [content.items],
  );
  /** Names used more than once ("Guitar", "Guitar"), which need their ordinal to tell apart. */
  const repeatedNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const input of inputs) {
      const name = input.source.trim().toLowerCase();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [inputs]);

  /**
   * Rows are only `draggable` once a pointer goes down on their grip handle;
   * a permanently draggable row turns every click into a drag start. On touch
   * screens the grip is hidden and rows move through the `⋯` menu instead.
   */
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; edge: "top" | "bottom" } | null>(
    null,
  );
  const dragIndexRef = useRef(-1);

  function endDrag() {
    dragIndexRef.current = -1;
    setDragArmedId(null);
    setDraggingId(null);
    setDropTarget(null);
  }

  /** Highlights the edge the row will land on: `moveInArray` lands it *at* `index`. */
  function hoverRow(index: number) {
    const from = dragIndexRef.current;
    if (from === -1 || from === index) return;
    setDropTarget({ index, edge: from < index ? "bottom" : "top" });
  }

  function dropOn(index: number) {
    const from = dragIndexRef.current;
    if (from !== -1 && from < inputs.length) move(from, index);
    endDrag();
  }

  const channelCount = inputs.reduce((count, input) => count + channelSpan(input), 0);
  const stereoCount = inputs.filter((input) => input.stereo).length;
  const unmatched = inputs.filter((input) => input.source.trim() && !input.sourceKey).length;
  const unnamed = inputs.filter((input) => !input.source.trim()).length;

  const openIndex = inputs.findIndex((input) => input.id === openId);
  const openInput = openIndex === -1 ? null : inputs[openIndex];

  return (
    <Card data-testid="rider-inputs-panel">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <PlugsConnectedIcon className="size-4 text-muted-foreground" aria-hidden />
            Input list
          </CardTitle>
          <CardDescription>
            In patch order. Placing gear on the stage adds its channels here.
          </CardDescription>
        </div>
        {!readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={addChannel}>
            <PlusIcon />
            Add channel
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {inputs.length === 0 ? (
          <EmptyState
            action={
              !readOnly ? (
                <Button type="button" size="sm" variant="outline" onClick={addChannel}>
                  <PlusIcon />
                  Add channel
                </Button>
              ) : null
            }
          >
            No channels yet. Place mics, DIs or amps on the stage plot, or add one here.
          </EmptyState>
        ) : (
          <>
            <ListSummary testId="rider-inputs-summary">
              {[
                `${channelCount} channel${channelCount === 1 ? "" : "s"}`,
                stereoCount > 0 ? `${stereoCount} stereo` : null,
                unnamed > 0 ? `${unnamed} unnamed` : null,
                unmatched > 0 ? `${unmatched} not matched to a source type` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ListSummary>
            <ul className="divide-y border [&>li]:border-0">
              {inputs.map((input, index) => {
                const family = inputFamilyLabel(input);
                const previous = index > 0 ? inputFamilyLabel(inputs[index - 1]) : null;
                const heading = family !== previous ? family : null;
                const name = input.source.trim() || instrumentLabel(input) || "";
                const ordinal = repeatedNames.has(name.toLowerCase())
                  ? ordinals.get(input.id)
                  : undefined;
                return (
                  <InputRowFragment key={input.id} heading={heading}>
                    <ListRow
                      data-testid="rider-input-row"
                      className={cn(
                        draggingId === input.id && "opacity-40",
                        dropTarget?.index === index &&
                          (dropTarget.edge === "top"
                            ? "shadow-[inset_0_2px_0_0_var(--ring)]"
                            : "shadow-[inset_0_-2px_0_0_var(--ring)]"),
                      )}
                      draggable={!readOnly && dragArmedId === input.id}
                      onDragStart={(event) => {
                        dragIndexRef.current = index;
                        setDraggingId(input.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => {
                        if (dragIndexRef.current === -1) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        hoverRow(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropOn(index);
                      }}
                      onDragEnd={endDrag}
                      leading={
                        <span className="w-9 shrink-0 text-sm tabular-nums text-muted-foreground">
                          {channelLabel(input)}
                        </span>
                      }
                      onOpen={() => setOpenId(input.id)}
                      actions={
                        <div className="flex shrink-0 items-center">
                          {!readOnly ? (
                            <span
                              className="hidden h-8 cursor-grab touch-none items-center px-1 text-muted-foreground/60 select-none active:cursor-grabbing sm:flex"
                              title="Drag to reorder"
                              aria-hidden
                              onPointerDown={() => setDragArmedId(input.id)}
                              onPointerUp={() => setDragArmedId(null)}
                            >
                              <DotsSixVerticalIcon className="size-4" />
                            </span>
                          ) : null}
                          {!readOnly ? (
                            <RowMenu label={`More for channel ${channelLabel(input)}`}>
                              <RowMenuItems
                                noun="channel"
                                index={index}
                                total={inputs.length}
                                onOpen={() => setOpenId(input.id)}
                                onMove={(to) => move(index, to)}
                                onRemove={() => remove(input.id)}
                              />
                            </RowMenu>
                          ) : null}
                        </div>
                      }
                    >
                      {(() => {
                        const item = input.stageItemId ? itemsById.get(input.stageItemId) : undefined;
                        return item ? (
                          <span title={`On stage: ${item.label}`} className="shrink-0">
                            <RiderSymbolGlyph symbolKey={item.symbol} size={22} />
                          </span>
                        ) : (
                          <span className="size-5.5 shrink-0" aria-hidden />
                        );
                      })()}
                      <RowText
                        title={
                          name ? (
                            <>
                              {name}
                              {ordinal ? (
                                <span className="ml-1.5 text-muted-foreground tabular-nums">
                                  {ordinal}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">Unnamed channel</span>
                          )
                        }
                        detail={inputDetail(input)}
                      />
                      {!input.sourceKey ? (
                        <span className="shrink-0 rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-700 dark:text-status-amber-200">
                          No instrument
                        </span>
                      ) : null}
                      <RowCell hideBelow="md" className="w-36" align="left" muted>
                        {PROVIDED_BY_EDITOR_LABELS[input.providedBy]}
                      </RowCell>
                    </ListRow>
                  </InputRowFragment>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>

      <DetailSheet
        open={openInput !== null}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        testId="rider-input-sheet"
      >
        {openInput ? (
          <InputSheetBody
            key={openInput.id}
            input={openInput}
            index={openIndex}
            total={inputs.length}
            readOnly={readOnly}
            onPatch={(next) => patch(openInput.id, next)}
            onToggleStereo={(stereo) =>
              setInputs(
                renumberInputs(
                  inputs.map((input) => (input.id === openInput.id ? { ...input, stereo } : input)),
                ),
              )
            }
            onSelectSource={(selection) => selectSource(openInput, selection)}
            onStep={(next) => {
              setOpenId(inputs[next]?.id ?? null);
            }}
            onRemove={() => remove(openInput.id)}
            onDone={closeSheet}
          />
        ) : null}
      </DetailSheet>
    </Card>
  );
}

/** A row, preceded by its family heading where a new run of families starts. */
function InputRowFragment({
  heading,
  children,
}: {
  heading: string | null;
  children: React.ReactNode;
}) {
  return (
    <>
      {heading ? (
        <li
          aria-hidden
          className="bg-muted/20 px-3 py-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {heading}
        </li>
      ) : null}
      {children}
    </>
  );
}

function InputSheetBody({
  input,
  index,
  total,
  readOnly,
  onPatch,
  onToggleStereo,
  onSelectSource,
  onStep,
  onRemove,
  onDone,
}: {
  input: RiderInputChannel;
  index: number;
  total: number;
  readOnly: boolean;
  onPatch: (next: Partial<RiderInputChannel>) => void;
  onToggleStereo: (stereo: boolean) => void;
  onSelectSource: (selection: RiderSourceSelection) => void;
  onStep: (index: number) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const unmatched = !input.sourceKey;
  const instrument = input.sourceKey ? riderSource(input.sourceKey) : undefined;

  /**
   * The name follows the instrument until the band types their own: picking
   * Bass on a channel still called "Guitar" renames it, but "Sarah's Strat"
   * stays "Sarah's Strat".
   */
  function pickInstrument(key: string) {
    const next = key ? riderSource(key) : undefined;
    const current = input.source.trim();
    const followsInstrument = !current || (instrument && current.toLowerCase() === instrument.label.toLowerCase());
    onSelectSource({ source: next, text: followsInstrument && next ? next.label : input.source });
  }

  return (
    <>
      <DetailSheetHeader
        title={`Channel ${channelLabel(input)}`}
        pill={unmatched ? <StatusPill tone="amber">No instrument</StatusPill> : null}
        description={
          unmatched
            ? "Pick what this is so crew can patch it. If it isn't listed, crew will confirm it at load-in."
            : "Changes go into the draft. Save the rider to keep them."
        }
      />

      <SheetSection title="Source">
        <Field id="rider-input-instrument" label="Instrument" hint="What it is. This is what crew patch from.">
          {readOnly ? (
            <p id="rider-input-instrument" className="text-sm">
              {instrument?.label ?? "Not listed"}
            </p>
          ) : (
            <SearchableSelect
              value={input.sourceKey ?? ""}
              options={INSTRUMENT_OPTIONS}
              placeholder="Pick an instrument"
              emptyLabel="Nothing matches. Pick Not listed and name it below."
              clearable
              clearLabel="Not listed"
              onChange={pickInstrument}
            />
          )}
        </Field>
        <Field id="rider-input-name" label="Name" hint="What you call it. It prints on the rider and the console.">
          <Input
            id="rider-input-name"
            disabled={readOnly}
            value={input.source}
            placeholder={instrument ? instrument.label : "e.g. Sarah's Strat"}
            onChange={(event) => onPatch({ source: event.target.value })}
            onBlur={() => {
              // A blank name falls back to the instrument, so nothing prints empty.
              if (!input.source.trim() && instrument) onPatch({ source: instrument.label });
            }}
          />
        </Field>
        <SwitchRow
          id="rider-input-stereo"
          label="Stereo pair"
          description="Uses two channels, left and right."
          checked={input.stereo ?? false}
          disabled={readOnly}
          onCheckedChange={onToggleStereo}
        />
      </SheetSection>

      <SheetSection title="Pickup">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="rider-input-type" label="Type">
            <OptionSelect
              id="rider-input-type"
              value={input.inputType}
              options={captureOptionsFor(input)}
              labels={INPUT_TYPE_LABELS}
              disabled={readOnly}
              onChange={(inputType) => onPatch(applyCaptureChange(input, inputType))}
            />
          </Field>
          <Field id="rider-input-mic" label="Mic / DI">
            <Input
              id="rider-input-mic"
              placeholder="e.g. SM57"
              disabled={readOnly}
              value={input.micPreference ?? ""}
              onChange={(event) => onPatch({ micPreference: event.target.value || undefined })}
            />
          </Field>
          <Field id="rider-input-stand" label="Stand">
            <OptionSelect
              id="rider-input-stand"
              value={input.stand}
              options={STAND_TYPES}
              labels={STAND_LABELS}
              disabled={readOnly}
              onChange={(stand) => onPatch({ stand })}
            />
          </Field>
          <Field id="rider-input-provided" label="Provided by">
            <OptionSelect
              id="rider-input-provided"
              value={input.providedBy}
              options={PROVIDED_BY}
              labels={PROVIDED_BY_EDITOR_LABELS}
              disabled={readOnly}
              onChange={(providedBy) => onPatch({ providedBy })}
            />
          </Field>
        </div>
        <SwitchRow
          id="rider-input-phantom"
          label="48V phantom power"
          description="Condenser mics and active DIs need it."
          checked={input.phantom}
          disabled={readOnly}
          onCheckedChange={(phantom) => onPatch({ phantom })}
        />
      </SheetSection>

      <SheetSection title="Notes">
        <Label htmlFor="rider-input-notes" className="sr-only">
          Notes
        </Label>
        <Textarea
          id="rider-input-notes"
          rows={3}
          placeholder="Anything the engineer should know"
          disabled={readOnly}
          value={input.notes ?? ""}
          onChange={(event) => onPatch({ notes: event.target.value || undefined })}
        />
      </SheetSection>

      <DetailSheetFooter
        start={
          !readOnly ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
              Remove channel
            </Button>
          ) : undefined
        }
      >
        <SheetStepper index={index} total={total} noun="channel" onStep={onStep} />
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </DetailSheetFooter>
    </>
  );
}
