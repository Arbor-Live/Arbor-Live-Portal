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
