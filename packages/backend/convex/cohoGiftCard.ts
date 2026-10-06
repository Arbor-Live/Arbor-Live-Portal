import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  getUserId,
  requireAdmin,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import { scheduleCohoGiftCardLowBalanceEmails } from "./email/cohoGiftCardEmails";
import { normalizeAlertRecipients } from "./lib/alertRecipients";

/** Warn once the shared card drops below this, unless Ops Center overrides it. */
export const DEFAULT_LOW_BALANCE_THRESHOLD_USD = 50;

/** How far ahead a shift counts as "today/upcoming" for showing the QR. */
const CREW_SHIFT_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/** Cap shifts scanned when deciding whether the viewer is working. */
const CREW_SHIFT_SCAN_CAP = 50;

function toastAccountUrl(token: string) {
  return `https://ws-api.toasttab.com/loyalty/v1/guest/account/${encodeURIComponent(token)}`;
}

async function readCohoGiftCard(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("cohoGiftCard").first();
}

async function readCohoGiftCardSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("cohoGiftCardSettings").first();
}

async function getOrCreateCohoGiftCardSettings(ctx: MutationCtx) {
  const existing = await readCohoGiftCardSettings(ctx);
  if (existing) return existing;
  const id = await ctx.db.insert("cohoGiftCardSettings", {
    alertRecipients: [],
    lowBalanceThresholdUsd: DEFAULT_LOW_BALANCE_THRESHOLD_USD,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

/** The QR payload — the card number — and nothing else. */
const myCohoGiftCardValue = v.object({
  cardNumber: v.string(),
});

/**
 * Refresh the shared card's balance from Toast and store it. The Toast
 * `secureToken` is a bearer secret read from the deployment env and never
 * persisted or returned to clients.
 */
export const refreshCohoGiftCard = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const token = process.env.TOAST_COHO_CARD_TOKEN?.trim();
    if (!token) {
      throw new Error(
        "TOAST_COHO_CARD_TOKEN is not set on this deployment; cannot refresh the CoHo gift card balance.",
      );
    }

    try {
      const response = await fetch(toastAccountUrl(token), {
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
        cardNumber,
        balanceUsd,
        checkedAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internal.cohoGiftCard.recordCohoGiftCardError, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    return null;
  },
});

export const applyCohoGiftCardBalance = internalMutation({
  args: {
    cardNumber: v.string(),
    balanceUsd: v.number(),
    checkedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [existing, settings] = await Promise.all([
      readCohoGiftCard(ctx),
      readCohoGiftCardSettings(ctx),
    ]);
    const threshold = settings?.lowBalanceThresholdUsd ?? DEFAULT_LOW_BALANCE_THRESHOLD_USD;
    const recipients = (settings?.alertRecipients ?? []).filter(Boolean);
    const isLow = args.balanceUsd < threshold;
    // Warn once per crossing, and only when there is somewhere to send it.
    const shouldWarn = isLow && !existing?.lowBalanceNotifiedAt && recipients.length > 0;
    const nextNotifiedAt = isLow
      ? shouldWarn
        ? args.checkedAt
        : existing?.lowBalanceNotifiedAt
      : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        cardNumber: args.cardNumber,
        balanceUsd: args.balanceUsd,
        lastCheckedAt: args.checkedAt,
        lastError: undefined,
        lowBalanceNotifiedAt: nextNotifiedAt,
      });
    } else {
      await ctx.db.insert("cohoGiftCard", {
        cardNumber: args.cardNumber,
        balanceUsd: args.balanceUsd,
        lastCheckedAt: args.checkedAt,
        lowBalanceNotifiedAt: nextNotifiedAt,
      });
    }

    if (shouldWarn) {
      await scheduleCohoGiftCardLowBalanceEmails(ctx, {
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
  args: { message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await readCohoGiftCard(ctx);
    if (existing) {
      await ctx.db.patch(existing._id, { lastError: args.message });
    }
    return null;
  },
});

const cohoGiftCardSettingsValue = v.object({
  alertRecipients: v.array(v.string()),
  lowBalanceThresholdUsd: v.number(),
  balanceUsd: v.union(v.number(), v.null()),
  lastCheckedAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
});

/** Ops Center → Settings: who gets the low-balance alert and at what threshold. */
export const getCohoGiftCardSettings = query({
  args: {},
  returns: cohoGiftCardSettingsValue,
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const [settings, card] = await Promise.all([
      readCohoGiftCardSettings(ctx),
      readCohoGiftCard(ctx),
    ]);
    return {
      alertRecipients: settings?.alertRecipients ?? [],
      lowBalanceThresholdUsd:
        settings?.lowBalanceThresholdUsd ?? DEFAULT_LOW_BALANCE_THRESHOLD_USD,
      balanceUsd: card?.balanceUsd ?? null,
      lastCheckedAt: card?.lastCheckedAt ?? null,
      lastError: card?.lastError ?? null,
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
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);

    if (!Number.isFinite(args.lowBalanceThresholdUsd) || args.lowBalanceThresholdUsd < 0) {
      throw new Error("Threshold must be zero or more.");
    }

    const recipients = normalizeAlertRecipients(args.alertRecipients);

    const settings = await getOrCreateCohoGiftCardSettings(ctx);
    await ctx.db.patch(settings._id, {
      alertRecipients: recipients,
      lowBalanceThresholdUsd: args.lowBalanceThresholdUsd,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * The shared card for crew who are working now or soon. Returns the card
 * number (the QR payload) only — never the token, history, or linked cards.
 */
export const getMyCohoGiftCard = query({
  args: { now: v.number() },
  returns: v.union(myCohoGiftCardValue, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = getUserId(user);

    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_userId_and_startsAt", (q) =>
        q.eq("userId", userId).gte("startsAt", args.now - CREW_SHIFT_LOOKAHEAD_MS),
      )
      .take(CREW_SHIFT_SCAN_CAP);
    const isWorking = shifts.some(
      (shift) => shift.endsAt >= args.now && shift.startsAt <= args.now + CREW_SHIFT_LOOKAHEAD_MS,
    );
    if (!isWorking) return null;

    const card = await readCohoGiftCard(ctx);
    if (!card) return null;

    return { cardNumber: card.cardNumber };
  },
});
