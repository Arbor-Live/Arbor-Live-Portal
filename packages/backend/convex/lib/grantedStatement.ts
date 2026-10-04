/**
 * Parser for GrantED's "VSO Account Statement Report" Excel export.
 *
 * The export is a BI Publisher HTML table saved as `.xls`, not a spreadsheet:
 * an org header (`Arbor Live [5001]`), the statement date, an account summary
 * (number, name, balance), then per account a ledger of
 * date · source · payee · reference · deposit · withdrawal · balance.
 *
 * Rows whose source is a GrantED request number (`S-006044`, `R-122347`,
 * `PO-001551`) are pending: they are already deducted from the balance but not
 * yet posted. Once posted they reappear as a `Purchase Invoices` row on a later
 * date, so pending rows are a snapshot to replace, not entries to keep.
 */

export type GrantedStatementAccount = {
  accountNumber: string;
  accountName: string;
  balanceUsd: number;
};

export type GrantedStatementRow = {
  accountNumber: string;
  /** Calendar day, `YYYY-MM-DD`. */
  postedOn: string;
  source: string;
  payee?: string;
  description: string;
  depositUsd: number;
  withdrawalUsd: number;
  balanceUsd: number;
  pending: boolean;
  /** Stable identity across overlapping imports; see `withFingerprints`. */
  fingerprint: string;
};

export type ParsedGrantedStatement = {
  organizationName?: string;
  assuNumber?: string;
  /** `YYYY-MM-DD`. */
  statementDate?: string;
  accounts: GrantedStatementAccount[];
  rows: GrantedStatementRow[];
};

const ACCOUNT_NUMBER = /^\d{2}-\d{4}-\d{2}-\d{4}$/;
const PENDING_SOURCE = /^[A-Z]{1,3}-\d+$/;

export function parseGrantedStatement(html: string): ParsedGrantedStatement {
  const statement: ParsedGrantedStatement = { accounts: [], rows: [] };
  let currentAccount: string | undefined;
  const rows: Omit<GrantedStatementRow, "fingerprint">[] = [];

  for (const cells of leafTableRows(html)) {
    const [first = "", second = "", third = ""] = cells;
    const org = /^(.+?)\s*\[(\d+)\]$/.exec(first);
    if (org && !statement.organizationName) {
      statement.organizationName = org[1];
      statement.assuNumber = org[2];
      continue;
    }
    if (/ACCOUNT STATEMENT/i.test(first)) {
      statement.statementDate = parseUsDate(second);
      continue;
    }
    if (ACCOUNT_NUMBER.test(first)) {
      const balanceUsd = parseUsd(third);
      if (balanceUsd !== undefined) {
        statement.accounts.push({ accountNumber: first, accountName: second, balanceUsd });
      } else {
        currentAccount = first;
      }
      continue;
    }
    if (cells.length !== 7 || !currentAccount) continue;
    const postedOn = parseUsDate(first);
    const [, source, payee, description, deposit, withdrawal, balance] = cells;
    if (!postedOn) continue;
    rows.push({
      accountNumber: currentAccount,
      postedOn,
      source,
      ...(payee ? { payee } : {}),
      description,
      depositUsd: parseUsd(deposit) ?? 0,
      withdrawalUsd: parseUsd(withdrawal) ?? 0,
      balanceUsd: parseUsd(balance) ?? 0,
      pending: PENDING_SOURCE.test(source),
    });
  }

  if (!statement.organizationName || statement.accounts.length === 0) {
    throw new Error(
      "This doesn't look like a GrantED VSO Account Statement. Export it from GrantED → Reports with Type: Excel.",
    );
  }
  statement.rows = withFingerprints(rows);
  return statement;
}

/**
 * The running balance is left out on purpose: a backdated posting shifts every
 * later balance, and those rows must still match what is already imported.
 * Identical rows on the same day are told apart by their order in the file.
 */
function withFingerprints(rows: Omit<GrantedStatementRow, "fingerprint">[]): GrantedStatementRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = [
      row.accountNumber,
      row.postedOn,
      row.source,
      row.payee ?? "",
      row.description,
      row.depositUsd.toFixed(2),
      row.withdrawalUsd.toFixed(2),
    ].join("|");
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return { ...row, fingerprint: `${key}|${occurrence}` };
  });
}

export type GrantedReferences = {
  /** `ALREQ-XXXXXXX` booking request numbers. */
  requestNumbers: string[];
  /** `ALINV-XXXXXXX` invoice numbers. */
  invoiceNumbers: string[];
  /** Pre-portal invoice numbers such as `AL250179`. */
  legacyInvoiceNumbers: string[];
  /** `ALBPAY-XXXXXXX` artist payout IDs, typed into the GrantED line description. */
  payoutNumbers: string[];
  /** GrantED's own numbers: `S-` payouts, `R-` reimbursements, `PO-`, `I-`. */
  grantedNumbers: string[];
};

export function extractGrantedReferences(...texts: (string | undefined)[]): GrantedReferences {
  const text = texts.filter(Boolean).join(" ").toUpperCase();
  const all = (pattern: RegExp, format: (match: RegExpExecArray) => string) =>
    [...new Set([...text.matchAll(pattern)].map(format))];
  return {
    requestNumbers: all(/\bALREQ-?([0-9A-Z]{7})\b/g, (m) => `ALREQ-${m[1]}`),
    invoiceNumbers: all(/\bALINV-?([0-9A-Z]{7})\b/g, (m) => `ALINV-${m[1]}`),
    legacyInvoiceNumbers: all(/\bAL(\d{6})\b/g, (m) => `AL${m[1]}`),
    payoutNumbers: all(/\bALBPAY-?([0-9A-Z]{7})\b/g, (m) => `ALBPAY-${m[1]}`),
    grantedNumbers: all(/\b(S|R|PO|I)-(\d{6})\b/g, (m) => `${m[1]}-${m[2]}`),
  };
}

/** `07/31/26` or `10/03/2026` → `2026-07-31`. */
function parseUsDate(value: string): string | undefined {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

/** `$1,975.00`, `($12.00)` or `-$12.00`; anything else is undefined. */
function parseUsd(value: string): number | undefined {
  const trimmed = value.trim();
  const match = /^(-)?\(?(-)?\$\s?([\d,]+(?:\.\d+)?)\)?$/.exec(trimmed);
  if (!match) return undefined;
  const amount = Number(match[3].replace(/,/g, ""));
  const negative = Boolean(match[1] || match[2] || trimmed.startsWith("("));
  return negative ? -amount : amount;
}

/**
 * Rows of text cells, innermost tables only. The summary nests a table inside
 * a cell; an outer cell that wraps an inner table is dropped.
 */
function leafTableRows(html: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let cellStart: number | undefined;
  const tags = /<(\/?)(tr|td|th)\b[^>]*>/gi;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (tag === "tr") {
      if (cells.length > 0) rows.push(cells);
      cells = [];
      cellStart = undefined;
    } else if (!closing) {
      cellStart = tags.lastIndex;
    } else if (cellStart !== undefined) {
      cells.push(cellText(html.slice(cellStart, match.index)));
      cellStart = undefined;
    }
  }
  if (cells.length > 0) rows.push(cells);
  return rows;
}

function cellText(fragment: string): string {
  return decodeEntities(fragment.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
