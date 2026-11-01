"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarCheckIcon, CaretRightIcon, CheckIcon, ClipboardTextIcon, type Icon } from "@phosphor-icons/react";
import { NightFacts, type Night } from "@/components/availability/night-card";
import { NightPartForm } from "@/components/availability/night-part-form";
import type { PostEventWorkRow } from "@/components/events/post-event-work-card";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { PostMortemForm } from "@/components/post-mortem/post-mortem-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHeldQuery } from "@/hooks/use-held-query";
import { useMediaAlbum } from "@/hooks/use-media-album";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { DEFAULT_AVAILABILITY_WEEKS, type TimeWindow } from "@/lib/crew-availability";
import {
  formatWindow,
  mergeBusyNotes,
  nightAnswerArgs,
  nightDateLabel,
  nightWeekdayPlural,
  usualChipClass,
  usualSuggestion,
  type NightChoice,
} from "@/lib/crew-nights";
import { buildCrewTodos, endedLabel, type CrewTodo } from "@/lib/crew-todo";
import { formatDateTime } from "@/lib/format";
import { optimisticResolveMyEventMedia } from "@/lib/crew-portal-optimistic";
import { cn } from "@/lib/utils";

const CARD_HEIGHT = "h-80";
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const LONG_TEXT = "wrap-anywhere";

/** Saves with the card still up, so a failure leaves it and anything typed in place. */
type Commit = (work: () => Promise<unknown>, fallback: string) => void;

function TodoCard({
  icon: IconGlyph,
  eyebrow,
  title,
  onLater,
  laterDisabled,
  error,
  children,
}: {
  icon: Icon;
  eyebrow: string;
  title: string;
  onLater: () => void;
  laterDisabled: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <Card data-testid="crew-todo-card">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              <IconGlyph className="size-3.5 shrink-0" aria-hidden />
              <span className={cn("min-w-0", LONG_TEXT)}>{eyebrow}</span>
            </p>
            <h3 className={cn("text-lg font-semibold", LONG_TEXT)}>{title}</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="-mt-1 -mr-2 h-10 shrink-0"
            disabled={laterDisabled}
            onClick={onLater}
          >
            Later
          </Button>
        </div>
        {children}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

const ANSWER_BUTTON = "h-10 w-full sm:w-auto";

function AvailabilityCard({ night, saving, commit }: { night: Night; saving: boolean; commit: Commit }) {
  const answerNight = useMutation(api.crewNights.answerNight);
  const [partOpen, setPartOpen] = useState(false);
  const notes = night.answer?.notes ?? "";
  const suggested = night.answer ? null : usualSuggestion(night);

  function answer(choice: NightChoice, windows?: TimeWindow[], noteText = notes) {
    commit(() => answerNight(nightAnswerArgs(night.nightKey, choice, windows, noteText)), "Couldn't save your answer.");
  }

  const free = (
    <Button
      key="free"
      type="button"
      variant={suggested === "no" ? "outline" : "default"}
      className={ANSWER_BUTTON}
      disabled={saving}
      onClick={() => answer("free")}
    >
      {suggested === "free" ? "Confirm" : "I'm free"}
    </Button>
  );
  const no = (
    <Button
      key="no"
      type="button"
      variant={suggested === "no" ? "default" : "outline"}
      className={ANSWER_BUTTON}
      disabled={saving}
      onClick={() => answer("no")}
    >
      Not this one
    </Button>
  );

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium tabular-nums">{formatWindow(night)}</p>
          {suggested ? (
            <span className={cn("max-w-full rounded-md border px-2 py-0.5 text-xs", usualChipClass(night.usual!))}>
              You&apos;re {suggested === "free" ? "usually" : "rarely"} free {nightWeekdayPlural(night.nightKey)}
            </span>
          ) : null}
        </div>
        <NightFacts night={night} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {suggested === "no" ? no : free}
        <Button
          type="button"
          variant="outline"
          className={ANSWER_BUTTON}
          aria-expanded={partOpen}
          disabled={saving}
          onClick={() => setPartOpen((open) => !open)}
        >
          Only part
        </Button>
        <Button type="button" variant="outline" className={ANSWER_BUTTON} disabled={saving} onClick={() => answer("backup")}>
          Backup
        </Button>
        {night.earlySetup.length > 0 ? (
          <Button type="button" variant="outline" className={ANSWER_BUTTON} disabled={saving} onClick={() => answer("early")}>
            Early setup only
          </Button>
        ) : null}
        {suggested === "no" ? free : no}
      </div>

      {partOpen ? (
        <NightPartForm
          night={night}
          savedWindows={[]}
          saving={saving}
          onSave={(windows, busyNotes) => answer("part", windows, mergeBusyNotes(notes, busyNotes))}
        />
      ) : null}
    </>
  );
}

function ReviewCard({ row }: { row: PostEventWorkRow }) {
  const submit = useMutation(api.postMortemFeedback.submitForEvent);
  return (
    <PostMortemForm
      submitLabel="Submit review"
      onSubmit={async (values) => {
        await submit({
          eventId: row.eventId,
          rating: values.rating,
          whatWentWell: values.whatWentWell.trim(),
          whatCouldImprove: values.whatCouldImprove.trim(),
        });
      }}
    />
  );
}

function PhotosCard({
  row,
  resolved,
  saving,
  commit,
  onUploadingChange,
  onBatchDone,
  onFinish,
}: {
  row: PostEventWorkRow;
  /** The first uploaded file resolves the row, while the rest of the batch is still going. */
  resolved: boolean;
  saving: boolean;
  commit: Commit;
  onUploadingChange: (uploading: boolean) => void;
  onBatchDone: () => void;
  onFinish: () => void;
}) {
  const resolveMedia = useMutation(api.crewPortal.resolveMyEventMedia).withOptimisticUpdate(
    optimisticResolveMyEventMedia,
  );
  const album = useMediaAlbum({ targetType: "event", targetId: row.eventId });
  const [uploading, setUploading] = useState(false);

  return (
    <>
      <MediaUploadDropzone
        targetType="event"
        targetId={row.eventId}
        disabled={!album.ready}
        onBatchChange={(state) => {
          setUploading(state === "uploading");
          onUploadingChange(state === "uploading");
          if (state === "done") onBatchDone();
        }}
      />
      {album.error ? <p className="text-sm text-destructive">{album.error}</p> : null}
      {resolved ? (
        <Button type="button" className={ANSWER_BUTTON} disabled={uploading} onClick={onFinish}>
          Done
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={ANSWER_BUTTON}
          disabled={uploading || saving}
          onClick={() =>
            commit(() => resolveMedia({ eventId: row.eventId, status: "no_media" }), "Couldn't save that.")
          }
        >
          No photos or videos
        </Button>
      )}
    </>
  );
}

function eyebrowOf(todo: CrewTodo, now: number) {
  switch (todo.kind) {
    case "availability":
      // Drops the year from "Fri, Nov 6, 2026".
      return `Availability · ${nightDateLabel(todo.night.nightKey).split(", ").slice(0, 2).join(", ")}`;
    case "review":
      return `Review · Ended ${endedLabel(todo.row.endAt, now)}`;
    case "photos":
      return `Photos · ${todo.row.title}`;
  }
}

function titleOf(todo: CrewTodo) {
  switch (todo.kind) {
    case "availability":
      return "Can you work this night?";
    case "review":
      return `How did ${todo.row.title} go?`;
    case "photos":
      return "Got photos or videos?";
  }
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn("h-1 min-w-0 flex-1", index < done ? "bg-primary" : index === done ? "bg-primary/40" : "bg-muted")}
        />
      ))}
    </div>
  );
}

