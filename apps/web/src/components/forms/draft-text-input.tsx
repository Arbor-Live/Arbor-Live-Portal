"use client";

import { startTransition, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Text over a large draft (the event workspace) that echoes keystrokes from
 * local state and hands each edit to the draft as a transition. Every draft
 * change re-renders the whole page; as a transition React drops that work for
 * the next keystroke instead of blocking the field.
 */
export function useDraftText(value: string, onCommit: (value: string) => void) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // Adopt outside changes (discard, server rebase).
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  function change(next: string) {
    setText(next);
    startTransition(() => onCommit(next));
  }
  // Blur fires before a Save click lands, so a commit still pending as a
  // transition reaches the draft first.
  function flush() {
    if (text !== value) onCommit(text);
  }
  return [text, change, flush] as const;
}

type DraftProps<T> = Omit<T, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

export function DraftTextInput({ value, onCommit, onBlur, ...props }: DraftProps<ComponentProps<typeof Input>>) {
  const [text, change, flush] = useDraftText(value, onCommit);
  return (
    <Input
      {...props}
      value={text}
      onChange={(event) => change(event.target.value)}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}

export function DraftTextarea({ value, onCommit, onBlur, ...props }: DraftProps<ComponentProps<typeof Textarea>>) {
  const [text, change, flush] = useDraftText(value, onCommit);
  return (
    <Textarea
      {...props}
      value={text}
      onChange={(event) => change(event.target.value)}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}
