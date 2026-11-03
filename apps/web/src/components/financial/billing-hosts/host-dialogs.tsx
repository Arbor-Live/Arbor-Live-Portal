"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useConvexForm } from "@/hooks/use-convex-form";
import { api, type Id } from "@/lib/convex-api";
import { INVOICE_GROUP_TYPE_LABELS } from "@/lib/invoice-group-labels";
import { notify } from "@/lib/notify";
import { invoiceGroupSchema, type InvoiceGroupFormValues } from "@/lib/validations/financial";
import { HostFields, NEW_HOST_DEFAULTS } from "./host-fields";
import { attempt, plural, type HostRow } from "./host-model";

/** Creates a host, then hands its id back so the page can open it. */
export function NewHostDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: Id<"invoiceGroups">) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="new-host-dialog">
        {open ? <NewHostForm onCancel={() => onOpenChange(false)} onCreated={onCreated} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewHostForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: Id<"invoiceGroups">) => void;
}) {
  const createGroup = useMutation(api.invoiceGroups.create);
  const form = useConvexForm<InvoiceGroupFormValues>({
    schema: invoiceGroupSchema,
    defaultValues: NEW_HOST_DEFAULTS,
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(
    (values) =>
      createGroup({
        name: values.name.trim(),
        type: values.type,
        equipmentPricingMode: values.equipmentPricingMode,
        active: true,
      }),
    {
      onSuccess: (id) => {
        notify.success(`Added ${form.getValues("name").trim()}`);
        onCreated(id);
      },
    },
  );

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <DialogHeader>
          <DialogTitle>New billing host</DialogTitle>
          <DialogDescription>A client we invoice. Add their contacts once it exists.</DialogDescription>
        </DialogHeader>
        <HostFields form={form} idPrefix="new-host" autoFocus />
        {form.saveError ? <p className="text-sm text-destructive">{form.saveError}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.saveStatus === "saving"}>
            {form.saveStatus === "saving" ? "Adding…" : "Add host"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/**
 * Folds duplicate hosts into `survivor`. The preview counts what moves, and the
 * merge button names how many hosts it archives, so the dialog is its own
 * confirmation.
 */
export function MergeHostsDialog({
  survivor,
  hosts,
  onOpenChange,
}: {
  /** The host the others merge into; null keeps the dialog closed. */
  survivor: HostRow | null;
  hosts: HostRow[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={survivor !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="host-merge-panel">
        {survivor ? (
          <MergeHostsForm
            key={survivor._id}
            survivor={survivor}
            hosts={hosts}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MergeHostsForm({
  survivor,
  hosts,
  onDone,
}: {
  survivor: HostRow;
  hosts: HostRow[];
  onDone: () => void;
}) {
  const mergeGroups = useMutation(api.invoiceGroups.merge);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [victimIds, setVictimIds] = useState<Id<"invoiceGroups">[]>([]);
  const [busy, setBusy] = useState(false);

  const preview = useQuery(
    api.invoiceGroups.getMergePreview,
    victimIds.length > 0 ? { survivorId: survivor._id, victimIds } : "skip",
  );

  const candidates = useMemo(
    () =>
      hosts.filter(
        (host) =>
          host.active &&
          host._id !== survivor._id &&
          (!query || host.name.toLowerCase().includes(query) || victimIds.includes(host._id)),
      ),
    [hosts, query, survivor._id, victimIds],
  );

  const moving = useMemo(() => {
    if (!preview) return null;
    const total = (key: "contactCount" | "eventCount" | "seriesCount" | "invoiceCount" | "requestCount") =>
      preview.victims.reduce((sum, row) => sum + row[key], 0);
    return [
      plural(total("contactCount"), "contact"),
      plural(total("eventCount"), "event"),
      plural(total("seriesCount"), "series", "series"),
      plural(total("invoiceCount"), "invoice"),
      plural(total("requestCount"), "request"),
    ].join(", ");
  }, [preview]);

  function toggle(id: Id<"invoiceGroups">) {
    setVictimIds((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  }

  async function merge() {
    setBusy(true);
    const ok = await attempt(
      () => mergeGroups({ survivorId: survivor._id, victimIds }),
      `Merged ${plural(victimIds.length, "host")} into ${survivor.name}`,
    );
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Merge hosts into {survivor.name}</DialogTitle>
        <DialogDescription>
          The hosts you pick are archived. Their contacts, events, invoices and requests move here, and their
          names become aliases.
        </DialogDescription>
      </DialogHeader>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search hosts to merge"
          placeholder="Search hosts…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>
      {candidates.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {query ? "No active hosts match." : "No other active hosts to merge."}
        </p>
      ) : (
        <ul className="max-h-64 divide-y overflow-y-auto border">
          {candidates.map((host) => (
            <li key={host._id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                <Checkbox checked={victimIds.includes(host._id)} onCheckedChange={() => toggle(host._id)} />
                <span className="min-w-0 flex-1 truncate">{host.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {INVOICE_GROUP_TYPE_LABELS[host.type]} · {plural(host.contactCount, "contact")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {victimIds.length > 0 ? (
        <p className="text-sm" data-testid="host-merge-preview">
          {moving ? `Moves ${moving} to ${survivor.name}.` : "Counting what moves…"}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={victimIds.length === 0 || busy}
          onClick={() => void merge()}
          data-testid="host-merge-confirm"
        >
          {busy ? "Merging…" : victimIds.length > 0 ? `Merge ${plural(victimIds.length, "host")}` : "Merge"}
        </Button>
      </DialogFooter>
    </div>
  );
}
