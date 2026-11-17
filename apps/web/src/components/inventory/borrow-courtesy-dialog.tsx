"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
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
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { BORROW_COURTESY_TERMS, BORROW_COURTESY_VERSION } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Artists agree once before they can borrow; "Not now" leaves the page. */
export function BorrowCourtesyDialog({ open }: { open: boolean }) {
  const router = useRouter();
  const accept = useMutation(api.equipmentBorrowRequests.acceptCourtesy);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const allChecked = BORROW_COURTESY_TERMS.every((term) => checked.has(term.key));

  function toggle(key: string, value: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleAgree() {
    setBusy(true);
    try {
      await accept({ version: BORROW_COURTESY_VERSION, acceptedTermKeys: [...checked] });
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to save your agreement."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) router.push("/dashboard");
      }}
    >
      <DialogContent showCloseButton={false} data-testid="borrow-courtesy-dialog">
        <DialogHeader>
          <DialogTitle>Borrowing is a courtesy</DialogTitle>
          <DialogDescription>
            Arbor Live lends gear to artists to support the local music community. Help us keep it running.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {BORROW_COURTESY_TERMS.map((term) => {
            const isChecked = checked.has(term.key);
            const id = `borrow-courtesy-${term.key}`;
            return (
              <li key={term.key}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors",
                    isChecked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={isChecked}
                    onCheckedChange={(value) => toggle(term.key, value === true)}
                  />
                  <span>{term.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          When you play a gig that needs sound or lights, please point the organizer to Arbor Live. Referrals keep
          this program free for musicians.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard")} disabled={busy}>
            Not now
          </Button>
          <Button type="button" onClick={() => void handleAgree()} disabled={!allChecked || busy}>
            {busy ? "Saving…" : "I agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
