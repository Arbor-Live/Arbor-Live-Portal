import { test, expect, type Page } from "@playwright/test";
import { pollConvex } from "../helpers/convex";
import { invoiceIdFromUrl, saveInvoiceEditor, waitForInvoiceEditorUrl } from "../helpers/invoice";

type GroupState = {
  groupId: string;
  name: string;
  type: string;
  active: boolean;
  equipmentPricingMode: string;
  contacts: Array<{ contactId: string; email: string | null; active: boolean }>;
};

type ClientState = {
  hasGroupId: boolean;
  hasContactId: boolean;
  clientGroupName: string | null;
  clientGroupType: string | null;
  clientContactName: string | null;
  equipmentPricingMode: string;
};

/**
 * Open a SearchableSelect, search it, and pick the first matching option.
 *
 * Both halves of this are load-bearing, for the same underlying reason:
 * `SearchableSelect` portals its menu to `document.body` and pins it with
 * `position: fixed` at `trigger.bottom + 4`, with no flip-up behaviour, then
 * recomputes that on every scroll event.
 *
 * 1. Center the trigger first. `scrollIntoViewIfNeeded` is not enough — it stops
 *    as soon as the trigger is barely visible, typically at the bottom edge,
 *    which lays the menu out past the fold. Because the menu is `fixed`, nothing
 *    can scroll it back into view and the click fails "outside of the viewport".
 * 2. Click with `force`, because Playwright's own scroll-into-view fires the
 *    reposition listener, which moves the element, so the "stable" actionability
 *    check never settles and an ordinary click spins until the test times out.
 */
async function pickSearchableOption(
  page: Page,
  fieldTestId: string,
  searchPlaceholder: string,
  query: string,
  optionName: RegExp,
) {
  const field = page.getByTestId(fieldTestId);
  await field.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const trigger = field.getByTestId("searchable-select-trigger");
  await trigger.click();
  await page.getByPlaceholder(searchPlaceholder).fill(query);

  const option = page.getByRole("button", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 25_000 });
  await option.click({ force: true });

  // Confirm the pick landed. `force` skips the "receives pointer events" check,
  // so a click that missed would otherwise leave the menu open — and an open
  // menu keeps its scroll listener installed, which makes every later click on
  // the page fail the "stable" actionability check.
  await expect(trigger).toHaveText(optionName, { timeout: 25_000 });
  await expect(page.getByPlaceholder(searchPlaceholder)).toHaveCount(0, { timeout: 25_000 });
}

/**
 * Host organizations and their client contacts, end to end onto an invoice.
 *
 * The organizations page is the only way to create the billing entities an
 * invoice can reference — the editor's Host/Contact pickers are dropdowns over
 * these rows, deliberately not freeform text. This closes the "host orgs" gap
 * that the coverage doc had carried as Deferred.
 *
 * A host also carries `equipmentPricingMode`, which the editor applies to the
 * invoice when the host is selected, so picking a non-subsidized host has to
 * change how equipment is priced on that quote.
 */
