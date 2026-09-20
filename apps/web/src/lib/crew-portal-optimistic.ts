import type { OptimisticLocalStore } from "convex/browser";
import { api, type Id } from "@/lib/convex-api";

export function optimisticResolveMyEventMedia(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events">; status: "uploaded" | "no_media" },
) {
  for (const entry of localStore.getAllQueries(api.crewPortal.listMyPostEventWork)) {
    if (!entry.value) continue;
    localStore.setQuery(
      api.crewPortal.listMyPostEventWork,
      entry.args,
      entry.value.map((row) =>
        row.eventId === args.eventId ? { ...row, mediaResolved: true } : row,
      ),
    );
  }
}
