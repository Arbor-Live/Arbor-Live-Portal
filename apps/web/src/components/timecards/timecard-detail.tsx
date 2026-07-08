"use client";

import { formatDate } from "@/lib/format";

type TimecardDay = {
  dateMs: number;
  events: Array<{
    eventId: string;
    title: string;
    actualHours: number;
    inputHours: number;
  }>;
  totalActual: number;
  totalInput: number;
};

export function TimecardDetail({ days }: { days: TimecardDay[] }) {
  if (!days.length) {
    return <p className="text-sm text-muted-foreground">No shifts recorded in this pay period.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Hours to input are a guide for Stanford — you do not need exact clock times. Log real work
        including prep time as appropriate.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium text-right">Hours to input</th>
              <th className="px-3 py-2 font-medium text-right">Worked</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) =>
              day.events.map((event, index) => (
                <tr key={`${day.dateMs}-${event.eventId}`} className="border-t">
                  <td className="px-3 py-2">
                    {index === 0 ? formatDate(day.dateMs) : ""}
                  </td>
                  <td className="px-3 py-2">{event.title}</td>
                  <td className="px-3 py-2 text-right font-medium">{event.inputHours.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {event.actualHours.toFixed(2)}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
