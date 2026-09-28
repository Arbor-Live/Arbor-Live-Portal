# Wing show files

Arbor generates a Behringer WING show package for an event from the performers'
technical riders: one `.show` index, a night baseline `Default.snap`, and one
`.snap` scene per band. Crew download it from **Event → Night rider → Download
show file**.

Code lives in [`packages/show-file/`](../packages/show-file/); the Events UI is
`apps/web/src/components/events/`; the download actions are
`packages/backend/convex/eventShowFileDownload.ts` and
`eventNightRiderDownload.ts`.

## The night in one paragraph

Every band on the bill gets one patch, not one each. The allocator takes the
union of all riders and pins each instrument family to a fixed home on the stage
box, so channel names stay stable all night — Vox 1 is Vox 1 whether the singer
is Sam or Lee. Load in, recall `Default`, gain and EQ once. From then on each
band scene only touches what actually changed since the previous set.

## Patch model

Both stage boxes run the same Default.snap layout, so "Flex1 is port 7" holds
whichever box you are standing at:

Ports below are box-relative; on the second, daisy-chained box add 16 to get the
socket number.

| Ports | Region | Homes |
|---|---|---|
| 1–4 | Vox | Vox 1–4 |
| 5–10 | Mid | Guitar (5), Bass (6), Flex1/2 (7–8), Keys ST (9–10) |
| 11–16 | Drums | Kick (11), Snare (12), Rack/Floor Tom (13–14), OH ST+48V (15–16) |

Rules worth knowing:

- **48V only on overheads.** A rider asking for phantom on a kick does not get it.
- **Keys break to mono.** Keys prefer a stereo pair on 9–10, but drop to mono on
  9 when the mid needs 10 for another input. A broken pair's right-hand socket
  gets its own console strip (15 on box A, 31 on box B) — without that the input
  had nowhere to land and was silently dropped.
- **Overflow spills into the mid**, then as a last resort onto unused vox/drum
  monos. Never onto the OH pair.
- **Stereo pairs are one input, drawn as two cells.** The right half mirrors the
  left's tags (ST, DI, 48V) and rides the left's channel strip.
- **Unused ports are dropped**, not drawn empty. The faceplate lists them as
  `Leave empty · A.2–9 · A.11–15`, and the snaps unpatch and blank those strips
  (`grp: "OFF"`, no name, muted) so nothing stale is left sitting on the desk.

### Two snakes, one link

The boxes are **daisy-chained**, so both hang off AES50 A — there is no AES50 B
in this rig. Box B simply starts 16 sockets further along:

| Box | AES50 sockets | Console strips | Spare strip |
|---|---|---|---|
| Snake A | A.1–16 | 1–14 | 15 |
| Snake B | A.17–32 | 17–30 | 31 |

Ports are box-relative (1–16) everywhere in the allocator, so the layout table
above holds for both; `aes50PortFor()` adds the offset when writing a snap.
Box B's Flex1 is box port 7 → socket **A.23** → console strip 23. Channel strips
are independent of the link: A keeps Default.snap's own 1–14 mapping so the
template's layer, DCA and mute-group tags stay with the right instruments.

The faceplate is numbered for whoever is patching, not for the desk: cells show
the number printed on the SD16, with the socket in brackets only when the box
sits down the chain. Region headers and the leave-empty list follow the same
rule (`portLabel()`).

```
Snake A · A.1–16              Snake B · A.17–32 (daisy-chained)
  Vox · 1–4                     Mid · 5–10 (21–26)
    1     Ch 1   Vox 1            7 (23)  Ch 23  Flex1
  Mid · 5–10                      9 (25)  Ch 25  Keys   ST DI
    5     Ch 5   Guitar  DI       10 (26) —      Keys   ST DI
  Drums · 11–16
    11    Ch 10  Kick
    15    Ch 14  OH 48V  ST 48V

Leave empty · 2–4 · 6–9 · 12–14 · 1–6 (17–22) · 8 (24) · 11–15 (27–31)
```

Off by default. The **Snakes** control on the Night rider card turns on the
second box and assigns a side per group (Vox, Guitar, Bass, Flex, Keys, Drums).
Saved on the event as `events.patchPlan`, so the on-screen patch and the
downloaded show file cannot disagree.

If a box overflows, groups move to the other one automatically, least disruptive
first (keys → flex → guitar → bass → vox), with a warning naming the move. Drums
never move on their own — the kit is the one thing that should stay put.

## Scene scoping

The reason this feature exists: **the kit gets gained once and no later scene
walks over it.**

| Scene | Scope |
|---|---|
| `Default.snap` | Everything. The load-in baseline: full patch, named, all channels muted, spares unpatched. |
| Band scenes | Only channels that differ from the previous band. Sources (preamps) never. |

A three-band bill with the same backline generates something like:

```
Default.snap      ch=[++++++++++++++++++++++++++++++++++++++++]
Openers.snap      ch=[+   ++   ++  +                          ]
Middle.snap       ch=[                                        ]
Headliners.snap   ch=[      +                                 ]
```

`Middle` recalls nothing at all — identical setup to the openers. `Headliners`
touches one channel: the sax that appears on Flex1.

Gain is safe even on a channel that *does* change, because the head amp lives on
the input source (`io.in.A[n].g`), and `source` is out of scope on every band
scene. Nothing in a band scene moves a gain knob.

**Escape hatch:** the same card has a *Scene scoping on / Full recall* toggle
(`events.patchPlan.scopeScenes`) if a desk ever misbehaves.

## The `scopes` section

