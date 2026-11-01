"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { plural } from "@/lib/format";
import { finishBlockedReason } from "@/lib/hashing-live";

type Person = { userId: string; name: string; status: "booked" | "needs_confirmation" };

type FinishFormProps = {
  people: Person[];
  viewerId: string;
  canManage: boolean;
  itemsLeft: number;
  busy: boolean;
  onFinish: (attendeeUserIds: string[]) => void;
};

/** Only who's ticked keeps their shift, so pay and credit come from this list. */
export function FinishDialog({
  open,
  onOpenChange,
  ...form
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & FinishFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="hash-finish-dialog">
        <DialogHeader>
          <DialogTitle>Who was there?</DialogTitle>
        </DialogHeader>
        {open ? <FinishForm {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FinishForm({ people, viewerId, canManage, itemsLeft, busy, onFinish }: FinishFormProps) {
  const [absent, setAbsent] = useState(
    () => new Set(people.filter((person) => person.status === "needs_confirmation").map((person) => person.userId)),
  );

  function setThere(userId: string, there: boolean) {
    setAbsent((current) => {
      const next = new Set(current);
      if (there) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const there = people.map((person) => person.userId).filter((userId) => !absent.has(userId));
  const blocked = finishBlockedReason(there, viewerId, canManage);

  return (
    <div className="space-y-4">
      {people.length > 0 ? (
        <ul className="divide-y border-y">
          {people.map((person) => {
            const id = `hash-finish-${person.userId}`;
            return (
              <li key={person.userId} className="flex items-center gap-3 py-1">
                <Checkbox
                  id={id}
                  className="size-5"
                  checked={!absent.has(person.userId)}
                  data-testid="hash-finish-person"
                  onCheckedChange={(checked) => setThere(person.userId, checked === true)}
                />
                <Label htmlFor={id} className="min-h-10 min-w-0 flex-1 items-center font-normal wrap-anywhere">
                  {person.name}
                  {person.status === "needs_confirmation" ? (
                    <span className="ml-2 text-xs text-muted-foreground">Never confirmed</span>
                  ) : null}
                </Label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody is booked on this hash.</p>
      )}
      {blocked ? (
        <p className="text-sm text-destructive" data-testid="hash-finish-blocked">
          {blocked}
        </p>
      ) : absent.size > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="hash-finish-absent">
          {plural(absent.size, "person", "people")} will lose this shift and need a hash again.
        </p>
      ) : null}
      {itemsLeft > 0 ? (
        <p className="text-sm text-muted-foreground">{plural(itemsLeft, "item")} still unchecked.</p>
      ) : null}
      <DialogFooter>
        <Button disabled={busy || blocked !== null} data-testid="hash-finish-confirm" onClick={() => onFinish(there)}>
          Finish hash
        </Button>
      </DialogFooter>
    </div>
  );
}
