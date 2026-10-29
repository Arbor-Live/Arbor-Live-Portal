"use client";

import { startTransition, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/**
 * A text field over a large draft (the event workspace) that echoes keystrokes
 * from local state and hands each edit to the draft as a transition. Every
 * draft change re-renders the whole page; as a transition React drops that
 * work for the next keystroke instead of blocking the field.
 */
export function DraftTextInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // Adopt outside changes (discard, server rebase).
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  return (
    <Input
      {...props}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        startTransition(() => onCommit(next));
      }}
    />
  );
}
