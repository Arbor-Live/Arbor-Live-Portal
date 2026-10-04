"use client";

import { ExportIcon, PlusSquareIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isIos } from "@/lib/pwa";
import { useInstallPrompt } from "./install-prompt-store";

/** "Add to Home Screen" steps: the native prompt on Android, Share-sheet steps on iOS. */
export function InstallAppDialog() {
  const { dialogOpen, closeDialog, deferredPrompt } = useInstallPrompt();
  const ios = dialogOpen && isIos();

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);
    closeDialog();
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => (open ? undefined : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Arbor Live to your Home Screen</DialogTitle>
          <DialogDescription>
            It opens like an app and can send push notifications for schedules, mentions, and
            requests.
          </DialogDescription>
        </DialogHeader>
        {deferredPrompt ? null : (
          <ol className="flex flex-col gap-3 text-sm">
            {ios ? (
              <>
                <Step n={1}>
                  Tap <ExportIcon className="inline size-4 align-text-bottom" aria-hidden />{" "}
                  <strong>Share</strong>
                  {" in Safari\u2019s toolbar."}
                </Step>
                <Step n={2}>
                  Choose{" "}
                  <PlusSquareIcon className="inline size-4 align-text-bottom" aria-hidden />{" "}
                  <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </Step>
              </>
            ) : (
              <Step n={1}>
                Open your browser&rsquo;s menu and choose <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>.
              </Step>
            )}
            <Step n={ios ? 3 : 2}>
              Open Arbor Live from your Home Screen and sign in. You&rsquo;ll be asked to turn on
              notifications.
            </Step>
          </ol>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            {deferredPrompt ? "Not now" : "Done"}
          </Button>
          {deferredPrompt ? <Button onClick={() => void install()}>Install</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-medium">
        {n}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}
