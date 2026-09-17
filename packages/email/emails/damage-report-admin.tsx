import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { DamageReportAdminEmailProps } from "../src/types";

export function DamageReportAdminEmail({
  reporterName,
  itemLabel,
  severity,
  operabilityLabel,
  scopeLabel,
  eventTitle,
  notes,
  reportUrl,
}: DamageReportAdminEmailProps) {
  return (
    <EmailLayout
      preview={`New damage report: ${itemLabel}`}
      heading="New damage report"
    >
      <BodyCopy>
        <strong>{reporterName}</strong> reported damage on <strong>{itemLabel}</strong>.
      </BodyCopy>
      <DataCard title="Report Summary">
        <DetailRow label="Asset" value={itemLabel} />
        <DetailRow label="Severity" value={`${severity} of 5`} />
        <DetailRow label="Operability" value={operabilityLabel} />
        <DetailRow label="Scope" value={scopeLabel} />
        {eventTitle ? <DetailRow label="Event" value={eventTitle} /> : null}
        {notes ? <DetailRow label="Notes" value={notes} /> : null}
      </DataCard>
      <CtaButton href={reportUrl} label="Open damage queue" />
      <EmailSignOff />
    </EmailLayout>
  );
}

DamageReportAdminEmail.PreviewProps = {
  reporterName: "Jordan Lee",
  itemLabel: "Shure SM58 (ALE-0041)",
  severity: 4,
  operabilityLabel: "Needs repair",
  scopeLabel: "This asset only",
  eventTitle: "Spring Concert 2026",
  notes: "XLR connector is loose and cuts out.",
  reportUrl: "http://localhost:3000/dashboard/inventory/damage?report=demo",
} satisfies DamageReportAdminEmailProps;

export default DamageReportAdminEmail;
