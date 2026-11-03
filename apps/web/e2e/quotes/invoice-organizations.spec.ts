import { test, expect, type Page } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
import { pollConvex } from "../helpers/convex";
import { formField } from "../helpers/form";
import {
  addInvoiceLine,
  invoiceIdFromUrl,
  saveInvoiceEditor,
  waitForInvoiceEditorUrl,
} from "../helpers/invoice";
import { fillSearchableSelectQuery, pickSelectOption } from "../helpers/select";

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

/** Create a host through the New host dialog; resolves once Convex has it. */
async function createHost(page: Page, name: string, pricing?: string) {
  await page.getByRole("button", { name: "New host" }).click();
  const dialog = page.getByTestId("new-host-dialog");
  await expect(dialog).toBeVisible({ timeout: 25_000 });
  await formField(dialog, "Name").fill(name);
  if (pricing) await pickSelectOption(page, dialog.locator("#new-host-pricing"), pricing);
  await dialog.getByRole("button", { name: "Add host" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 25_000 });
  return pollConvex<GroupState>("e2eHelpers:getInvoiceGroupByName", { name }, (row) => Boolean(row?.groupId));
}

function hostsPage(groupId?: string) {
  return groupId ? `/dashboard/ops-center/organizations?host=${groupId}` : "/dashboard/ops-center/organizations";
}

/**
 * Open a SearchableSelect, search it, and pick the first matching option.
 */
async function pickSearchableOption(
  page: Page,
  fieldTestId: string,
  _searchPlaceholder: string,
  query: string,
  optionName: RegExp,
  selectedText: RegExp = optionName,
) {
  const field = page.getByTestId(fieldTestId);
  await field.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const trigger = field.getByTestId("searchable-select-trigger");
  await trigger.click();
  const menu = page.getByTestId("searchable-select-menu");
  await expect(menu).toBeVisible({ timeout: 25_000 });
  await fillSearchableSelectQuery(menu, query);

  const option = menu.getByRole("option", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 25_000 });
  await option.click({ force: true });

  await expect(trigger).toHaveText(selectedText, { timeout: 25_000 });
  await expect(menu).toHaveCount(0, { timeout: 25_000 });
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

    await page.goto(hostsPage());
    await expect(page.getByRole("heading", { name: "Billing hosts" })).toBeVisible({ timeout: 25_000 });

    // Create the host as non-subsidized so its pricing mode is distinguishable
    // from the "subsidized" default.
    const group = await createHost(page, hostName, "Non-subsidized");
    expect(group.active).toBe(true);
    expect(group.equipmentPricingMode).toBe("nonSubsidized");

    // A new host opens in the side panel; add a client contact under it.
    const sheet = page.getByTestId("host-sheet");
    await expect(sheet.getByRole("heading", { name: hostName })).toBeVisible({ timeout: 25_000 });
    await sheet.getByRole("button", { name: "Add contact" }).click();
    const contactForm = sheet.getByTestId("host-contact-new-form");
    await formField(contactForm, "First name").fill(contactFirst);
    await formField(contactForm, "Last name").fill(contactLast);
    await formField(contactForm, "Email").fill(contactEmail);
    await formField(contactForm, "Phone").fill("6505550123");
    await contactForm.getByRole("button", { name: "Add contact" }).click();

    const withContact = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: hostName },
      (row) => (row?.contacts ?? []).some((contact) => contact.email === contactEmail),
    );
    expect(withContact.contacts.some((contact) => contact.email === contactEmail)).toBe(true);

    // Now bill an invoice to them through the editor's pickers.
    await page.goto("/dashboard/ops-center/invoices/new");
    await expect(page.getByText("Create invoice").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/E2E Admin/i).first()).toBeVisible({ timeout: 25_000 });

    // Line items first, pickers second. Opening a SearchableSelect installs a
    // capture-phase scroll listener that re-renders on every scroll event, so
    // any later click in the main column fights Playwright's scroll-into-view.
    await addInvoiceLine(page, "Artist");
    const artistRow = page.getByTestId("invoice-row-artist-0");
    await artistRow.getByPlaceholder("Artist / role").fill(`E2E Host Artist ${stamp}`);
    await artistRow.getByPlaceholder("People").fill("1");
    await artistRow.getByPlaceholder("Rate").fill("90");

    // The picker labels hosts with name + type description, so match on the name prefix.
    await pickSearchableOption(
      page,
      "invoice-host-select",
      "Search hosts...",
      hostName,
      new RegExp(`^${hostName}\\b`),
    );
    // Match the contact on its email in the menu (avoids the "New Client" create
    // button while contacts are still loading). The closed trigger shows name only.
    const contactFullName = `${contactFirst} ${contactLast}`;
    await pickSearchableOption(
      page,
      "invoice-contact-select",
      "Search contacts...",
      contactFirst,
      new RegExp(contactEmail.replace(/[.+]/g, "\\$&")),
      new RegExp(contactFullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
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

    // Archiving drops the host out of the default (active-only) list. The
    // `?host=` deep link opens its panel straight away.
    await page.goto(hostsPage(group.groupId));
    await expect(sheet.getByRole("heading", { name: hostName })).toBeVisible({ timeout: 25_000 });
    await expect(sheet.getByTestId("host-contact-list")).toContainText(contactEmail, { timeout: 25_000 });
    await sheet.getByRole("button", { name: "Archive host" }).click();
    await acceptAppDialog(page, "Archive host");

    const archived = await pollConvex<GroupState>(
      "e2eHelpers:getInvoiceGroupByName",
      { name: hostName },
      (row) => row?.active === false,
    );
    expect(archived.active).toBe(false);

    await expect(sheet.getByRole("button", { name: "Restore host" })).toBeVisible({ timeout: 25_000 });
    await page.keyboard.press("Escape");
    const row = page.getByTestId(`billing-host-row-${group.groupId}`);
    await expect(row).toHaveCount(0, { timeout: 25_000 });

    // ...but dropping the "Status is Active" filter brings it back into view.
    await page.getByRole("button", { name: "Remove the Status filter" }).click();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await expect(row).toContainText("Archived");
  });

  test("admin merges duplicate hosts and keeps invoice on survivor", async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const survivorName = `E2E Merge Survivor ${stamp}`;
    const victimName = `E2E Merge Victim ${stamp}`;

    await page.goto(hostsPage());
    await expect(page.getByRole("heading", { name: "Billing hosts" })).toBeVisible({ timeout: 25_000 });

    await createHost(page, victimName);
    await page.keyboard.press("Escape");
    const survivorGroup = await createHost(page, survivorName);

    const sheet = page.getByTestId("host-sheet");
    await expect(sheet.getByRole("heading", { name: survivorName })).toBeVisible({ timeout: 25_000 });
    await sheet.getByRole("button", { name: "Merge hosts into this one" }).click();
    const mergeDialog = page.getByTestId("host-merge-panel");
    await expect(mergeDialog).toBeVisible();
    await mergeDialog.getByLabel("Search hosts to merge").fill(victimName);
    await mergeDialog.getByRole("checkbox", { name: victimName }).check();
    await expect(mergeDialog.getByTestId("host-merge-preview")).toContainText(`to ${survivorName}`, {
      timeout: 25_000,
    });
    await mergeDialog.getByTestId("host-merge-confirm").click();
    await expect(mergeDialog).toHaveCount(0, { timeout: 25_000 });

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

    expect(survivor.groupId).toBe(survivorGroup.groupId);

    await expect(sheet.getByTestId("host-alias-list")).toContainText(victimName, { timeout: 25_000 });
  });
});
