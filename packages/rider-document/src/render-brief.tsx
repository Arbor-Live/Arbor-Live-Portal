import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { EventBriefPdf } from "./event-brief-pdf";
import type { EventBriefDocumentData } from "./brief-types";

/**
 * Renders the brief to a PDF. When the data carries an authenticated event URL,
 * it is embedded as a scannable QR code so crew can pull the brief up on a phone.
 */
export async function renderEventBriefPdfBuffer(
  data: EventBriefDocumentData,
): Promise<Buffer> {
  const qrDataUri = data.briefUrl
    ? await QRCode.toDataURL(data.briefUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 232,
      })
    : undefined;
  const bytes = await renderToBuffer(<EventBriefPdf data={data} qrDataUri={qrDataUri} />);
  return Buffer.from(bytes);
}