test.describe("invoice host organizations and contacts", () => {
  // Spans three pages (organizations, invoice editor, back to organizations) with
  // a save in between, which does not fit the 90s project default.
  test.setTimeout(180_000);

  test("admin creates a host and contact, uses them on an invoice, then archives", async ({
    page,
  }) => {
    const stamp = Date.now();
    const hostName = `E2E Host ${stamp}`;
    const contactFirst = `Reese${stamp}`;
    const contactLast = "Testerly";
    const contactEmail = `e2e-host-${stamp}@example.com`;

    await page.goto("/dashboard/financial-hub/organizations");
    await expect(page.getByText("Host organizations").first()).toBeVisible({ timeout: 25_000 });

    // Create the host as non-subsidized so its pricing mode is distinguishable
    // from the "subsidized" default.
    const createForm = page.locator("form").filter({ has: page.getByPlaceholder("New host name") });
    await createForm.getByPlaceholder("New host name").fill(hostName);
    await createForm.locator("select").nth(1).selectOption("nonSubsidized");
    await createForm.getByRole("button", { name: "Add host" }).click();

    const group = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: hostName },
      (row) => Boolean(row?.groupId),
    );
    expect(group.active).toBe(true);
    expect(group.equipmentPricingMode).toBe("nonSubsidized");

    // Select the host, then add a client contact under it.
    await page.getByRole("button").filter({ hasText: hostName }).first().click();
    await expect(page.getByText(`Edit host: ${hostName}`)).toBeVisible({ timeout: 25_000 });

    const contactForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add client" }) });
    await contactForm.getByPlaceholder("First name").fill(contactFirst);
    await contactForm.getByPlaceholder("Last name").fill(contactLast);
    await contactForm.getByPlaceholder("Email").fill(contactEmail);
    await contactForm.getByPlaceholder("Phone").fill("6505550123");
    await contactForm.getByRole("button", { name: "Add client" }).click();

    const withContact = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: hostName },
      (row) => (row?.contacts ?? []).some((contact) => contact.email === contactEmail),
    );
    expect(withContact.contacts.some((contact) => contact.email === contactEmail)).toBe(true);

    // Now bill an invoice to them through the editor's pickers.
    await page.goto("/dashboard/financial-hub/invoices/new");
    await expect(page.getByText("Create Invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    // Line items first, pickers second. Opening a SearchableSelect installs a
    // capture-phase scroll listener that re-renders on every scroll event, so
    // any later click in the main column fights Playwright's scroll-into-view.
    await page.getByRole("button", { name: "Add artist row" }).click();
    const artistRow = page.getByTestId("invoice-row-artist-0");
    await artistRow.getByPlaceholder("Artist / role").fill(`E2E Host Artist ${stamp}`);
    await artistRow.getByPlaceholder("Qty").fill("1");
    await artistRow.getByPlaceholder("Rate").fill("90");

    // The picker labels hosts as "{name} ({type})", so match on the name prefix.
    await pickSearchableOption(
      page,
      "invoice-host-select",
      "Search hosts...",
      hostName,
      new RegExp(`^${hostName}\\b`),
    );
    // Match the contact on its email, not its first name. The picker also
    // renders a `New Client: "<query>"` button when the query is not an exact
    // label match, and that button is the only hit until the contacts query
    // resolves — so a name-based locator can settle on it and open the create
    // modal instead of selecting anyone.
    await pickSearchableOption(
      page,
      "invoice-contact-select",
      "Search contacts...",
      contactFirst,
      new RegExp(contactEmail.replace(/[.+]/g, "\\$&")),
    );

    await expect(page.getByText("Unsaved changes")).toBeVisible({ timeout: 30_000 });
    await saveInvoiceEditor(page);
    await waitForInvoiceEditorUrl(page);
    const invoiceId = invoiceIdFromUrl(page);

    const billed = await pollConvex<ClientState>(
      "e2eHelpers:getInvoiceClientState",
      { invoiceId },
      (row) => row?.hasGroupId === true && row?.hasContactId === true,
    );
    expect(billed.clientGroupName).toBe(hostName);
    expect(billed.clientContactName).toContain(contactFirst);
    // The host's pricing mode carried onto the invoice.
    expect(billed.equipmentPricingMode).toBe("nonSubsidized");

    // Archiving drops the host out of the default (active-only) list.
    await page.goto("/dashboard/financial-hub/organizations");
    await page.getByRole("button").filter({ hasText: hostName }).first().click();
    const editCard = page.locator("[data-slot='card']").filter({ hasText: `Edit host: ${hostName}` });
    await expect(editCard).toBeVisible({ timeout: 25_000 });

    // Two buttons read exactly "Archive" once the host has a contact — the host's
    // own and the contact row's — and nothing in either subtree distinguishes
    // them by text. The host form is rendered before the "Client contacts"
    // block, so take the first.
    const archiveHost = editCard
      .getByRole("button", { name: "Archive", exact: true })
      .first();

    // Archiving is behind a `window.confirm`, which Playwright dismisses by default.
    page.once("dialog", (dialog) => void dialog.accept());
    await archiveHost.click();

    const archived = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: hostName },
      (row) => row?.active === false,
    );
    expect(archived.active).toBe(false);

    await expect(page.getByRole("button").filter({ hasText: hostName })).toHaveCount(0, {
      timeout: 25_000,
    });

    // ...but "Show archived" brings it back into view.
    await page.getByText("Show archived").click();
    await expect(page.getByRole("button").filter({ hasText: hostName }).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test("admin merges duplicate hosts and keeps invoice on survivor", async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const survivorName = `E2E Merge Survivor ${stamp}`;
    const victimName = `E2E Merge Victim ${stamp}`;

    await page.goto("/dashboard/financial-hub/organizations");
    await expect(page.getByText("Host organizations").first()).toBeVisible({ timeout: 25_000 });

    const createForm = page.locator("form").filter({ has: page.getByPlaceholder("New host name") });
    await createForm.getByPlaceholder("New host name").fill(survivorName);
    await createForm.getByRole("button", { name: "Add host" }).click();
    await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: survivorName },
      (row) => Boolean(row?.groupId),
    );

    await createForm.getByPlaceholder("New host name").fill(victimName);
    await createForm.getByRole("button", { name: "Add host" }).click();
    await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: victimName },
      (row) => Boolean(row?.groupId),
    );

    await page.getByRole("button").filter({ hasText: survivorName }).first().click();
    await expect(page.getByText(`Edit host: ${survivorName}`)).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "Merge into this host…" }).click();
    await expect(page.getByTestId("host-merge-panel")).toBeVisible();
    await page.getByRole("checkbox", { name: victimName }).check();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("host-merge-confirm").click();

    const survivor = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: survivorName },
      (row) => Boolean(row?.groupId && row.active),
    );
    expect(survivor.active).toBe(true);

    const victim = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: victimName },
      (row) => row?.active === false,
    );
    expect(victim.active).toBe(false);

    await expect(page.getByTestId("host-alias-list")).toContainText(victimName, { timeout: 25_000 });
  });
});
