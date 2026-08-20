"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type AlertOptions = {
  title?: string;
  description: string;
};

type ConfirmRequest = ConfirmOptions & {
  kind: "confirm";
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (value: boolean) => void;
};

type AlertRequest = {
  kind: "alert";
  title: string;
  description: string;
  resolve: () => void;
};

type AppDialogContextValue = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function normalizeConfirm(options: ConfirmOptions | string): Omit<ConfirmRequest, "kind" | "resolve"> {
  const opts = typeof options === "string" ? { title: options } : options;
  return {
    title: opts.title,
    description: opts.description,
    confirmLabel: opts.confirmLabel ?? (opts.destructive ? "Delete" : "Continue"),
    cancelLabel: opts.cancelLabel ?? "Cancel",
    destructive: opts.destructive ?? false,
  };
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | AlertRequest | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const normalized = normalizeConfirm(options);
    return new Promise<boolean>((resolve) => {
      setRequest({ kind: "confirm", ...normalized, resolve });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string) => {
    const opts = typeof options === "string" ? { description: options } : options;
    return new Promise<void>((resolve) => {
      setRequest({
        kind: "alert",
        title: opts.title ?? "Notice",
        description: opts.description,
        resolve,
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm, alert }), [alert, confirm]);

  function closeWith(result: boolean) {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(result);
    else request.resolve();
    setRequest(null);
  }

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open) closeWith(false);
        }}
      >
        <DialogContent
          data-testid="app-dialog"
          showCloseButton={false}
          className="sm:max-w-md"
        >
          {request?.kind === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>{request.title}</DialogTitle>
                {request.description ? (
                  <DialogDescription>{request.description}</DialogDescription>
                ) : null}
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => closeWith(false)}>
                  {request.cancelLabel}
                </Button>
                <Button
                  type="button"
                  variant={request.destructive ? "destructive" : "default"}
                  onClick={() => closeWith(true)}
                >
                  {request.confirmLabel}
                </Button>
              </DialogFooter>
            </>
          ) : request?.kind === "alert" ? (
            <>
              <DialogHeader>
                <DialogTitle>{request.title}</DialogTitle>
                <DialogDescription>{request.description}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" onClick={() => closeWith(true)}>
                  OK
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return context;
}
