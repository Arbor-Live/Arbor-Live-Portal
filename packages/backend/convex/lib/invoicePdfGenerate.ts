"use node";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type InvoiceDocument = {
  invoice: {
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string;
    managerName: string;
    managerEmail?: string;
    clientGroupName?: string;
    clientContactName?: string;
    clientEmail?: string;
    clientPhone?: string;
    equipmentSubtotalUsd: number;
    externalRentalsSubtotalUsd: number;
    artistsSubtotalUsd: number;
    crewSubtotalUsd: number;
    feesSubtotalUsd: number;
    subtotalUsd: number;
    discountAmountUsd: number;
    totalUsd: number;
    notes?: string;
  };
  lineItems: Array<{
    section: string;
    provider?: string;
    label: string;
    quantity: number;
    rateUsd: number;
    amountUsd: number;
  }>;
};

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

const SECTION_LABELS: Record<string, string> = {
  equipment_package: "Equipment",
  equipment_type: "Equipment",
  external_rental: "External Rentals",
  artist: "Artists",
  crew: "Crew",
  fee: "Fees",
};

export async function generateInvoicePdfBuffer(input: InvoiceDocument): Promise<Buffer> {
  const { invoice, lineItems } = input;
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const pageWidth = page.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = page.getHeight() - margin;

  const drawText = (
    text: string,
    options?: { size?: number; font?: typeof regular; gap?: number; maxWidth?: number },
  ) => {
    const size = options?.size ?? 10;
    const font = options?.font ?? regular;
    const gap = options?.gap ?? size + 4;
    const lines = wrapText(text, font, size, options?.maxWidth ?? contentWidth);
    for (const line of lines) {
      if (y < margin + size) {
        page = pdfDoc.addPage([612, 792]);
        y = page.getHeight() - margin;
      }
      page.drawText(line, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= gap;
    }
  };

  drawText("Arbor Live", { size: 20, font: bold, gap: 24 });
  drawText("Office of Student Engagement");
  drawText("arborlive@stanford.edu");
  drawText("arborlive.stanford.edu", { gap: 18 });
  drawText(`Invoice ${invoice.invoiceNumber}`, { size: 16, font: bold, gap: 20 });
  drawText(`Issue date: ${invoice.issueDate}`);
  if (invoice.dueDate) drawText(`Due date: ${invoice.dueDate}`);
  drawText(`Manager: ${invoice.managerName}`);
  if (invoice.managerEmail) drawText(`Manager email: ${invoice.managerEmail}`);
  if (invoice.clientGroupName) drawText(`Group: ${invoice.clientGroupName}`);
  if (invoice.clientContactName) drawText(`Contact: ${invoice.clientContactName}`);
  if (invoice.clientEmail) drawText(`Client email: ${invoice.clientEmail}`);
  if (invoice.clientPhone) drawText(`Client phone: ${invoice.clientPhone}`, { gap: 16 });

  const grouped = new Map<string, InvoiceDocument["lineItems"]>();
  for (const item of lineItems) {
    const key = SECTION_LABELS[item.section] ?? item.section;
    const rows = grouped.get(key) ?? [];
    rows.push(item);
    grouped.set(key, rows);
  }

  for (const [section, rows] of grouped) {
    drawText(section, { size: 12, font: bold, gap: 16 });
    for (const row of rows) {
      const provider = row.provider?.trim() ? `${row.provider.trim()} · ` : "";
      drawText(
        `${provider}${row.label} · Qty ${row.quantity} · Rate ${currency(row.rateUsd)} · Amount ${currency(row.amountUsd)}`,
        { size: 9, gap: 12 },
      );
    }
    y -= 4;
  }

  drawText("Payment Methods", { size: 12, font: bold, gap: 16 });
  drawText("ASSU ePay or GrantEd Group Transfer");
  drawText("VSO: Arbor Live (5001)");
  drawText("iJournal PTA: 1056598-1-ZBABS");
  drawText("Approver: O'Neal Patrick", { gap: 16 });

  drawText("Totals", { size: 12, font: bold, gap: 16 });
  drawText(`Equipment: ${currency(invoice.equipmentSubtotalUsd)}`);
  drawText(`External rentals: ${currency(invoice.externalRentalsSubtotalUsd)}`);
  drawText(`Artists: ${currency(invoice.artistsSubtotalUsd)}`);
  drawText(`Crew: ${currency(invoice.crewSubtotalUsd)}`);
  drawText(`Fees: ${currency(invoice.feesSubtotalUsd)}`);
  drawText(`Subtotal: ${currency(invoice.subtotalUsd)}`);
  drawText(`Discount: -${currency(invoice.discountAmountUsd)}`);
  drawText(`Total: ${currency(invoice.totalUsd)}`, { font: bold, gap: 16 });

  if (invoice.notes?.trim()) {
    drawText("Notes", { size: 12, font: bold, gap: 16 });
    drawText(invoice.notes.trim());
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
