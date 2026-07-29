import { renderToBuffer } from "@react-pdf/renderer";
import { RiderPdf } from "./rider-pdf";
import type { RiderDocumentData } from "./types";

export async function renderRiderPdfBuffer(
  data: RiderDocumentData,
): Promise<Buffer> {
  const bytes = await renderToBuffer(<RiderPdf data={data} />);
  return Buffer.from(bytes);
}
