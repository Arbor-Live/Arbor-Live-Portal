import { writeFileSync } from "node:fs";
import { RIDER_TEMPLATES } from "./src/templates.ts";
import { renderRiderPdfBuffer } from "./src/render-pdf.tsx";

const content = RIDER_TEMPLATES[0].build();
const buffer = await renderRiderPdfBuffer({
  ...content,
  bandName: "The Quad Sessions",
  riderName: "Full band",
  updatedAtLabel: "Jul 29, 2026",
  contactName: "Alex Rivera",
  contactEmail: "alex@quadsessions.com",
  contactPhone: "(650) 555-0134",
  generalNotes: "We need 20 minutes for line check. Guitar amp is a Deluxe Reverb.",
});
writeFileSync("/tmp/rider-sample.pdf", buffer);
console.log("wrote", buffer.length, "bytes");
