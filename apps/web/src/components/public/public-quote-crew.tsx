"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import {
  crewLinePerson,
  describeHeadcount,
  formatHours,
  formatPeople,
  groupCrewBySection,
  parsePublicCrewLine,
  sumCrewAmountUsd,
  type CrewGroup,
  type PublicCrewLine,
  type PublicCrewLineInput,
} from "@/lib/public-quote-crew";

function formatRate(rateUsd: number) {
  const usd = formatUsd(rateUsd);
  return `${Number.isInteger(rateUsd) ? usd.replace(/\.00$/, "") : usd}/hr`;
}

function hoursTimesRate(line: PublicCrewLine) {
  const people = line.people > 1 ? `${line.people} × ` : "";
  return `${people}${formatHours(line.hoursEach)} × ${formatRate(line.rateUsd)}`;
}

/** One billed line inside an opened section: who, their role, hours × rate = amount. */
function CrewLineRow({ line }: { line: PublicCrewLine }) {
  const person = crewLinePerson(line);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-2 text-sm" data-testid="public-quote-crew-line">
      <div className="min-w-0">
        {line.manualLabel ? (
          <p>{formatPeople(line.people)}</p>
        ) : (
          <p className="break-words">
            <span className={line.person ? undefined : "text-muted-foreground italic"}>
              {person ?? line.role ?? "Crew"}
            </span>
            {line.lead ? (
              <span className="ml-1.5 inline-flex rounded-sm bg-primary/10 px-1.5 py-px align-middle text-2xs font-medium text-primary">
                Lead
              </span>
            ) : null}
          </p>
        )}
        {person && line.role ? <p className="text-xs text-muted-foreground">{line.role}</p> : null}
        {line.notes ? <p className="text-xs text-muted-foreground">{line.notes}</p> : null}
      </div>
      <div className="text-right tabular-nums">
        <p>{formatUsd(line.amountUsd)}</p>
        <p className="text-xs whitespace-nowrap text-muted-foreground">{hoursTimesRate(line)}</p>
      </div>
    </li>
  );
}

/** A Run of Show section: headcount × hours and its total, opening to each person. */
function CrewSection({ group }: { group: CrewGroup }) {
  return (
    <details className="group/crew border-t first:border-t-0" data-testid="public-quote-crew-section">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <CaretRightIcon
          aria-hidden
          className="mt-1 size-3.5 text-muted-foreground transition-transform group-open/crew:rotate-90 motion-reduce:transition-none"
        />
        <div className="min-w-0">
          <p className="font-medium break-words">{group.title}</p>
          <p className="text-xs text-muted-foreground" data-testid="public-quote-crew-headcount">
            {describeHeadcount(group.lines)}
          </p>
        </div>
        <p className="font-medium tabular-nums">{formatUsd(group.amountUsd)}</p>
      </summary>
      <ul className="mb-3 ml-6 divide-y border-l pl-3">
        {group.lines.map((line) => (
          <CrewLineRow key={line.id} line={line} />
        ))}
      </ul>
    </details>
  );
}

/**
 * The quote's crew for the client, grouped by day (multi-day bookings) and Run
 * of Show section, so headcount per phase reads at a glance. Presentation only:
 * every section, day, and the crew total is the exact sum of its billed lines.
 */
export function PublicQuoteCrew({ lineItems }: { lineItems: PublicCrewLineInput[] }) {
  if (!lineItems.length) return null;
  const lines = lineItems.map(parsePublicCrewLine);
  const days = groupCrewBySection(lines);
  return (
    <Card data-testid="public-quote-crew">
      <CardHeader>
        <CardTitle>Crew</CardTitle>
        <CardDescription>
          How many people work each part of your event, and for how long. Open a section to see each person&apos;s
          hours and rate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {days.map((day) =>
          day.title ? (
            <section key={day.key} className="border-t pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-4 border-b pb-1">
                <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day.title}</h4>
                <span className="text-xs text-muted-foreground tabular-nums">{formatUsd(day.amountUsd)}</span>
              </div>
              {day.groups.map((group) => (
                <CrewSection key={group.key} group={group} />
              ))}
            </section>
          ) : (
            day.groups.map((group) => <CrewSection key={group.key} group={group} />)
          ),
        )}
        <div className="mt-1 flex items-baseline justify-between border-t-2 border-foreground/80 pt-3">
          <span className="font-medium">Crew total</span>
          <span className="font-semibold tabular-nums" data-testid="public-quote-crew-total">
            {formatUsd(sumCrewAmountUsd(lines))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
