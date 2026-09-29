import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  assertUniqueTemplateKeys,
  planPositionTemplateApplication,
  positionTemplateFromSlot,
  positionWindowFromTemplate,
  type EventSeriesPositionTemplate,
  type ExistingPositionSlot,
} from "./eventSeriesPositions";

const needId = (value: string) => value as Id<"eventArtistNeeds">;

function template(partial: Partial<EventSeriesPositionTemplate> = {}): EventSeriesPositionTemplate {
  return {
    templateKey: "key-headliner",
    label: "Headliner",
    artistType: "band",
    dayIndex: 0,
    setOffsetMs: 2 * 60 * 60 * 1000,
    setDurationMs: 60 * 60 * 1000,
    ...partial,
  };
}

function slot(partial: Partial<ExistingPositionSlot> = {}): ExistingPositionSlot {
  return { _id: needId("slot1"), locked: false, ...partial };
}

describe("planPositionTemplateApplication", () => {
  it("inserts every template the first time", () => {
    const templates = [template(), template({ templateKey: "key-opener", label: "Opener" })];
    const plan = planPositionTemplateApplication([], templates);

    expect(plan.removeIds).toEqual([]);
    expect(plan.actions.map((action) => action.kind)).toEqual(["insert", "insert"]);
  });

  it("re-applying with unchanged templates updates instead of duplicating", () => {
    const templates = [template()];
    const existing = [slot({ templateKey: "key-headliner" })];
    const plan = planPositionTemplateApplication(existing, templates);

    expect(plan.actions).toEqual([
      { kind: "update", template: templates[0], needId: needId("slot1") },
    ]);
    expect(plan.removeIds).toEqual([]);
  });

  it("never updates or removes a position that is filled or inquiring", () => {
    const templates = [template(), template({ templateKey: "key-opener", label: "Opener" })];
    // `locked` is set for a seated/named act and for `status !== "open"`
    // (inquiries) — the executor maps both to this flag.
    const existing = [
      slot({ _id: needId("filled"), templateKey: "key-headliner", locked: true }),
      // A template that disappeared entirely, but the slot is locked: keep it.
      slot({ _id: needId("inquiring-stale"), templateKey: "key-gone", locked: true }),
    ];
    const plan = planPositionTemplateApplication(existing, templates);

    expect(plan.actions).toEqual([
      { kind: "insert", template: templates[1] },
    ]);
    expect(plan.removeIds).toEqual([]);
  });

  it("removes stale open template positions only", () => {
    const existing = [
      slot({ _id: needId("stale-open"), templateKey: "key-gone" }),
      slot({ _id: needId("kept"), templateKey: "key-headliner" }),
      // Staff-added position (no templateKey): not ours to remove.
      slot({ _id: needId("hand-added") }),
    ];
    const plan = planPositionTemplateApplication(existing, [template()]);

    expect(plan.removeIds).toEqual([needId("stale-open")]);
    expect(plan.actions).toEqual([
      { kind: "update", template: template(), needId: needId("kept") },
    ]);
  });
});

describe("positionWindowFromTemplate", () => {
  it("resolves set and soundcheck windows against the occurrence start", () => {
    const start = 1_000_000_000;
    const window = positionWindowFromTemplate(
      template({ soundcheckOffsetMs: -60 * 60 * 1000, soundcheckDurationMs: 30 * 60 * 1000 }),
      start,
    );

    expect(window.setStartsAt).toBe(start + 2 * 60 * 60 * 1000);
    expect(window.setEndsAt).toBe(start + 3 * 60 * 60 * 1000);
    expect(window.soundcheckStartsAt).toBe(start - 60 * 60 * 1000);
    expect(window.soundcheckEndsAt).toBe(start - 30 * 60 * 1000);
  });

  it("leaves windows undefined when the template has no offset", () => {
    const window = positionWindowFromTemplate(
      { templateKey: "k", label: "", artistType: "dj", dayIndex: 0 },
      0,
    );
    expect(window).toEqual({
      setStartsAt: undefined,
      setEndsAt: undefined,
      soundcheckStartsAt: undefined,
      soundcheckEndsAt: undefined,
    });
  });
});

describe("positionTemplateFromSlot", () => {
  it("captures a slot's times as offsets from the event start", () => {
    const start = 1_000_000_000;
    const exported = positionTemplateFromSlot(
      {
        label: "  Headliner ",
        artistType: "band",
        genres: " indie ",
        setStartsAt: start + 2 * 60 * 60 * 1000,
        setEndsAt: start + 3 * 60 * 60 * 1000,
      },
      start,
      () => 0,
    );

    expect(exported.label).toBe("Headliner");
    expect(exported.genres).toBe("indie");
    expect(exported.setOffsetMs).toBe(2 * 60 * 60 * 1000);
    expect(exported.setDurationMs).toBe(60 * 60 * 1000);
    expect(exported.templateKey).toMatch(/^pos_/);
  });

  it("keeps an existing templateKey so imports do not reset identity", () => {
    const exported = positionTemplateFromSlot(
      { templateKey: "key-headliner", label: "Headliner", artistType: "band" },
      0,
      () => 0,
    );
    expect(exported.templateKey).toBe("key-headliner");
  });
});

describe("planPositionTemplateApplication adoption", () => {
  it("adopts a hand-added open position with the same name instead of inserting", () => {
    const existing = [slot({ _id: needId("hand"), label: " headliner " })];
    const plan = planPositionTemplateApplication(existing, [template()]);

    expect(plan.actions).toEqual([
      { kind: "update", template: template(), needId: needId("hand") },
    ]);
    expect(plan.stampKeys).toEqual([]);
  });

  it("stamps the key on a filled hand-added position without touching it", () => {
    const existing = [slot({ _id: needId("booked"), label: "Headliner", locked: true })];
    const plan = planPositionTemplateApplication(existing, [template()]);

    expect(plan.actions).toEqual([]);
    expect(plan.stampKeys).toEqual([{ needId: needId("booked"), templateKey: "key-headliner" }]);
    // Re-applying after the stamp is a no-op (still locked, now keyed).
    const again = planPositionTemplateApplication(
      [slot({ _id: needId("booked"), templateKey: "key-headliner", locked: true })],
      [template()],
    );
    expect(again).toEqual({ actions: [], removeIds: [], stampKeys: [] });
  });

  it("never adopts one hand-added position for two templates", () => {
    const existing = [slot({ _id: needId("hand"), label: "Opener" })];
    const templates = [
      template({ templateKey: "a", label: "Opener" }),
      template({ templateKey: "b", label: "Opener" }),
    ];
    const plan = planPositionTemplateApplication(existing, templates);
    expect(plan.actions.map((action) => action.kind)).toEqual(["update", "insert"]);
  });
});

describe("assertUniqueTemplateKeys", () => {
  it("rejects duplicate keys", () => {
    expect(() => assertUniqueTemplateKeys([template(), template()])).toThrow(/unique/);
    expect(() =>
      assertUniqueTemplateKeys([template(), template({ templateKey: "other" })]),
    ).not.toThrow();
  });
});
