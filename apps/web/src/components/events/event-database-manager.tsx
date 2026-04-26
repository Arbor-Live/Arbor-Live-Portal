"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BlockDraft = {
  id?: Id<"eventScheduleBlocks">;
  blockType: "setup" | "show" | "strike" | "custom";
  label: string;
  dayIndex: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

type ShiftDraft = {
  id?: Id<"eventCrewShifts">;
  expenseReportId?: Id<"eventExpenseReports">;
  role: string;
  personName: string;
  startsAt: string;
  endsAt: string;
  postedToExpense: boolean;
  notes: string;
};

export function EventDatabaseManager() {
  const events = useQuery(api.events.list, {});
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  const selectedEvent = useQuery(api.events.get, selectedEventId ? { id: selectedEventId } : "skip");
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const upsertBlocks = useMutation(api.eventSchedule.upsertBlocks);
  const upsertShifts = useMutation(api.eventCrew.upsertShifts);
  const createArtifact = useMutation(api.eventArtifacts.create);
  const createExpense = useMutation(api.eventExpenses.create);

  const [newTitle, setNewTitle] = useState("");
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [newTimezone, setNewTimezone] = useState("America/Los_Angeles");
  const [artifactType, setArtifactType] = useState<"note" | "instruction" | "document" | "pull_list">("note");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactMarkdown, setArtifactMarkdown] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editVenue, setEditVenue] = useState("");
  const [editEventType, setEditEventType] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editStatus, setEditStatus] = useState<"draft" | "active" | "completed" | "cancelled">("draft");
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);

  useEffect(() => {
    if (!selectedEvent?.event) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditTitle(selectedEvent.event.title);
    setEditVenue(selectedEvent.event.venueName ?? "");
    setEditEventType(selectedEvent.event.eventType ?? "");
    setEditHost(selectedEvent.event.host ?? "");
    setEditStatus(selectedEvent.event.status);
    setBlocks(
      selectedEvent.blocks.map((block) => ({
        id: block._id,
        blockType: block.blockType,
        label: block.label,
        dayIndex: String(block.dayIndex),
        startsAt: new Date(block.startsAt).toISOString().slice(0, 16),
        endsAt: new Date(block.endsAt).toISOString().slice(0, 16),
        notes: block.notes ?? "",
      })),
    );
    setShifts(
      selectedEvent.shifts.map((shift) => ({
        id: shift._id,
        expenseReportId: shift.expenseReportId,
        role: shift.role,
        personName: shift.personName ?? "",
        startsAt: new Date(shift.startsAt).toISOString().slice(0, 16),
        endsAt: new Date(shift.endsAt).toISOString().slice(0, 16),
        postedToExpense: shift.postedToExpense,
        notes: shift.notes ?? "",
      })),
    );
  }, [selectedEvent?.event?._id, selectedEvent]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Create Event</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Event title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Input type="datetime-local" value={newStartAt} onChange={(e) => setNewStartAt(e.target.value)} />
          <Input type="datetime-local" value={newEndAt} onChange={(e) => setNewEndAt(e.target.value)} />
          <Input placeholder="Timezone" value={newTimezone} onChange={(e) => setNewTimezone(e.target.value)} />
          <div className="md:col-span-4">
            <Button
              type="button"
              onClick={async () => {
                const id = await createEvent({
                  title: newTitle,
                  startAt: new Date(newStartAt).getTime(),
                  endAt: new Date(newEndAt).getTime(),
                  timezone: newTimezone,
                  status: "draft",
                  visibility: "internal",
                });
                setSelectedEventId(id);
                setNewTitle("");
              }}
            >
              Create Event
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Events</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(events ?? []).map((row) => (
            <div key={row._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="text-muted-foreground">{row.status}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setSelectedEventId(row._id)}>
                Open
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedEvent?.event ? (
        <>
          <Card>
            <CardHeader><CardTitle>Core Event Details</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Venue</Label>
                <Input value={editVenue} onChange={(e) => setEditVenue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Event Type</Label>
                <Input value={editEventType} onChange={(e) => setEditEventType(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Host</Label>
                <Input value={editHost} onChange={(e) => setEditHost(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as typeof editStatus)}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <Button
                  type="button"
                  onClick={async () => {
                    await updateEvent({
                      id: selectedEvent.event._id,
                      title: editTitle,
                      venueName: editVenue || undefined,
                      eventType: editEventType || undefined,
                      host: editHost || undefined,
                      status: editStatus,
                    });
                  }}
                >
                  Save Event Details
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Schedule Blocks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {blocks.map((block, index) => (
                <div key={block.id ?? `block-${index}`} className="grid gap-2 md:grid-cols-6">
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={block.blockType}
                    onChange={(e) =>
                      setBlocks((prev) => prev.map((row, i) => (i === index ? { ...row, blockType: e.target.value as BlockDraft["blockType"] } : row)))
                    }
                  >
                    <option value="setup">setup</option>
                    <option value="show">show</option>
                    <option value="strike">strike</option>
                    <option value="custom">custom</option>
                  </select>
                  <Input value={block.label} onChange={(e) => setBlocks((prev) => prev.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))} />
                  <Input value={block.dayIndex} onChange={(e) => setBlocks((prev) => prev.map((row, i) => (i === index ? { ...row, dayIndex: e.target.value } : row)))} />
                  <Input type="datetime-local" value={block.startsAt} onChange={(e) => setBlocks((prev) => prev.map((row, i) => (i === index ? { ...row, startsAt: e.target.value } : row)))} />
                  <Input type="datetime-local" value={block.endsAt} onChange={(e) => setBlocks((prev) => prev.map((row, i) => (i === index ? { ...row, endsAt: e.target.value } : row)))} />
                  <Button type="button" variant="outline" onClick={() => setBlocks((prev) => prev.filter((_, i) => i !== index))}>Remove</Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setBlocks((prev) => [...prev, { blockType: "setup", label: "", dayIndex: "0", startsAt: "", endsAt: "", notes: "" }])}>
                  Add Block
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    await upsertBlocks({
                      eventId: selectedEvent.event._id,
                      blocks: blocks.map((block) => ({
                        id: block.id,
                        blockType: block.blockType,
                        label: block.label,
                        dayIndex: Number(block.dayIndex || "0"),
                        startsAt: new Date(block.startsAt).getTime(),
                        endsAt: new Date(block.endsAt).getTime(),
                        notes: block.notes || undefined,
                      })),
                    });
                  }}
                >
                  Save Blocks
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Crew Shifts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {shifts.map((shift, index) => (
                <div key={shift.id ?? `shift-${index}`} className="grid gap-2 md:grid-cols-6">
                  <Input placeholder="Role" value={shift.role} onChange={(e) => setShifts((prev) => prev.map((row, i) => (i === index ? { ...row, role: e.target.value } : row)))} />
                  <Input placeholder="Person" value={shift.personName} onChange={(e) => setShifts((prev) => prev.map((row, i) => (i === index ? { ...row, personName: e.target.value } : row)))} />
                  <Input type="datetime-local" value={shift.startsAt} onChange={(e) => setShifts((prev) => prev.map((row, i) => (i === index ? { ...row, startsAt: e.target.value } : row)))} />
                  <Input type="datetime-local" value={shift.endsAt} onChange={(e) => setShifts((prev) => prev.map((row, i) => (i === index ? { ...row, endsAt: e.target.value } : row)))} />
                  <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
                    <input type="checkbox" checked={shift.postedToExpense} onChange={(e) => setShifts((prev) => prev.map((row, i) => (i === index ? { ...row, postedToExpense: e.target.checked } : row)))} />
                    Posted
                  </label>
                  <Button type="button" variant="outline" onClick={() => setShifts((prev) => prev.filter((_, i) => i !== index))}>Remove</Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShifts((prev) => [...prev, { role: "", personName: "", startsAt: "", endsAt: "", postedToExpense: false, notes: "" }])}>
                  Add Shift
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    await upsertShifts({
                      eventId: selectedEvent.event._id,
                      shifts: shifts.map((shift) => ({
                        id: shift.id,
                        expenseReportId: shift.expenseReportId,
                        role: shift.role,
                        personName: shift.personName || undefined,
                        startsAt: new Date(shift.startsAt).getTime(),
                        endsAt: new Date(shift.endsAt).getTime(),
                        postedToExpense: shift.postedToExpense,
                        notes: shift.notes || undefined,
                      })),
                    });
                  }}
                >
                  Save Shifts
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await createExpense({
                      eventId: selectedEvent.event._id,
                      title: `${selectedEvent.event.title} Crew Hours`,
                      status: "draft",
                    });
                  }}
                >
                  Create Expense Report
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Artifacts (Notes, Instructions, Docs, Pull Lists)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 md:grid-cols-4">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={artifactType}
                  onChange={(e) => setArtifactType(e.target.value as typeof artifactType)}
                >
                  <option value="note">note</option>
                  <option value="instruction">instruction</option>
                  <option value="document">document</option>
                  <option value="pull_list">pull_list</option>
                </select>
                <Input placeholder="Title" value={artifactTitle} onChange={(e) => setArtifactTitle(e.target.value)} />
                <Input placeholder="Markdown / content" value={artifactMarkdown} onChange={(e) => setArtifactMarkdown(e.target.value)} />
                <Button
                  type="button"
                  onClick={async () => {
                    await createArtifact({
                      eventId: selectedEvent.event._id,
                      artifactType,
                      title: artifactTitle,
                      markdown: artifactMarkdown || undefined,
                    });
                    setArtifactTitle("");
                    setArtifactMarkdown("");
                  }}
                >
                  Add Artifact
                </Button>
              </div>
              <div className="space-y-1">
                {selectedEvent.artifacts.map((row) => (
                  <div key={row._id} className="rounded-md border px-3 py-2 text-sm">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.artifactType}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
