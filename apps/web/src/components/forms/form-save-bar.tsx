"use client";

import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useOptionalSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/use-convex-form";

export type SaveTier = "A" | "B" | "C";

export type FormSaveBarProps = {
  tier: SaveTier;
  saveStatus: SaveStatus;
  saveError?: string | null;
  isDirty?: boolean;
  isSubmitting?: boolean;
  saveLabel?: string;
  onSave?: () => void;
  onDiscard?: () => void;
  onRetry?: () => void;
  className?: string;
};

export function FormSaveBar({
  tier,
  saveStatus,
  saveError,
  isDirty = false,
  isSubmitting = false,
  saveLabel = "Save",
  onSave,
  onDiscard,
  onRetry,
  className,
}: FormSaveBarProps) {
  const sidebar = useOptionalSidebar();

  const isSaving = saveStatus === "saving" || isSubmitting;
  const isError = saveStatus === "error";
  const isSaved = saveStatus === "saved";
  const visible =
    isDirty ||
    isSaving ||
    isError ||
    isSaved ||
    (tier === "B" && saveStatus !== "idle");

  // When inside the dashboard shell, offset past the fixed sidebar (not full viewport width).
  const isStaticBar = className?.includes("static");
  const usesSidebarInset =
    !isStaticBar && sidebar && !sidebar.isMobile && sidebar.open;
  const horizontalPosition = usesSidebarInset
    ? "left-[var(--sidebar-width)] right-0 transition-[left] duration-200 ease-linear"
    : "inset-x-0";

  if (!visible && tier === "C" && !isDirty && !isSaving && !isError && !isSaved) {
    return null;
  }

  if (!visible && tier === "B" && saveStatus === "idle" && !isDirty) {
    return null;
  }

  if (!visible && tier === "A" && !isSaving && !isError && !isSaved) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        horizontalPosition,
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {isSaving ? (
            <>
              <CircleNotchIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Saving…</span>
            </>
          ) : null}

          {isError ? (
            <>
              <WarningCircleIcon className="size-4 shrink-0 text-destructive" weight="fill" />
              <span className="truncate text-destructive">{saveError ?? "Save failed"}</span>
            </>
          ) : null}

          {isSaved && !isError && !isSaving ? (
            <>
              <CheckIcon className="size-4 shrink-0 text-emerald-600" weight="bold" />
              <span className="text-emerald-700 dark:text-emerald-400">Saved</span>
            </>
          ) : null}

          {!isSaving && !isError && !isSaved && tier === "B" && !isDirty ? (
            <span className="text-muted-foreground">All changes saved</span>
          ) : null}

          {!isSaving && !isError && !isSaved && isDirty && tier === "C" ? (
            <span className="text-muted-foreground">Unsaved changes</span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isError && onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}

          {tier === "C" && isDirty && onDiscard ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              Discard
            </Button>
          ) : null}

          {(tier === "C" || (tier === "B" && isDirty)) && onSave ? (
            <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
              {saveLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
