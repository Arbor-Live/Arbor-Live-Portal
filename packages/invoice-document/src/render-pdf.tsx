import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocumentPdf } from "./invoice-document-pdf";
import type { InvoiceDocumentData } from "./types";

export type RenderInvoicePdfOptions = {
  logoSrc?: string;
};

export async function renderInvoicePdfBuffer(
  data: InvoiceDocumentData,
  options?: RenderInvoicePdfOptions,
): Promise<Buffer> {
  const bytes = await renderToBuffer(
    <InvoiceDocumentPdf data={data} logoSrc={options?.logoSrc} />,
  );
  return Buffer.from(bytes);
}
