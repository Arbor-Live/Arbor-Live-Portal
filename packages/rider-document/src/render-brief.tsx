import { renderToBuffer } from "@react-pdf/renderer";
import { EventBriefPdf } from "./event-brief-pdf";
import type { EventBriefDocumentData } from "./brief-types";

export async function renderEventBriefPdfBuffer(
  data: EventBriefDocumentData,
): Promise<Buffer> {
  const bytes = await renderToBuffer(<EventBriefPdf data={data} />);
  return Buffer.from(bytes);
}
