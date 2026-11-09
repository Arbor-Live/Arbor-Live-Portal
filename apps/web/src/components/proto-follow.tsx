"use client";

/**
 * PROTOTYPE ONLY (prototype/follow-records). Mock state; nothing here talks to
 * Convex. `?variant=1|2|3` on a booking request, invoice or event switches how
 * staff follow it.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BellIcon, BellRingingIcon, BellSlashIcon } from "@phosphor-icons/react";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type ProtoVariant = 1 | 2 | 3;
const PROTO_VARIANTS: { id: ProtoVariant; name: string }[] = [
  { id: 1, name: "Button" },
  { id: 2, name: "Bell" },
  { id: 3, name: "Menu" },
];

export type FollowKind = "request" | "invoice" | "event";
const NOUN: Record<FollowKind, string> = { request: "request", invoice: "quote", event: "event" };

/* ---------------------------------- store --------------------------------- */

const following = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function toggle(key: string) {
  if (following.has(key)) following.delete(key);
  else following.add(key);
  version += 1;
  for (const listener of listeners) listener();
}
function useFollowing(key: string) {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return following.has(key);
}

/** Mock: one teammate already follows every record. */
const OTHER_FOLLOWERS = [{ name: "Ana Ruiz", role: "Operations" }];

/* --------------------------------- variants -------------------------------- */

function useFollowToggle(recordKey: string, kind: FollowKind) {
  const isFollowing = useFollowing(recordKey);
  const flip = () => {
    toggle(recordKey);
    notify.success(isFollowing ? `Unfollowed this ${NOUN[kind]}` : `Following this ${NOUN[kind]}`);
  };
  return { isFollowing, flip };
}

function FollowButton({ recordKey, kind }: { recordKey: string; kind: FollowKind }) {
  const { isFollowing, flip } = useFollowToggle(recordKey, kind);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={isFollowing}
      onClick={flip}
      data-testid="follow-button"
    >
      {isFollowing ? <BellRingingIcon weight="fill" className="text-primary" /> : <BellIcon />}
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}

function FollowBell({
  recordKey,
  kind,
  managerName,
}: {
  recordKey: string;
  kind: FollowKind;
  managerName?: string;
}) {
  const { isFollowing, flip } = useFollowToggle(recordKey, kind);
  const people = [
    ...(managerName ? [{ name: managerName, role: "Manager" }] : []),
    ...OTHER_FOLLOWERS,
    ...(isFollowing ? [{ name: "You", role: "Following" }] : []),
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={isFollowing ? "Following" : "Follow"}
          data-testid="follow-bell"
        >
          {isFollowing ? <BellRingingIcon weight="fill" className="text-primary" /> : <BellIcon />}
          <span className="tabular-nums">{people.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <label className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium">
          Follow this {NOUN[kind]}
          <Switch checked={isFollowing} onCheckedChange={flip} />
        </label>
        <ul className="border-t py-1.5 text-sm">
          {people.map((person) => (
            <li key={person.name} className="flex items-center justify-between gap-3 px-3 py-1">
              <span className={cn(person.name === "You" && "font-medium")}>{person.name}</span>
              <span className="text-xs text-muted-foreground">{person.role}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function FollowMenuItem({ recordKey, kind }: { recordKey: string; kind: FollowKind }) {
  const { isFollowing, flip } = useFollowToggle(recordKey, kind);
  return (
    <>
      <DropdownMenuItem onSelect={flip} data-testid="follow-menu-item">
        {isFollowing ? <BellSlashIcon /> : <BellIcon />}
        {isFollowing ? "Unfollow" : "Follow"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}

function FollowPill({ recordKey }: { recordKey: string }) {
  const isFollowing = useFollowing(recordKey);
  if (!isFollowing) return null;
  return (
    <StatusPill tone="blue" dot={false}>
      <BellRingingIcon weight="fill" className="size-3" aria-hidden />
      Following
    </StatusPill>
  );
}

/* ---------------------------------- hook ---------------------------------- */

/**
 * Slots for a record header. `action` also mounts the variant picker, so pass
 * it on every page; `menuItem`/`pill` are only filled on the Menu variant.
 */
export function useProtoFollow(recordKey: string, kind: FollowKind, managerName?: string) {
  const raw = Number(useSearchParams().get("variant"));
  const variant: ProtoVariant = raw === 2 || raw === 3 ? raw : 1;
  const picker = <ProtoPicker variant={variant} />;
  return {
    variant,
    action: (
      <>
        {picker}
        {variant === 1 ? <FollowButton recordKey={recordKey} kind={kind} /> : null}
        {variant === 2 ? <FollowBell recordKey={recordKey} kind={kind} managerName={managerName} /> : null}
      </>
    ),
    menuItem: variant === 3 ? <FollowMenuItem recordKey={recordKey} kind={kind} /> : null,
    pill: variant === 3 ? <FollowPill recordKey={recordKey} /> : null,
  };
}

/* --------------------------------- picker --------------------------------- */

const PICKER_CSS = `
.proto-picker{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;display:flex;gap:2px;padding:4px;border-radius:9999px;background:rgba(20,20,20,.88);backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,.25);font:500 13px/1 system-ui,sans-serif}
.proto-picker-highlight{position:absolute;top:4px;bottom:4px;left:0;border-radius:9999px;background:rgba(255,255,255,.16)}
.proto-picker[data-ready] .proto-picker-highlight{transition:transform 200ms cubic-bezier(.2,0,0,1),width 200ms cubic-bezier(.2,0,0,1)}
.proto-picker-item{position:relative;padding:8px 14px;border-radius:9999px;color:rgba(255,255,255,.65);background:none;border:0;cursor:pointer}
.proto-picker-item[data-active]{color:#fff}
`;

function ProtoPicker({ variant }: { variant: ProtoVariant }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const nav = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  const go = (id: ProtoVariant) => {
    const next = new URLSearchParams(params.toString());
    next.set("variant", String(id));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-variant="${variant}"]`);
    if (el && highlight.current) {
      highlight.current.style.width = `${el.offsetWidth}px`;
      highlight.current.style.transform = `translateX(${el.offsetLeft}px)`;
    }
  }, [variant]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const num = Number(event.key);
      if (num >= 1 && num <= 3) go(num as ProtoVariant);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  });

  return (
    <>
      <style>{PICKER_CSS}</style>
      <nav ref={nav} className="proto-picker" aria-label="Prototype variants" data-ready={ready ? "" : undefined}>
        <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
        {PROTO_VARIANTS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className="proto-picker-item"
            data-variant={id}
            data-active={id === variant ? "" : undefined}
            aria-current={id === variant ? "true" : undefined}
            onClick={() => go(id)}
          >
            {name}
          </button>
        ))}
      </nav>
    </>
  );
}
