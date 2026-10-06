import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  getUserId,
  requireArborInternalContext,
  requireAuth,
  requirePortalAdmin,
} from "./lib/auth";
import { normalizeAlertRecipients } from "./lib/alertRecipients";
import { pickBestCohoGiftCard } from "./lib/cohoGiftCards";
import { scheduleCohoGiftCardLowBalanceEmails } from "./email/cohoGiftCardEmails";

/** Warn once a card drops below this, unless Ops Center overrides it. */
export const DEFAULT_LOW_BALANCE_THRESHOLD_USD = 50;

/** Cap the number of cards an admin can register. */
export const MAX_COHO_GIFT_CARDS = 10;

/** How far ahead a shift counts as "today/upcoming" for showing the QR. */
const CREW_SHIFT_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/** Cap shifts scanned when deciding whether the viewer is working. */
const CREW_SHIFT_SCAN_CAP = 50;

function toastAccountUrl(token: string) {
  return `https://ws-api.toasttab.com/loyalty/v1/guest/account/${encodeURIComponent(token)}`;
}

async function readSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("cohoGiftCardSettings").first();
}

async function getOrCreateSettings(ctx: MutationCtx) {
  const existing = await readSettings(ctx);
  if (existing) return existing;
  const id = await ctx.db.insert("cohoGiftCardSettings", {
    alertRecipients: [],
    lowBalanceThresholdUsd: DEFAULT_LOW_BALANCE_THRESHOLD_USD,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

async function listCards(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("cohoGiftCards").take(MAX_COHO_GIFT_CARDS + 1);
}

/** The QR payload — the card number — and nothing else. */
const myCohoGiftCardValue = v.object({
  cardNumber: v.string(),
});

/** Read the tokens for the refresh action; never exposed to clients. */
export const listCardsForRefresh = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("cohoGiftCards"),
      label: v.string(),
      secureToken: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const cards = await ctx.db.query("cohoGiftCards").take(MAX_COHO_GIFT_CARDS);
    return cards.map((card) => ({
      _id: card._id,
      label: card.label,
      secureToken: card.secureToken,
    }));
  },
});

/**
 * Refresh every registered card's balance from Toast and store it. A card's
 * `secureToken` is a bearer secret read only here and never sent to clients.
 * A failing card records its own error and does not block the others.
 */
