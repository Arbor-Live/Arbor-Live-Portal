"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { Toaster as Sonner, toast, useSonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon, XIcon } from "@phosphor-icons/react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

const TOAST_INSET = 16
const DISMISS_ALL_GAP = 8

type DismissAllAnchor = {
  top: number
  right: number
  width: number
}

function measureDismissAllAnchor(): DismissAllAnchor | null {
  const nodes = document.querySelectorAll<HTMLElement>(
    "[data-sonner-toast][data-mounted='true'][data-visible='true']",
  )
  if (nodes.length < 2) return null

  let bottom = 0
  let right = 0
  let width = 0
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    bottom = Math.max(bottom, rect.bottom)
    right = window.innerWidth - rect.right
    width = rect.width
  }
  if (bottom <= 0 || width <= 0) return null
  return { top: bottom + DISMISS_ALL_GAP, right, width }
}

function DismissAllButton({ visible }: { visible: boolean }) {
  const [anchor, setAnchor] = useState<DismissAllAnchor | null>(null)

  useEffect(() => {
    if (!visible) {
      setAnchor(null)
      return
    }

    let frame = 0
    const loop = () => {
      const next = measureDismissAllAnchor()
      setAnchor((prev) => {
        if (prev == null && next == null) return prev
        if (
          prev &&
          next &&
          prev.top === next.top &&
          prev.right === next.right &&
          prev.width === next.width
        ) {
          return prev
        }
        return next
      })
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [visible])

  if (!visible || !anchor) return null

  return (
    <div
      className="pointer-events-none fixed z-[1000000000]"
      style={{ top: anchor.top, right: anchor.right, width: anchor.width }}
    >
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="pointer-events-auto w-full bg-popover"
        onClick={() => toast.dismiss()}
      >
        Dismiss all
      </Button>
    </div>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const { toasts } = useSonner()
  const showDismissAll = toasts.length >= 2

  return (
    <>
      <DismissAllButton visible={showDismissAll} />
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group font-sans"
        position="top-right"
        closeButton
        offset={TOAST_INSET}
        icons={{
          success: (
            <CheckCircleIcon className="size-4" />
          ),
          info: (
            <InfoIcon className="size-4" />
          ),
          warning: (
            <WarningIcon className="size-4" />
          ),
          error: (
            <XCircleIcon className="size-4" />
          ),
          loading: (
            <SpinnerIcon className="size-4 animate-spin" />
          ),
          close: (
            <XIcon className="size-3.5" />
          ),
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "0px",
          } as CSSProperties
        }
        toastOptions={{
          closeButtonAriaLabel: "Dismiss",
          classNames: {
            toast: "rounded-none font-sans shadow-md ring-1 ring-foreground/10",
            title: "text-sm font-medium",
            description: "text-xs text-muted-foreground",
            closeButton: "!rounded-none",
          },
        }}
        {...props}
      />
    </>
  )
}

export { Toaster }
