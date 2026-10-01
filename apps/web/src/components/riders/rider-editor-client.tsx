"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { CaretDownIcon, WarningIcon } from "@phosphor-icons/react";
import {
  backfillSourceKeys,
  channelSpan,
  renumberInputs,
  riderWarnings,
  snapStageFt,
  type RiderContent,
} from "@arbor/rider-document";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  RIDER_EDITOR_TAB_ICONS,
  RIDER_EDITOR_TAB_LABELS,
  RIDER_EDITOR_TABS,
  riderEditorTabFromParam,
  riderEditorTabHref,
  type RiderEditorTabId,
} from "@/lib/rider-editor-tabs";
import type { SaveStatus } from "@/hooks/use-convex-form";
import { FormSaveBar } from "@/components/forms";
import {
  EditablePageTitle,
  PageHeader,
  PageTabs,
  StatusPill,
} from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { RiderPdfDownloadButton } from "@/components/riders/rider-pdf-download-button";
import { RiderStagePanel } from "@/components/riders/rider-stage-panel";
import { RiderInputsPanel } from "@/components/riders/rider-inputs-panel";
import { RiderMonitorsPanel } from "@/components/riders/rider-monitors-panel";
import { RiderBacklinePanel } from "@/components/riders/rider-backline-panel";
import { RiderDetailsPanel } from "@/components/riders/rider-details-panel";

type Draft = {
  name: string;
  status: "draft" | "published";
  content: RiderContent;
};

function contentFromRider(rider: {
  stage: RiderContent["stage"];
  items: RiderContent["items"];
  inputs: RiderContent["inputs"];
  monitorMixes: RiderContent["monitorMixes"];
  backline: RiderContent["backline"];
  performerCount?: number;
  setLengthMinutes?: number;
  powerNotes?: string;
  generalNotes?: string;
  hospitalityNotes?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}): RiderContent {
  // Riders written before the source vocabulary carry no `sourceKey`, so resolve
  // what we can on the way in, and number channels in list order (older riders
  // were numbered onto odd pairs). Both the draft and its baseline are built
  // from this, so a rider doesn't open dirty; both persist on the next save.
  const content = backfillSourceKeys({
    stage: rider.stage,
    items: rider.items,
    inputs: rider.inputs,
    monitorMixes: rider.monitorMixes,
    backline: rider.backline,
    performerCount: rider.performerCount,
    setLengthMinutes: rider.setLengthMinutes,
    powerNotes: rider.powerNotes,
    generalNotes: rider.generalNotes,
    hospitalityNotes: rider.hospitalityNotes,
    contactName: rider.contactName,
    contactEmail: rider.contactEmail,
    contactPhone: rider.contactPhone,
  });
  return { ...content, inputs: renumberInputs(content.inputs) };
}

const EMPTY_HISTORY = { past: [], future: [] };
const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 1500;

function draftKey(draft: Draft): string {
  return JSON.stringify(draft);
}

/** The slice of the rider each tab edits, so a tab can show its own unsaved dot. */
const TAB_SLICES: Record<RiderEditorTabId, (content: RiderContent) => unknown> = {
  stage: (content) => [content.stage, content.items],
  inputs: (content) => content.inputs,
  monitors: (content) => content.monitorMixes,
  backline: (content) => content.backline,
  details: (content) => [
    content.performerCount,
    content.setLengthMinutes,
    content.contactName,
    content.contactEmail,
    content.contactPhone,
    content.powerNotes,
    content.generalNotes,
    content.hospitalityNotes,
  ],
};

