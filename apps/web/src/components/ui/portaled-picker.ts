import * as React from "react";

const PORTED_PICKER_SELECTOR = [
  "[data-slot=combobox-content]",
  "[data-slot=combobox-item]",
  "[data-slot=select-content]",
  "[data-slot=popover-content]",
  "[data-testid=searchable-select-menu]",
].join(",");

function eventTarget(event: {
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
}): EventTarget | null {
  return event.detail?.originalEvent?.target ?? event.target ?? null;
}

/**
 * Modal sheets/dialogs trap focus to their content. A picker portaled to
 * `document.body` is outside that trap, so its search field never focuses and
 * keystrokes land on whatever the sheet last focused (e.g. Asset ID).
 *
 * `undefined` — not inside a modal; portal to `body`.
 * `null` — inside a modal, content ref not ready yet; wait (Base UI).
 * `HTMLElement` — portal into that modal content node.
 */
export const PickerPortalContainerContext = React.createContext<
  HTMLElement | null | undefined
>(undefined);

export function usePickerPortalContainer() {
  return React.useContext(PickerPortalContainerContext);
}

export function assignNodeRef<T>(
  node: T | null,
  ...refs: Array<React.Ref<T> | undefined>
) {
  for (const ref of refs) {
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
  }
}

/** Combobox/select/popover portals to `body`, so a click is "outside" a modal sheet. */
export function preventDismissForPortaledPicker(event: {
  preventDefault: () => void;
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
}) {
  const target = eventTarget(event);
  if (target instanceof Element && target.closest(PORTED_PICKER_SELECTOR)) {
    event.preventDefault();
  }
}