WING `.snap` files carry recall scoping in a **top-level `scopes` object**,
sibling to `ae_data` / `ce_data`. In `snapshot.11` every field is a **string,
one character per item: `+` in scope, a space out of scope** — the same encoding
as `ce_data.safes`.

| Field | Length | What it selects |
|---|---|---|
| `ch` | 40 | Console channels |
| `aux` / `bus` / `main` / `mtx` | 8 / 16 / 4 / 8 | Buses |
| `dca` / `mute` / `fx` | 16 / 8 / 16 | DCAs, mute groups, FX slots |
| `source` | per group (`A` = 48) | Input sockets — **preamp gain lives here**, both boxes on `A` |
| `output` | per group | Output patches |
| `area` | LEFT 7, CENTER 6, RIGHT 7, COMPACT 9, RACK 5, EXTERN 8, VIRTUAL 8 | Surface areas |
| `custom` / `setup` | 31 / 3 | Custom controls, setup |
| `contents` | 15 | Which parameter groups of an in-scope object recall |
| `mainsend` / `bussend` | 4 / 24 | The panel's own MAIN and SEND entries |

### How this was established

Wing-Edit exports omit `scopes` entirely — our `Default.snap` template and the
committed DayNMayfield files all lack it — so there was no sample in the repo.
The format above comes from `.snap` files saved **on the console** with the
scope edited, cross-checked against a screenshot of its Edit Scope page:
deselecting CH 10–13, DCA 10–13 and FX 11–14 in the object grid produced spaces
at exactly those positions. That is what confirms the per-object strings are the
recall selection rather than a record of what was saved.

Those scope blocks are committed at
[`packages/show-file/templates/scopes-reference.json`](../packages/show-file/templates/scopes-reference.json),
and `allocate.test.ts` asserts our generated scope matches them field-for-field.
Keep that test — it is the only guard against the shape drifting.

> **Do not use** the `scopes` description in Patrick-Gilles Maillot's
> [WING OSC documentation](https://wing-docs.com/pdf/OSC_Documentation.pdf)
> (pp. 57–59). It is OSC v0.3.2 and describes nested booleans with different
> field names (`routin`, `routout`, `cfg`, `data`). That shape is obsolete;
> writing it produces a file the desk will not scope as intended. `ce_data.safes`
> changed the same way, from booleans to packed strings.

### Open: the `contents` slot order

The CONTENTS panel has 17 tiles. MAIN and SEND are not `contents` slots — they
are the separate `mainsend` / `bussend` fields — leaving exactly 15:

```
CUST  TAGS  CONN  IN/HA  FILTER  DELAY  GATE  DYN  INS1  INS2  EQ  PAN  FDR  MUTE  CONFIG
```

The mapping from tile order to string order is **unresolved**: a console save
with only IN/HA ticked wrote slot 2, while panel reading order puts IN/HA at
slot 4. We therefore write `contents` all `+` rather than guess. To pin it, save
a snap with CONTENTS set to NONE and a single tile ticked, and read the index
back out.

This only matters for a refinement we have not built (dropping IN/HA to
belt-and-brace the head amp, or per-parameter scoping like "recall mutes, never
touch my EQ"). Gain protection does not depend on it.

## Other consoles (X32 / M32, X Air / XR18)

The same allocation also renders for the two smaller desks. The **Show file**
panel on the Night rider card picks the desk and shows a pre-download report —
a summary line, any losses, and a channel-by-channel preview (span, name,
target socket, stereo/48V flags, bands using it) — before the download. The
report is the same build as the archive, run with `archive: false`
(`previewByEventId`); the download packs `-show.zip`, `-x32.zip` or
`-xr18.zip`. Code: `packages/show-file/src/x32.ts` and `xair.ts`, with
colour/icon translation in `palette.ts`; UI in
`apps/web/src/components/events/event-show-file-panel.tsx`.

- **X32 / M32** — the rig is already AES50 A, so a channel maps straight to its
  socket: Snake A ports 1–16 → channels 1–16, Snake B → 17–32, fed by
  `/config/routing/IN A1-8 A9-16 A17-24 A25-32 AUX1-6`. The X32 has no stereo
  channel, so a Keys or OH pair becomes two hard-panned mono channels linked in
  `/config/chlink` (only odd-aligned pairs link), and 48V moves to the
  `/headamp/NNN` node. Scenes open with `#4.0#`, LF line endings.
  Band scenes are **sparse**: they carry only the `/ch/NN/mix` lines whose mute
  changed, so the night baseline’s `/ch/NN/preamp` (gain) is never recalled over
  a gained kit — the same protection the Wing gets from `source` being out of
  scope. Mute and fader share that node on an X32, so unmuting recalls unity
  fader.
- **X Air / XR18** — no AES50, so the snake becomes the mixer’s **local**
  channels: Snake A port *n* → `Innn` on channel *n*. The second snake has
  nowhere to land and is named in the warnings. X AIR Edit will not load a
  partial scene, so every scene carries the complete node set (channels, buses,
  FX, routing, headamps) and per-band recall is a full scene. **Unlike the Wing
  and X32, an XR18 band scene therefore recalls gain and faders** — set channel
  safes on the desk if you need those protected.

Nothing here has been through a real show. Worth confirming once: load a
generated package, recall `Default`, gain the kit, then step the band scenes and
check drum gain and EQ do not move. The top-level `updated` field Wing-Edit adds
on save is cosmetic; we do not write it.

## Tests

```bash
npx vitest run packages/show-file       # allocation, snaps, scope shape
npx vitest run apps/web/src/components  # faceplate render smoke test
```
