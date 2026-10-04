import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import { extractGrantedReferences, parseGrantedStatement } from "./lib/grantedStatement";

/**
 * Convex strings cap at 1 MB. A statement runs about 1.2 KB a row, so this
 * fits several hundred rows; longer ranges are split into several imports.
 */
const MAX_STATEMENT_CHARS = 1_000_000;

const importResultValidator = v.object({
  accounts: v.array(v.string()),
  statementDate: v.optional(v.string()),
  added: v.number(),
  alreadyImported: v.number(),
  pending: v.number(),
});

/**
 * Import a GrantED "VSO Account Statement" Excel export (its raw HTML text).
 * Posted rows already imported are skipped; the accounts' pending rows are
 * replaced by the statement's.
 */
export const importStatement = mutation({
  args: { html: v.string() },
  returns: importResultValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await importGrantedStatement(ctx, args.html, getUserId(user));
  },
});

/** Shared by every way a statement arrives (upload today; a sync agent later). */
async function importGrantedStatement(ctx: MutationCtx, html: string, userId: string) {
  if (html.length >= MAX_STATEMENT_CHARS) {
    throw new Error("This statement is too large. Export a shorter date range and import it in parts.");
  }
  const statement = parseGrantedStatement(html);
  const now = Date.now();

  // An older statement imported late must not overwrite a newer balance or
  // bring back requests that have since posted.
  const latestAccounts = new Set<string>();
  for (const account of statement.accounts) {
    const existing = await ctx.db
      .query("grantedAccounts")
      .withIndex("by_accountNumber", (q) => q.eq("accountNumber", account.accountNumber))
      .unique();
    const fields = {
      ...account,
      statementDate: statement.statementDate ?? "",
      importedAt: now,
      importedByUserId: userId,
    };
    if (!existing) await ctx.db.insert("grantedAccounts", fields);
    else if (fields.statementDate >= existing.statementDate) await ctx.db.patch(existing._id, fields);
    else continue;
    latestAccounts.add(account.accountNumber);

    for (const stale of await ctx.db
      .query("grantedLedgerEntries")
      .withIndex("by_accountNumber_and_pending", (q) =>
        q.eq("accountNumber", account.accountNumber).eq("pending", true),
      )
      .take(500)) {
      await ctx.db.delete(stale._id);
    }
  }

  let added = 0;
  let alreadyImported = 0;
  let pending = 0;
  for (const row of statement.rows) {
    if (row.pending) {
      if (!latestAccounts.has(row.accountNumber)) continue;
      pending += 1;
    } else {
      const existing = await ctx.db
        .query("grantedLedgerEntries")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", row.fingerprint))
        .first();
      if (existing) {
        alreadyImported += 1;
        continue;
      }
      added += 1;
    }
    await ctx.db.insert("grantedLedgerEntries", {
      ...row,
      ...extractGrantedReferences(row.source, row.description),
      importedAt: now,
    });
  }

  return {
    accounts: statement.accounts.map((account) => account.accountNumber),
    statementDate: statement.statementDate,
    added,
    alreadyImported,
    pending,
  };
}

