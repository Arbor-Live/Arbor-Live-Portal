"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { DEFAULT_PATCH_PLAN } from "@arbor/show-file";
import { api, type Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { nightRiderPlan } from "@/lib/night-rider-plan";
import { actKeyOf, type RunOfShowAct } from "@/lib/run-of-show";

/**
 * Acts on the bill (in bill order: top of the bill first) and the night
 * rider's cable swaps between consecutive acts.
 */
export function useRunOfShowData(eventId: Id<"events">) {
  const lineup = useQuery(api.eventArtistNeeds.getForEvent, { eventId });
  const riders = useQuery(api.bandRiders.listForEvent, { eventId });
  const savedPlan = useQuery(api.eventPatchPlan.get, { eventId });

  const acts = useMemo<RunOfShowAct[]>(() => {
    if (!lineup) return [];
    const fromSlots = lineup.slots.flatMap((slot): RunOfShowAct[] => {
      const booked = slot.filledBy[0];
      if (booked) {
        return [
          {
            key: `p:${booked.participationId}`,
            name: booked.name,
            participationId: booked.participationId,
            open: false,
            artistTypes: slot.artistTypes,
          },
        ];
      }
      const external = slot.externalArtistName.trim();
      return [
        {
          key: `n:${slot.needId}`,
          name: external || slot.label.trim() || "TBA",
          needId: slot.needId,
          open: !external,
          artistTypes: slot.artistTypes,
        },
      ];
    });
    const unslotted = lineup.unslotted.map(
      (row): RunOfShowAct => ({
        key: `p:${row.participationId}`,
        name: row.name,
        participationId: row.participationId,
        open: false,
      }),
    );
    return [...fromSlots, ...unslotted];
  }, [lineup]);

  const swapsByPair = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!riders) return map;
    const { changeovers } = nightRiderPlan(riders, savedPlan ?? DEFAULT_PATCH_PLAN);
    for (const changeover of changeovers) map.set(changeover.title, changeover.lines);
    return map;
  }, [riders, savedPlan]);

  const actByKey = useMemo(() => new Map(acts.map((act) => [act.key, act])), [acts]);

  /** Name of the act a soundcheck/set belongs to. */
  function actName(block: TimelineBlockDraft) {
    const key = actKeyOf(block);
    if (key) return actByKey.get(key)?.name;
    return undefined;
  }

  /** Cable swaps going from one act to the next, when the night rider has both. */
  function swaps(fromAct: string, toAct: string) {
    return swapsByPair.get(`${fromAct} → ${toAct}`);
  }

  return { acts, loading: lineup === undefined, actName, swaps, hasRiders: swapsByPair.size > 0 };
}
