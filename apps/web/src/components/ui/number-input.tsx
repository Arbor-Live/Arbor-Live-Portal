"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"

type NumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "min" | "max" | "defaultValue"
> & {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  /** Used when the field is left empty or unreadable. Defaults to `min`, else 0. */
  fallback?: number
  /** Applied to every committed value (e.g. wrap an angle into 0–359). */
  normalize?: (value: number) => number
}

/**
 * A number field you can clear and retype. The text you type stays as typed;
 * only values inside `min`/`max` are committed while typing, and on blur an
 * empty or out-of-range entry snaps to `fallback` or the nearest bound.
 *
 * Use this instead of clamping in `onChange` (`Math.max(5, Number(v) || 5)`),
 * which rewrites the field on every keystroke so it can't be cleared.
 */
function NumberInput({
  value,
  onValueChange,
  min,
  max,
  fallback,
  normalize,
  onBlur,
  ...props
}: NumberInputProps) {
  // Null while not editing, so the field follows `value` from outside.
  const [draft, setDraft] = React.useState<string | null>(null)

  function commit(next: number) {
    onValueChange(normalize ? normalize(next) : next)
  }

  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      value={draft ?? (Number.isFinite(value) ? String(value) : "")}
      onChange={(event) => {
        const text = event.target.value
        setDraft(text)
        const parsed = Number(text)
        if (text.trim() === "" || !Number.isFinite(parsed)) return
        if (min !== undefined && parsed < min) return
        if (max !== undefined && parsed > max) return
        commit(parsed)
      }}
      onBlur={(event) => {
        if (draft !== null) {
          const parsed = Number(draft)
          const base =
            draft.trim() === "" || !Number.isFinite(parsed) ? (fallback ?? min ?? 0) : parsed
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, base))
          commit(clamped)
          setDraft(null)
        }
        onBlur?.(event)
      }}
    />
  )
}

export { NumberInput }
