import { test, expect } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import { e2eEnv } from "../helpers/env";
import { createDraftInvoiceWithArtistLine } from "../helpers/invoice";

type EditorState = {
  publicApprovalToken: string | null;
  publicPath: string | null;
};

/**
 * Regenerating a standalone quote's public approval token revokes the old link.
 *
 * This is the closest thing the quote surface has to a credential rotation: the
 * token *is* the authorization to view and approve the quote, so a regeneration
 * that left the previous URL working would be a live access leak. Asserting the
 * new link works is not enough on its own — the old one has to stop.
 */
test.describe("invoice approval token regeneration", () => {
  // Creates a draft, then loads three public pages in a second context. The
  // 90s project default is not enough: in dev mode `/event/[token]` compiles on
  // first request, and each `goto` re-subscribes a fresh Convex client.
  test.setTimeout(180_000);

  test("regenerating the token invalidates the previous public link", async ({ page, browser }) => {
    const stamp = Date.now();
    const invoiceId = await createDraftInvoiceWithArtistLine(page, {
      label: `E2E Token Artist ${stamp}`,
      quantity: "1",
      rate: "125",
    });

    // Standalone quotes get the approval-link card, not the request portal.
    await expect(page.getByTestId("invoice-quote-approval")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("invoice-request-portal")).toHaveCount(0);

    const before = await pollConvex<EditorState>(
      "e2eHelpers:getInvoiceEditorState",
      { invoiceId },
      (row) => Boolean(row?.publicApprovalToken),
    );
    const oldPath = before.publicPath!;

    const clientContext = await browser.newContext({ baseURL: e2eEnv.baseURL });
    try {
      const clientPage = await clientContext.newPage();

      // The original link works.
      await clientPage.goto(oldPath);
      await expect(clientPage.getByText(/Terms & Conditions/i).first()).toBeVisible({
        timeout: 25_000,
      });

      // Regeneration sits behind a `window.confirm`. Dismissing it must leave the
      // existing link alone — a rotation the operator declined would otherwise
      // silently break a link already sent to a client.
      page.once("dialog", (dialog) => void dialog.dismiss());
      await page.getByTestId("invoice-regenerate-token").click();
      await expect(page.getByTestId("invoice-approval-link")).toHaveValue(
        new RegExp(`${before.publicApprovalToken}$`),
      );
      await clientPage.goto(oldPath);
      await expect(clientPage.getByText(/Terms & Conditions/i).first()).toBeVisible({
        timeout: 25_000,
      });

      // Accepting it rotates.
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByTestId("invoice-regenerate-token").click();

      const after = await pollConvex<EditorState>(
        "e2eHelpers:getInvoiceEditorState",
        { invoiceId },
        (row) => Boolean(row?.publicApprovalToken) && row?.publicPath !== oldPath,
      );
      const newPath = after.publicPath!;
      expect(newPath).not.toBe(oldPath);

      // The editor's own link field reflects the rotation. Matched on the token
      // rather than the whole URL: the input holds an absolute URL built from
      // window.location.origin, and the port varies between runs.
      await expect(page.getByTestId("invoice-approval-link")).toHaveValue(
        new RegExp(`${after.publicApprovalToken}$`),
      );

      // The old link is dead.
      await clientPage.goto(oldPath);
      await expect(clientPage.getByText("Quote unavailable").first()).toBeVisible({
        timeout: 25_000,
      });
      await expect(clientPage.getByText(/invalid or expired/i).first()).toBeVisible({
        timeout: 25_000,
      });

      // The new link works.
      await clientPage.goto(newPath);
      await expect(clientPage.getByText(/Terms & Conditions/i).first()).toBeVisible({
        timeout: 25_000,
      });
    } finally {
      await clientContext.close();
    }
  });
});