export function RiderEditorClient({ riderId }: { riderId: Id<"bandRiders"> }) {
  const rider = useQuery(api.bandRiders.get, { riderId });
  const updateRider = useMutation(api.bandRiders.update);
  const setDefault = useMutation(api.bandRiders.setDefault);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = riderEditorTabFromParam(searchParams.get("tab"));

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The draft as of the last change, so several changes in one event compose. */
  const draftRef = useRef<Draft | null>(null);
  const [history, setHistory] = useState<{ past: RiderContent[]; future: RiderContent[] }>(
    EMPTY_HISTORY,
  );
  /** What the last change was, so a drag or a typed word is one undo step, not fifty. */
  const lastChangeRef = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });

  function commitDraft(next: Draft) {
    draftRef.current = next;
    setDraft(next);
  }

  function resetDraft(next: Draft) {
    commitDraft(next);
    setBaseline(next);
    setHistory(EMPTY_HISTORY);
    lastChangeRef.current = { key: null, at: 0 };
  }

  useEffect(() => {
    if (!rider) return;
    if (hydratedId === rider._id && draft !== null) return;
    const next: Draft = {
      name: rider.name,
      status: rider.status,
      content: contentFromRider(rider),
    };
    draftRef.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate per rider id
    setDraft(next);
    setBaseline(next);
    setHistory(EMPTY_HISTORY);
    setHydratedId(rider._id);
  }, [rider, hydratedId, draft]);

  const isDirty = draft !== null && baseline !== null && draftKey(draft) !== draftKey(baseline);
  const readOnly = rider?.canEdit === false;
  const warnings = useMemo(() => (draft ? riderWarnings(draft.content) : []), [draft]);

  const dirtyTabs = useMemo(() => {
    const dirty = new Set<RiderEditorTabId>();
    if (!draft || !baseline) return dirty;
    for (const tab of RIDER_EDITOR_TABS) {
      const slice = TAB_SLICES[tab];
      if (JSON.stringify(slice(draft.content)) !== JSON.stringify(slice(baseline.content))) {
        dirty.add(tab);
      }
    }
    return dirty;
  }, [draft, baseline]);

  /**
   * Every edit goes through here. Changes sharing a `historyKey` within a
   * moment of each other (a drag, typing in one field) collapse into one undo
   * step; changes without a key are always their own step.
   */
  function patchContent(
    updater: (content: RiderContent) => RiderContent,
    historyKey?: string,
  ) {
    const current = draftRef.current;
    if (!current) return;
    const content = updater(current.content);
    if (content === current.content) return;
    const now = Date.now();
    const last = lastChangeRef.current;
    const continues =
      historyKey !== undefined && historyKey === last.key && now - last.at < HISTORY_COALESCE_MS;
    lastChangeRef.current = { key: historyKey ?? null, at: now };
    setHistory((previous) => ({
      past: continues ? previous.past : [...previous.past, current.content].slice(-HISTORY_LIMIT),
      future: [],
    }));
    commitDraft({ ...current, content });
  }

  function undo() {
    const current = draftRef.current;
    const previous = history.past.at(-1);
    if (!current || !previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [current.content, ...history.future] });
    lastChangeRef.current = { key: null, at: 0 };
    commitDraft({ ...current, content: previous });
  }

  function redo() {
    const current = draftRef.current;
    const next = history.future[0];
    if (!current || !next) return;
    setHistory({ past: [...history.past, current.content], future: history.future.slice(1) });
    lastChangeRef.current = { key: null, at: 0 };
    commitDraft({ ...current, content: next });
  }

  // ⌘Z / ⇧⌘Z (Ctrl on other platforms), except while typing, where the field's
  // own undo should win.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });
  useEffect(() => {
    if (readOnly) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redoRef.current();
      else undoRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readOnly]);

  function selectTab(tab: RiderEditorTabId) {
    // Next keeps `useSearchParams` in sync with history calls, so this switches
    // tabs without a server round trip or remounting the draft.
    window.history.pushState(null, "", riderEditorTabHref(pathname, tab));
  }

  /** From the stage: open one channel's panel in the Inputs tab. */
  function openChannel(inputId: string) {
    window.history.pushState(
      null,
      "",
      `${riderEditorTabHref(pathname, "inputs")}&channel=${encodeURIComponent(inputId)}`,
    );
  }

  async function persist(overrides?: Partial<Draft>) {
    if (!draft || readOnly) return;
    const next: Draft = {
      ...draft,
      ...overrides,
      content: {
        ...draft.content,
        stage: {
          widthFt: snapStageFt(draft.content.stage.widthFt),
          depthFt: snapStageFt(draft.content.stage.depthFt),
        },
      },
    };
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await updateRider({
        riderId,
        name: next.name,
        status: next.status,
        content: next.content,
      });
      commitDraft(next);
      setBaseline(next);
      setSaveStatus("saved");
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => {
        setSaveStatus((status) => (status === "saved" ? "idle" : status));
      }, 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(getConvexErrorMessage(err));
    }
  }

  function discard() {
    if (!rider) return;
    const next: Draft = {
      name: rider.name,
      status: rider.status,
      content: contentFromRider(rider),
    };
    resetDraft(next);
    setSaveStatus("idle");
    setSaveError(null);
  }

  async function makeDefault() {
    try {
      await setDefault({ riderId });
      notify.success("Show files will use this rider by default.");
    } catch (err) {
      notify.error(getConvexErrorMessage(err));
    }
  }

  if (rider === undefined || draft === null) {
    return (
      <div className="space-y-4" data-testid="rider-editor-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const { content } = draft;
  const channelCount = content.inputs.reduce((count, input) => count + channelSpan(input), 0);
  const published = draft.status === "published";

  const tabBadges: Partial<Record<RiderEditorTabId, React.ReactNode>> = {
    stage:
      content.items.length === 0 ? (
        <TabWarning title="The stage plot is empty" />
      ) : null,
    inputs:
      content.inputs.length === 0 ||
      content.inputs.some((input) => !input.source.trim() || !input.sourceKey) ? (
        <>
          <TabWarning title="Some channels need a source" />
          <TabCount count={channelCount} />
        </>
      ) : (
        <TabCount count={channelCount} />
      ),
    monitors:
      content.monitorMixes.length === 0 ? (
        <TabWarning title="No monitor mixes yet" />
      ) : (
        <TabCount count={content.monitorMixes.length} />
      ),
    backline: content.backline.length > 0 ? <TabCount count={content.backline.length} /> : null,
  };

  const panelProps = { content, readOnly, onChange: patchContent };
  const historyControls = {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
  };

  return (
    <div className="space-y-4" data-testid="rider-editor">
      <PageHeader
        back={{ href: "/dashboard/artists/riders", label: "Riders" }}
        actions={
          <>
            <RiderPdfDownloadButton riderId={riderId} label="PDF" />
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant={published ? "outline" : "default"}
                onClick={() => void persist({ status: published ? "draft" : "published" })}
              >
                {published ? "Unpublish" : "Publish"}
              </Button>
            ) : null}
          </>
        }
        menu={
          !readOnly && !rider.isDefault ? (
            <DropdownMenuItem onSelect={() => void makeDefault()}>
              Use as default for show files
            </DropdownMenuItem>
          ) : undefined
        }
        pills={
          <>
            <StatusPill tone={published ? "emerald" : "neutral"}>
              {published ? "Published" : "Draft"}
            </StatusPill>
            {rider.isDefault ? <StatusPill tone="blue">Default for show files</StatusPill> : null}
            {readOnly ? (
              <StatusPill tone="neutral" dot={false}>
                View only
              </StatusPill>
            ) : null}
          </>
        }
        title={
          readOnly ? (
            draft.name
          ) : (
            <EditablePageTitle
              id="rider-editor-name"
              label="Rider name"
              placeholder="Technical rider"
              maxLength={80}
              value={draft.name}
              onChange={(name) => {
                if (draftRef.current) commitDraft({ ...draftRef.current, name });
              }}
            />
          )
        }
        description="Place gear on the stage and the input list and monitor mixes fill in as you go. The PDF uses the last saved version."
      >
        {warnings.length > 0 ? <RiderChecklist warnings={warnings} /> : null}
      </PageHeader>

      <PageTabs
        label="Rider sections"
        tabs={RIDER_EDITOR_TABS.map((tab) => ({
          href: riderEditorTabHref(pathname, tab),
          label: RIDER_EDITOR_TAB_LABELS[tab],
          icon: RIDER_EDITOR_TAB_ICONS[tab],
          active: tab === activeTab,
          badge: tabBadges[tab],
          dirty: dirtyTabs.has(tab),
          onSelect: () => selectTab(tab),
        }))}
      />

      {activeTab === "stage" ? <RiderStagePanel {...panelProps} history={historyControls} onOpenChannel={openChannel} /> : null}
      {activeTab === "inputs" ? <RiderInputsPanel {...panelProps} /> : null}
      {activeTab === "monitors" ? <RiderMonitorsPanel {...panelProps} /> : null}
      {activeTab === "backline" ? <RiderBacklinePanel {...panelProps} /> : null}
      {activeTab === "details" ? <RiderDetailsPanel {...panelProps} /> : null}

      {!readOnly ? (
        <FormSaveBar
          tier="C"
          saveStatus={saveStatus}
          saveError={saveError}
          isDirty={isDirty}
          saveLabel="Save rider"
          onSave={() => void persist()}
          onDiscard={discard}
          onRetry={() => void persist()}
          summary={
            dirtyTabs.size > 0 ? (
              <span className="text-xs text-muted-foreground">
                Unsaved: {[...dirtyTabs].map((tab) => RIDER_EDITOR_TAB_LABELS[tab]).join(" · ")}
              </span>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}

function TabCount({ count }: { count: number }) {
  return <span className="bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>;
}

function TabWarning({ title }: { title: string }) {
  return (
    <span className="inline-flex text-status-amber-700 dark:text-status-amber-200" title={title}>
      <WarningIcon className="size-3.5" weight="fill" aria-label={title} />
    </span>
  );
}

/** The publish checklist, folded to one line so it doesn't push the editor off small screens. */
function RiderChecklist({ warnings }: { warnings: string[] }) {
  return (
    <Collapsible
      className="border border-status-amber-500/40 bg-status-amber-500/10 text-sm"
      data-testid="rider-checklist"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-status-amber-700 dark:text-status-amber-200">
        <WarningIcon className="size-4 shrink-0" weight="fill" aria-hidden />
        <span className="flex-1">
          {warnings.length === 1
            ? "1 thing to check before you publish"
            : `${warnings.length} things to check before you publish`}
        </span>
        <CaretDownIcon
          className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="list-disc space-y-0.5 pr-3 pb-2.5 pl-9 text-foreground">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
