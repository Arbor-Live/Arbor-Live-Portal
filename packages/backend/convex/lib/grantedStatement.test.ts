import { describe, expect, it } from "vitest";
import { extractGrantedReferences, parseGrantedStatement } from "./grantedStatement";

/** Trimmed copy of the BI Publisher markup GrantED exports, with made-up rows. */
function statementHtml(rows: string[][]) {
  const cell = (text: string) => `<td valign="top" class="c62"><p class="c63"><span class="c28">${text}</span></p>\n</td>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
<table class="c12">
<tr class="c0">${cell("Arbor Live [5001]")}<td class="c4"></td></tr>
<tr class="c6">${cell("SSE Capital Group - ACCOUNT STATEMENT")}${cell("10/03/2026")}</tr>
</table>
<table class="c31">
<tr class="c15">${cell("<b>Account Summary</b>")}</tr>
<tr class="c19"><td valign="top" class="c20"><table class="c29">
<tr class="c21">${cell("01-5001-20-2860 ")}${cell("University Collected Funds")}${cell("<b>$1,013.50</b>")}</tr>
</table>
<p class="c30"><br/></p>
</td>
</tr>
</table>
<table class="c77">
<tr class="c33"><td colspan="3"><p><br/></p></td><td colspan="4"></td><td colspan="2"></td></tr>
<tr class="c40">${cell("<b>01-5001-20-2860</b>")}${cell("<b>University Collected Funds</b>")}<td colspan="2"></td></tr>
<tr class="c46">${["date", "source", "payee", "reference", "deposit", "withdrawal", "balance"].map((h) => cell(`<b>${h}</b>`)).join("")}</tr>
${rows.map((row) => `<tr class="c61">${row.map(cell).join("")}</tr>`).join("\n")}
</table>
</body></html>`;
}

const sample = statementHtml([
  ["09/21/26", "iJournal", "", "Event support for Fall Carnival (ALREQ-XLTUBZB) &amp; more", "<b>$1,200.00</b>", "<b>$0.00</b>", "<b>&nbsp;&nbsp; $1,700.00</b>"],
  ["09/22/26", "Purchase Invoices", "", "Journal Import 5714110: S-006038 Pat Doe Electronic Signature", "$0.00", "$75.00", "$1,625.00"],
  ["09/22/26", "Purchase Invoices", "", "Journal Import 5714110: S-006038 Pat Doe Electronic Signature", "$0.00", "$75.00", "$1,550.00"],
  ["10/03/26", "R-122347", "Doe, Sam", "Batteries", "$0.00", "($36.50)", "$1,013.50"],
]);

describe("parseGrantedStatement", () => {
  it("reads the header, account summary and ledger rows", () => {
    const statement = parseGrantedStatement(sample);
    expect(statement).toMatchObject({
      organizationName: "Arbor Live",
      assuNumber: "5001",
      statementDate: "2026-10-03",
      accounts: [{ accountNumber: "01-5001-20-2860", accountName: "University Collected Funds", balanceUsd: 1013.5 }],
    });
    expect(statement.rows).toHaveLength(4);
    expect(statement.rows[0]).toMatchObject({
      accountNumber: "01-5001-20-2860",
      postedOn: "2026-09-21",
      source: "iJournal",
      description: "Event support for Fall Carnival (ALREQ-XLTUBZB) & more",
      depositUsd: 1200,
      withdrawalUsd: 0,
      balanceUsd: 1700,
      pending: false,
    });
    expect(statement.rows[0].payee).toBeUndefined();
  });

  it("marks rows sourced by a GrantED request number as pending", () => {
    const last = parseGrantedStatement(sample).rows[3];
    expect(last).toMatchObject({ source: "R-122347", payee: "Doe, Sam", pending: true, withdrawalUsd: -36.5 });
  });

  it("keeps identical rows apart and ignores the running balance", () => {
    const [, first, second] = parseGrantedStatement(sample).rows;
    expect(first.fingerprint).not.toBe(second.fingerprint);
    const shifted = parseGrantedStatement(sample.replace("$1,625.00", "$9,999.00"));
    expect(shifted.rows[1].fingerprint).toBe(first.fingerprint);
  });

  it("rejects files that are not a statement", () => {
    expect(() => parseGrantedStatement("<html><table><tr><td>hi</td></tr></table></html>")).toThrow(
      /GrantED VSO Account Statement/,
    );
  });
});

describe("extractGrantedReferences", () => {
  it("finds portal and GrantED numbers", () => {
    expect(
      extractGrantedReferences("S-006038", "Payment ALREQ-XLTUBZB, alinv-4K8Z2NP, INV.#AL250148 for PO-001551"),
    ).toEqual({
      requestNumbers: ["ALREQ-XLTUBZB"],
      invoiceNumbers: ["ALINV-4K8Z2NP"],
      legacyInvoiceNumbers: ["AL250148"],
      grantedNumbers: ["S-006038", "PO-001551"],
    });
  });
});
