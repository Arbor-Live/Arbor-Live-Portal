"use client";

import { useState } from "react";
import { PackageIcon, PlusIcon } from "@phosphor-icons/react";
import {
  blankBacklineItem,
  PROVIDED_BY_EDITOR_LABELS,
  type RiderBacklineItem,
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
  PROVIDED_BY,
  RowMenuItems,
  SheetStepper,
  type RiderPanelProps,
} from "@/components/riders/rider-editor-parts";

export function RiderBacklinePanel({ content, readOnly, onChange }: RiderPanelProps) {
  const backline = content.backline;
  const [openId, setOpenId] = useState<string | null>(null);

  function setBackline(next: RiderBacklineItem[], historyKey?: string) {
    onChange((current) => ({ ...current, backline: next }), historyKey);
  }

  function patch(id: string, next: Partial<RiderBacklineItem>) {
    setBackline(
      backline.map((item) => (item.id === id ? { ...item, ...next } : item)),
      `backline:${id}:${Object.keys(next).join()}`,
    );
  }

  function addItem() {
    const item = blankBacklineItem();
    setBackline([...backline, item]);
    setOpenId(item.id);
  }

  function remove(id: string) {
    setBackline(backline.filter((item) => item.id !== id));
    setOpenId((current) => (current === id ? null : current));
  }

  const bandBrings = backline.filter((item) => item.providedBy === "band").length;
  const needed = backline.length - bandBrings;
  const openIndex = backline.findIndex((item) => item.id === openId);
  const openItem = openIndex === -1 ? null : backline[openIndex];

  return (
    <Card data-testid="rider-backline-panel">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <PackageIcon className="size-4 text-muted-foreground" aria-hidden />
            Backline
          </CardTitle>
          <CardDescription>Amps, kits, keyboards and stands you need on stage.</CardDescription>
        </div>
        {!readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <PlusIcon />
            Add item
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {backline.length === 0 ? (
          <EmptyState
            action={
              !readOnly ? (
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <PlusIcon />
                  Add item
                </Button>
              ) : null
            }
          >
            No backline yet. List the gear you need, and say who brings it.
          </EmptyState>
        ) : (
          <>
            <ListSummary testId="rider-backline-summary">
              {[
                `${backline.length} item${backline.length === 1 ? "" : "s"}`,
                bandBrings > 0 ? `${bandBrings} the artist brings` : null,
                needed > 0 ? `${needed} needed from production or the venue` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ListSummary>
            <RowList joined>
              {backline.map((item, index) => (
                <ListRow
                  key={item.id}
                  data-testid="rider-backline-row"
                  leading={
                    <span className="w-9 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {item.quantity}×
                    </span>
                  }
                  onOpen={() => setOpenId(item.id)}
                  actions={
                    !readOnly ? (
                      <RowMenu label={`More for ${item.label || "this item"}`}>
                        <RowMenuItems
                          noun="item"
                          index={index}
                          total={backline.length}
                          onOpen={() => setOpenId(item.id)}
                          onRemove={() => remove(item.id)}
                        />
                      </RowMenu>
                    ) : null
                  }
                >
                  <RowText
                    title={
                      item.label.trim() || (
                        <span className="text-muted-foreground italic">Unnamed item</span>
                      )
                    }
                    detail={item.notes}
                  />
                  <RowCell hideBelow="sm" className="w-36" align="left" muted>
                    {PROVIDED_BY_EDITOR_LABELS[item.providedBy]}
                  </RowCell>
                </ListRow>
              ))}
            </RowList>
          </>
        )}
      </CardContent>

      <DetailSheet
        open={openItem !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        testId="rider-backline-sheet"
      >
        {openItem ? (
          <BacklineSheetBody
            key={openItem.id}
            item={openItem}
            index={openIndex}
            total={backline.length}
            readOnly={readOnly}
            onPatch={(next) => patch(openItem.id, next)}
            onStep={(next) => setOpenId(backline[next]?.id ?? null)}
            onRemove={() => remove(openItem.id)}
            onDone={() => setOpenId(null)}
          />
        ) : null}
      </DetailSheet>
    </Card>
  );
}

function BacklineSheetBody({
  item,
  index,
  total,
  readOnly,
  onPatch,
  onStep,
  onRemove,
  onDone,
}: {
  item: RiderBacklineItem;
  index: number;
  total: number;
  readOnly: boolean;
  onPatch: (next: Partial<RiderBacklineItem>) => void;
  onStep: (index: number) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <DetailSheetHeader
        title={item.label.trim() || "Backline item"}
        description="Changes go into the draft. Save the rider to keep them."
      />
      <SheetSection title="Item">
        <Field id="rider-backline-label" label="Item">
          <Input
            id="rider-backline-label"
            placeholder="e.g. Bass amp, 4×10 cab"
            disabled={readOnly}
            value={item.label}
            onChange={(event) => onPatch({ label: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
          <Field id="rider-backline-qty" label="Quantity">
            <NumberInput
              id="rider-backline-qty"
              min={1}
              max={20}
              disabled={readOnly}
              value={item.quantity}
              onValueChange={(quantity) => onPatch({ quantity })}
            />
          </Field>
          <Field id="rider-backline-provided" label="Provided by">
            <OptionSelect
              id="rider-backline-provided"
              value={item.providedBy}
              options={PROVIDED_BY}
              labels={PROVIDED_BY_EDITOR_LABELS}
              disabled={readOnly}
              onChange={(providedBy) => onPatch({ providedBy })}
            />
          </Field>
        </div>
      </SheetSection>
      <SheetSection title="Notes">
        <Label htmlFor="rider-backline-notes" className="sr-only">
          Notes
        </Label>
        <Textarea
          id="rider-backline-notes"
          rows={3}
          placeholder="Model, size, anything specific"
          disabled={readOnly}
          value={item.notes ?? ""}
          onChange={(event) => onPatch({ notes: event.target.value || undefined })}
        />
      </SheetSection>
      <DetailSheetFooter
        start={
          !readOnly ? (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
              Remove item
            </Button>
          ) : undefined
        }
      >
        <SheetStepper index={index} total={total} noun="item" onStep={onStep} />
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </DetailSheetFooter>
    </>
  );
}