export const listAccounts = query({
  args: {},
  returns: v.array(
    v.object({
      accountNumber: v.string(),
      accountName: v.string(),
      balanceUsd: v.number(),
      statementDate: v.string(),
      importedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    const accounts = await ctx.db.query("grantedAccounts").take(20);
    return accounts
      .map(({ accountNumber, accountName, balanceUsd, statementDate, importedAt }) => ({
        accountNumber,
        accountName,
        balanceUsd,
        statementDate,
        importedAt,
      }))
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  },
});

const invoiceMatchValidator = v.object({
  _id: v.id("invoices"),
  invoiceNumber: v.string(),
  clientGroupName: v.optional(v.string()),
  totalUsd: v.number(),
  paymentReceivedAt: v.optional(v.number()),
});

const payoutMatchValidator = v.object({
  _id: v.id("eventBandPayments"),
  status: v.string(),
  payeeName: v.optional(v.string()),
  totalUsd: v.number(),
  servicePaymentNumber: v.optional(v.string()),
});

const entryValidator = v.object({
  _id: v.id("grantedLedgerEntries"),
  postedOn: v.string(),
  source: v.string(),
  payee: v.optional(v.string()),
  description: v.string(),
  depositUsd: v.number(),
  withdrawalUsd: v.number(),
  balanceUsd: v.number(),
  pending: v.boolean(),
  legacyInvoiceNumbers: v.array(v.string()),
  grantedNumbers: v.array(v.string()),
  requests: v.array(
    v.object({
      _id: v.id("eventRequests"),
      requestNumber: v.string(),
      eventName: v.optional(v.string()),
    }),
  ),
  invoices: v.array(invoiceMatchValidator),
  /** Payouts carrying this row's S-number. */
  payouts: v.array(payoutMatchValidator),
  /** Unpaid payouts whose payee and amount fit this S-row (only `confirmed` ones can be marked paid). */
  suggestedPayouts: v.array(payoutMatchValidator),
  /**
   * Paid payouts with this row's payee and amount whose recorded number isn't
   * an S-number (a typo or a pasted reimbursement number): offer a correction.
   */
  misnumberedPayouts: v.array(payoutMatchValidator),
});

/** One account's ledger, newest first, with the portal records each row names. */
export const listEntries = query({
  args: { accountNumber: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(entryValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const result = await ctx.db
      .query("grantedLedgerEntries")
      .withIndex("by_accountNumber_and_postedOn", (q) => q.eq("accountNumber", args.accountNumber))
      .order("desc")
      .paginate(args.paginationOpts);
    const matcher = new LedgerMatcher(ctx);
    const page = [];
    for (const entry of result.page) page.push(await matcher.describe(entry));
    return { ...result, page };
  },
});

const OPEN_PAYOUT_STATUSES = [
  "confirmed",
  "awaiting_confirmation",
  "pending_email",
  "pending_payee",
] as const;

const S_NUMBER = /^S-?\d{6}$/i;

/** Same amount, and every part of the payee's name appears in the row. */
function fitsRow(payout: Doc<"eventBandPayments">, entry: Doc<"grantedLedgerEntries">) {
  if (Math.abs(payout.totalUsd - entry.withdrawalUsd) >= 0.005) return false;
  const text = `${entry.payee ?? ""} ${entry.description}`.toLowerCase();
  const names = (payout.designatedPayeeName ?? "").toLowerCase().split(/\s+/).filter((n) => n.length > 1);
  return names.length > 0 && names.every((name) => text.includes(name));
}

class LedgerMatcher {
  private openPayouts: Doc<"eventBandPayments">[] | undefined;
  private paidPayouts: Doc<"eventBandPayments">[] | undefined;

  constructor(private readonly ctx: QueryCtx) {}

  async describe(entry: Doc<"grantedLedgerEntries">) {
    const requests = [];
    const invoiceIds = new Set<Id<"invoices">>();
    for (const requestNumber of entry.requestNumbers) {
      const request = await this.ctx.db
        .query("eventRequests")
        .withIndex("by_requestNumber", (q) => q.eq("requestNumber", requestNumber))
        .first();
      if (!request) continue;
      requests.push({ _id: request._id, requestNumber, eventName: request.eventName });
      if (request.linkedInvoiceId) invoiceIds.add(request.linkedInvoiceId);
    }
    const invoices = [];
    for (const invoiceNumber of entry.invoiceNumbers) {
      const invoice = await this.ctx.db
        .query("invoices")
        .withIndex("by_invoiceNumber", (q) => q.eq("invoiceNumber", invoiceNumber))
        .first();
      if (invoice) invoiceIds.add(invoice._id);
    }
    for (const invoiceId of invoiceIds) {
      const invoice = await this.ctx.db.get(invoiceId);
      if (!invoice) continue;
      invoices.push({
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        clientGroupName: invoice.clientGroupName,
        totalUsd: invoice.totalUsd,
        paymentReceivedAt: invoice.paymentReceivedAt,
      });
    }

    const payouts = [];
    const suggestedPayouts = [];
    const misnumberedPayouts = [];
    const sNumbers = entry.grantedNumbers.filter((n) => n.startsWith("S-"));
    for (const number of sNumbers) {
      // Staff type the number by hand, with or without the hyphen.
      for (const spelling of new Set([number, number.replace("-", "")])) {
        for (const payout of await this.ctx.db
          .query("eventBandPayments")
          .withIndex("by_servicePaymentNumber", (q) => q.eq("servicePaymentNumber", spelling))
          .take(5)) {
          payouts.push(payoutMatch(payout));
        }
      }
    }
    if (payouts.length === 0 && sNumbers.length > 0) {
      for (const payout of await this.loadOpenPayouts()) {
        if (fitsRow(payout, entry)) suggestedPayouts.push(payoutMatch(payout));
      }
      // A paid payout already holding another S-number is a different payment.
      for (const payout of await this.loadRecentlyPaidPayouts()) {
        if (!S_NUMBER.test(payout.servicePaymentNumber?.trim() ?? "") && fitsRow(payout, entry)) {
          misnumberedPayouts.push(payoutMatch(payout));
        }
      }
    }

    return {
      _id: entry._id,
      postedOn: entry.postedOn,
      source: entry.source,
      payee: entry.payee,
      description: entry.description,
      depositUsd: entry.depositUsd,
      withdrawalUsd: entry.withdrawalUsd,
      balanceUsd: entry.balanceUsd,
      pending: entry.pending,
      legacyInvoiceNumbers: entry.legacyInvoiceNumbers,
      grantedNumbers: entry.grantedNumbers,
      requests,
      invoices,
      payouts,
      suggestedPayouts,
      misnumberedPayouts,
    };
  }

  private async loadRecentlyPaidPayouts() {
    this.paidPayouts ??= await this.ctx.db
      .query("eventBandPayments")
      .withIndex("by_paidAt")
      .order("desc")
      .take(200);
    return this.paidPayouts.filter((payout) => payout.status === "paid");
  }

  /**
   * GrantED often pays before the artist signs in the portal, so match every
   * payout that has a payee and isn't paid or cancelled yet.
   */
  private async loadOpenPayouts() {
    if (!this.openPayouts) {
      this.openPayouts = [];
      for (const status of OPEN_PAYOUT_STATUSES) {
        this.openPayouts.push(
          ...(await this.ctx.db
            .query("eventBandPayments")
            .withIndex("by_status", (q) => q.eq("status", status))
            .take(200)),
        );
      }
    }
    return this.openPayouts;
  }
}

function payoutMatch(payout: Doc<"eventBandPayments">) {
  return {
    _id: payout._id,
    status: payout.status,
    payeeName: payout.designatedPayeeName,
    totalUsd: payout.totalUsd,
    servicePaymentNumber: payout.servicePaymentNumber,
  };
}