export const refreshCohoGiftCards = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cards = await ctx.runQuery(internal.cohoGiftCard.listCardsForRefresh, {});

    for (const card of cards) {
      try {
        const response = await fetch(toastAccountUrl(card.secureToken), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Toast returned ${response.status} ${response.statusText}.`);
        }
        const body = (await response.json()) as {
          account?: { number?: unknown; giftCardBalance?: unknown };
        };
        const cardNumber = typeof body.account?.number === "string" ? body.account.number : null;
        const balanceUsd =
          typeof body.account?.giftCardBalance === "number" ? body.account.giftCardBalance : null;
        if (!cardNumber || balanceUsd === null) {
          throw new Error("Toast response did not include a card number and balance.");
        }
        await ctx.runMutation(internal.cohoGiftCard.applyCohoGiftCardBalance, {
          cardId: card._id,
          cardNumber,
          balanceUsd,
          checkedAt: Date.now(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`CoHo gift card "${card.label}" refresh failed: ${message}`);
        await ctx.runMutation(internal.cohoGiftCard.recordCohoGiftCardError, {
          cardId: card._id,
          message,
        });
      }
    }
    return null;
  },
});

export const applyCohoGiftCardBalance = internalMutation({
  args: {
    cardId: v.id("cohoGiftCards"),
    cardNumber: v.string(),
    balanceUsd: v.number(),
    checkedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) return null;
    const settings = await readSettings(ctx);
    const threshold = settings?.lowBalanceThresholdUsd ?? DEFAULT_LOW_BALANCE_THRESHOLD_USD;
    const recipients = (settings?.alertRecipients ?? []).filter(Boolean);
    const isLow = args.balanceUsd < threshold;
    // Warn once per crossing, per card, and only when there is somewhere to send it.
    const shouldWarn = isLow && !card.lowBalanceNotifiedAt && recipients.length > 0;
    const nextNotifiedAt = isLow
      ? shouldWarn
        ? args.checkedAt
        : card.lowBalanceNotifiedAt
      : undefined;

    await ctx.db.patch(card._id, {
      cardNumber: args.cardNumber,
      balanceUsd: args.balanceUsd,
      lastCheckedAt: args.checkedAt,
      lastError: undefined,
      lowBalanceNotifiedAt: nextNotifiedAt,
    });

    if (shouldWarn) {
      await scheduleCohoGiftCardLowBalanceEmails(ctx, {
        cardId: card._id,
        cardLabel: card.label,
        balanceUsd: args.balanceUsd,
        thresholdUsd: threshold,
        recipients,
        crossingId: args.checkedAt,
      });
    }
    return null;
  },
});

export const recordCohoGiftCardError = internalMutation({
  args: { cardId: v.id("cohoGiftCards"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (card) await ctx.db.patch(card._id, { lastError: args.message });
    return null;
  },
});

const cohoGiftCardSettingsValue = v.object({
  alertRecipients: v.array(v.string()),
  lowBalanceThresholdUsd: v.number(),
  cards: v.array(
    v.object({
      _id: v.id("cohoGiftCards"),
      label: v.string(),
      cardNumber: v.union(v.string(), v.null()),
      balanceUsd: v.union(v.number(), v.null()),
      lastCheckedAt: v.union(v.number(), v.null()),
      lastError: v.union(v.string(), v.null()),
    }),
  ),
});

/** Ops Center → Settings: recipients, threshold, and the registered cards. */
export const getCohoGiftCardSettings = query({
  args: {},
  returns: cohoGiftCardSettingsValue,
  handler: async (ctx) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);
    const [settings, cards] = await Promise.all([readSettings(ctx), listCards(ctx)]);
    return {
      alertRecipients: settings?.alertRecipients ?? [],
      lowBalanceThresholdUsd:
        settings?.lowBalanceThresholdUsd ?? DEFAULT_LOW_BALANCE_THRESHOLD_USD,
      cards: cards.map((card) => ({
        _id: card._id,
        label: card.label,
        cardNumber: card.cardNumber ?? null,
        balanceUsd: card.balanceUsd ?? null,
        lastCheckedAt: card.lastCheckedAt ?? null,
        lastError: card.lastError ?? null,
      })),
    };
  },
});

export const updateCohoGiftCardSettings = mutation({
  args: {
    alertRecipients: v.array(v.string()),
    lowBalanceThresholdUsd: v.number(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);

    if (!Number.isFinite(args.lowBalanceThresholdUsd) || args.lowBalanceThresholdUsd < 0) {
      throw new Error("Threshold must be zero or more.");
    }
    const recipients = normalizeAlertRecipients(args.alertRecipients);

    const settings = await getOrCreateSettings(ctx);
    await ctx.db.patch(settings._id, {
      alertRecipients: recipients,
      lowBalanceThresholdUsd: args.lowBalanceThresholdUsd,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const addCohoGiftCard = mutation({
  args: { label: v.string(), secureToken: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);

    const label = args.label.trim();
    const secureToken = args.secureToken.trim();
    if (!label) throw new Error("Card label is required.");
    if (!secureToken) throw new Error("Toast token is required.");

    const existing = await listCards(ctx);
    if (existing.length >= MAX_COHO_GIFT_CARDS) {
      throw new Error(`Too many cards (max ${MAX_COHO_GIFT_CARDS}).`);
    }

    const now = Date.now();
    await ctx.db.insert("cohoGiftCards", {
      label,
      secureToken,
      createdAt: now,
      updatedAt: now,
    });
    // Pull the new card's balance now instead of waiting for the next cron.
    await ctx.scheduler.runAfter(0, internal.cohoGiftCard.refreshCohoGiftCards, {});
    return { ok: true as const };
  },
});

/** Replace a card's token without ever reading the old one back. */
export const replaceCohoGiftCardToken = mutation({
  args: { cardId: v.id("cohoGiftCards"), secureToken: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);

    const secureToken = args.secureToken.trim();
    if (!secureToken) throw new Error("Toast token is required.");

    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("Card not found.");
    await ctx.db.patch(card._id, { secureToken, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.cohoGiftCard.refreshCohoGiftCards, {});
    return { ok: true as const };
  },
});

export const removeCohoGiftCard = mutation({
  args: { cardId: v.id("cohoGiftCards") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);
    await ctx.db.delete(args.cardId);
    return { ok: true as const };
  },
});

/**
 * The card crew should pay with: the registered card with the highest known
 * balance. Only for crew who are working now or soon; returns the card number
 * (the QR payload) and nothing else.
 */
export const getMyCohoGiftCard = query({
  /**
   * `refreshTick` is unused server-side: it only changes on an interval so the
   * subscription re-runs as time passes. Eligibility uses server time so a
   * caller can't spoof "working now" with a chosen timestamp.
   */
  args: { refreshTick: v.number() },
  returns: v.union(myCohoGiftCardValue, v.null()),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);
    const now = Date.now();

    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) =>
        q.eq("userId", userId).gte("startsAt", now - CREW_SHIFT_LOOKAHEAD_MS),
      )
      .take(CREW_SHIFT_SCAN_CAP);
    const isWorking = shifts.some(
      (shift) => shift.endsAt >= now && shift.startsAt <= now + CREW_SHIFT_LOOKAHEAD_MS,
    );
    if (!isWorking) return null;

    const best = pickBestCohoGiftCard(await listCards(ctx));
    return best?.cardNumber ? { cardNumber: best.cardNumber } : null;
  },
});
