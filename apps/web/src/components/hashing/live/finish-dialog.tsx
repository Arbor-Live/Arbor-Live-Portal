"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { plural } from "@/lib/format";

type Person = { userId: string; name: string; status: "booked" | "needs_confirmation" };

/** Only who's ticked keeps their shift, so pay and credit come from this list. */
export function FinishDialog({
  open,
  onOpenChange,
  people,
  itemsLeft,
  busy,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  itemsLeft: number;
  busy: boolean;
  onFinish: (attendeeUserIds: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="hash-finish-dialog">
        <DialogHeader>
          <DialogTitle>Who was there?</DialogTitle>
        </DialogHeader>
        {open ? <FinishForm people={people} itemsLeft={itemsLeft} busy={busy} onFinish={onFinish} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FinishForm({
  people,
  itemsLeft,
  busy,
  onFinish,
}: {
  people: Person[];
  itemsLeft: number;
  busy: boolean;
  onFinish: (attendeeUserIds: string[]) => void;
}) {
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
      {absent.size > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="hash-finish-absent">
          {plural(absent.size, "person", "people")} will lose this shift and need a hash again.
        </p>
      ) : null}
      {itemsLeft > 0 ? (
        <p className="text-sm text-muted-foreground">{plural(itemsLeft, "item")} still unchecked.</p>
      ) : null}
      <DialogFooter>
        <Button
          disabled={busy}
          data-testid="hash-finish-confirm"
          onClick={() => onFinish(people.map((person) => person.userId).filter((userId) => !absent.has(userId)))}
        >
          Finish hash
        </Button>
      </DialogFooter>
    </div>
  );
}
