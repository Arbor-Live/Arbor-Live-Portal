---
name: wing-show-files
description:
  Behringer WING show file generation (.show / .snap) in packages/show-file.
  Use before touching snap.ts, the patch allocator, or show-file downloads.
---

# Wing Show Files

**Read `docs/wing-show-files.md` first.** It documents the night model, patch
tables, and snap format as actually built.

## Non-negotiables

- The `.snap` recall-`scopes` format was reverse-engineered from **console
  saves**, not the public OSC PDF — that PDF is obsolete and misleading here.
  Do not "fix" the format to match it.
- Any change to snap output keeps the fixture test passing against
  `templates/scopes-reference.json`. If the format intentionally changes, the
  fixture updates in the same PR, with the console-save evidence noted.

## Code map

- `packages/show-file/` — allocator + generation; `snap.ts` is the hot spot.
- Downloads: `packages/backend/convex/eventShowFileDownload.ts` (per event)
  and `eventNightRiderDownload.ts` (per night). UI in
  `apps/web/src/components/events/`.

## Domain invariants (details in the doc)

- One patch per night, not per band: instrument families pin to fixed homes so
  channel names stay stable across sets.
- 48V only on overheads, never on kick/snare even if a rider asks.
- Keys break to mono on 9 when the mid needs 10; a broken pair's right socket
  gets its own strip, or the input had nowhere to land (bug).
- Overflow: mid region first, then unused vox/drum monos, never the OH pair.
- Unused ports are dropped and blanked on the desk (`grp: "OFF"`, muted), and
  listed on the faceplate as `Leave empty`.
- Ports are box-relative; box B is +16 sockets via the daisy-chained AES50 A.
