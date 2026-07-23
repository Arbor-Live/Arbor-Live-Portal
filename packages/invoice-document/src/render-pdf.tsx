import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocumentPdf } from "./invoice-document-pdf";
import { BandPaymentAgreementPdf } from "./band-payment-agreement-pdf";
import type { InvoiceDocumentData } from "./types";
import type { BandPaymentAgreementDocumentData } from "./band-payment-agreement-types";

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

export async function renderBandPaymentAgreementPdfBuffer(
  data: BandPaymentAgreementDocumentData,
): Promise<Buffer> {
  const bytes = await renderToBuffer(<BandPaymentAgreementPdf data={data} />);
  return Buffer.from(bytes);
}