function CaughtUp({ nextShift }: { nextShift?: { title: string; startAt: number } }) {
  return (
    <div
      className="flex flex-col items-center gap-2 border border-dashed px-4 py-10 text-center"
      data-testid="crew-todo-empty"
    >
      <CheckIcon className="size-5 text-status-emerald-700 dark:text-status-emerald-300" weight="bold" aria-hidden />
      <p className="font-medium">All caught up</p>
      {nextShift ? (
        <p className={cn("text-sm text-muted-foreground", LONG_TEXT)}>
          Next shift {formatDateTime(nextShift.startAt)} · {nextShift.title}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Home's to-do: one card, one decision. Answers go through the same mutations
 * as My Availability and My post-event work, so a card leaves when its source
 * query says it's done. `collapsed` folds it to a tile while a shift is on; undefined while that's unknown.
 */
export function CrewTodoStack({ now, collapsed }: { now: number; collapsed: boolean | undefined }) {
  const nights = useHeldQuery(api.crewNights.listMine, { now, weeksAhead: DEFAULT_AVAILABILITY_WEEKS });
  const rows = useHeldQuery(api.crewPortal.listMyPostEventWork, { now });
  const upcoming = useHeldQuery(api.crewPortal.listMyScheduledEvents, { now, weeksAhead: 8 });
  const reduceMotion = useReducedMotion();

  const [deferred, setDeferred] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [held, setHeld] = useState<CrewTodo | null>(null);
  const [heldUploading, setHeldUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (expanded && collapsed === false) setExpanded(false);
  const [seen, setSeen] = useState<string[]>([]);

  const todos = useMemo(
    () => (nights && rows ? buildCrewTodos(nights, rows, deferred) : null),
    [nights, rows, deferred],
  );

  const cards = useMemo(() => {
    if (!todos) return null;
    const open = todos.filter((todo) => todo.key !== held?.key);
    return held ? [held, ...open] : open;
  }, [todos, held]);

  // A card seen this visit and no longer open is a done card, however it left:
  // the total then can't jump, whether a save or the query removed it first.
  const unseen = cards?.filter((card) => !seen.includes(card.key)) ?? [];
  if (unseen.length > 0) setSeen([...seen, ...unseen.map((card) => card.key)]);

  const top = cards?.[0];
  const topKey = top?.key;
  const stackRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const previousTop = useRef(topKey);
  useEffect(() => {
    const previous = previousTop.current;
    previousTop.current = topKey;
    if (!previous || !topKey || previous === topKey || !topRef.current) return;
    // A card can change from another device; don't pull someone out of what they're using.
    const active = document.activeElement;
    if (active && active !== document.body && !stackRef.current?.contains(active)) return;
    topRef.current.focus({ preventScroll: true });
    if (topRef.current.getBoundingClientRect().top < 0) {
      topRef.current.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [topKey, reduceMotion]);

  if (!cards || collapsed === undefined) return <Skeleton className={cn(CARD_HEIGHT, "w-full")} data-testid="crew-todo-loading" />;

  if (collapsed && !expanded) {
    if (cards.length === 0) return null;
    return (
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border bg-card p-4 text-left active:bg-muted/40"
        data-testid="crew-todo-tile"
        onClick={() => setExpanded(true)}
      >
        <span>
          <span className="block font-medium tabular-nums">{cards.length} to do</span>
          <span className="block text-sm text-muted-foreground">After your shift</span>
        </span>
        <CaretRightIcon className="size-4 text-muted-foreground" weight="bold" aria-hidden />
      </button>
    );
  }

  const done = seen.filter((key) => !cards.some((card) => card.key === key)).length;
  const total = done + cards.length;

  function commit(key: string, work: () => Promise<unknown>, fallback: string) {
    setErrors(({ [key]: _cleared, ...rest }) => rest);
    setSaving((current) => [...current, key]);
    void (async () => {
      try {
        await work();
      } catch (error) {
        setErrors((current) => ({ ...current, [key]: getConvexErrorMessage(error, fallback) }));
      } finally {
        setSaving((current) => current.filter((savingKey) => savingKey !== key));
      }
    })();
  }

  function later(key: string) {
    setHeld(null);
    setErrors(({ [key]: _cleared, ...rest }) => rest);
    setDeferred((current) => [...current.filter((deferredKey) => deferredKey !== key), key]);
  }

  function renderCard(todo: CrewTodo) {
    const commitTodo: Commit = (work, fallback) => {
      setHeld(null);
      commit(todo.key, work, fallback);
    };
    return (
      <TodoCard
        icon={todo.kind === "availability" ? CalendarCheckIcon : ClipboardTextIcon}
        eyebrow={eyebrowOf(todo, now)}
        title={titleOf(todo)}
        onLater={() => later(todo.key)}
        laterDisabled={cards!.length < 2 || heldUploading || saving.includes(todo.key)}
        error={errors[todo.key]}
      >
        {todo.kind === "availability" ? (
          <AvailabilityCard night={todo.night} saving={saving.includes(todo.key)} commit={commitTodo} />
        ) : todo.kind === "review" ? (
          <ReviewCard row={todo.row} />
        ) : (
          <PhotosCard
            row={todo.row}
            resolved={!todos?.some((candidate) => candidate.key === todo.key)}
            saving={saving.includes(todo.key)}
            commit={commitTodo}
            onUploadingChange={(uploading) => {
              setHeldUploading(uploading);
              if (uploading) setHeld(todo);
            }}
            onBatchDone={() => setHeld(null)}
            onFinish={() => setHeld(null)}
          />
        )}
      </TodoCard>
    );
  }

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT };

  return (
    <section ref={stackRef} className="space-y-3" aria-label="To do" data-testid="crew-todo-stack">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">To do</h2>
          {total > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="crew-todo-count">
              {Math.min(done + 1, total)} of {total}
            </p>
          ) : null}
        </div>
        {total > 0 ? <Progress done={done} total={total} /> : null}
      </div>

      {top ? (
        <div className={cn("relative", cards.length > 2 ? "pb-3" : cards.length > 1 ? "pb-1.5" : undefined)}>
          {cards.length > 2 ? (
            <div className="absolute inset-x-4 top-3 bottom-0 border bg-card/60" data-testid="crew-todo-ghost" aria-hidden />
          ) : null}
          {cards.length > 1 ? (
            <div
              className={cn("absolute inset-x-2 top-1.5 border bg-card", cards.length > 2 ? "bottom-1.5" : "bottom-0")}
              data-testid="crew-todo-ghost"
              aria-hidden
            />
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={top.key}
              ref={topRef}
              tabIndex={-1}
              className="relative scroll-mt-20 outline-none"
              initial={{ opacity: 0.4, transform: "translateY(12px) scale(0.97)" }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              exit={{ opacity: 0, transform: "translateY(-12px) scale(1)", pointerEvents: "none" }}
              transition={transition}
            >
              {renderCard(top)}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <CaughtUp nextShift={upcoming?.[0]} />
      )}
    </section>
  );
}
