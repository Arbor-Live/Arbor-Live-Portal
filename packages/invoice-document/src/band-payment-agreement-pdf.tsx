import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { currency } from "./format";
import { ArborLogoPdf } from "./arbor-logo-pdf";
import { pdfEyebrow, pdfFonts } from "./pdf-brand";
import { invoiceTheme } from "./theme";
import type { BandPaymentAgreementDocumentData } from "./band-payment-agreement-types";

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingTop: 30,
    paddingBottom: 30,
    fontFamily: pdfFonts.body,
    fontSize: 9.5,
    color: invoiceTheme.text,
  },
  stack: {
    gap: 11,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 10,
    borderBottomWidth: 3,
    borderBottomColor: invoiceTheme.primary,
  },
  status: {
    ...pdfEyebrow,
    color: invoiceTheme.primary,
    borderWidth: 1,
    borderColor: invoiceTheme.primary,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
  },
  titleBlock: {
    marginTop: -4,
  },
  documentKind: {
    ...pdfEyebrow,
    color: invoiceTheme.primary,
    marginBottom: 4,
  },
  brandTitle: {
    fontFamily: pdfFonts.heading,
    fontSize: 21,
    fontWeight: 600,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  muted: {
    color: invoiceTheme.textMuted,
    fontSize: 8.5,
  },
  card: {},
  cardTitle: {
    fontFamily: pdfFonts.heading,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: -0.3,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: invoiceTheme.text,
  },
  cardBody: {
    paddingTop: 4,
  },
  intro: {
    lineHeight: "13pt",
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2.5,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
  },
  label: {
    color: invoiceTheme.textMuted,
    width: 140,
  },
  value: {
    flex: 1,
  },
  personBlock: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2.5,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
  },
  personValue: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontSize: 9.5,
  },
  personEmail: {
    fontSize: 8.5,
    color: invoiceTheme.textMuted,
  },
  emphasis: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: invoiceTheme.primary,
    color: invoiceTheme.primaryForeground,
  },
  emphasisLabel: {
    ...pdfEyebrow,
    color: invoiceTheme.primaryForeground,
  },
  emphasisValue: {
    fontFamily: pdfFonts.heading,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: -0.3,
  },
  signatureBlock: {
    marginTop: 4,
  },
  signatureLine: {
    fontFamily: pdfFonts.heading,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: -0.3,
    paddingVertical: 4,
  },
});

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function PersonBlock({
  label,
  name,
  email,
}: {
  label: string;
  name?: string;
  email?: string;
}) {
  return (
    <View style={styles.personBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.personValue}>
        <Text style={styles.personName}>{name?.trim() || "—"}</Text>
        <Text style={styles.personEmail}>{email?.trim() || "—"}</Text>
      </View>
    </View>
  );
}

function samePerson(
  aName?: string,
  aEmail?: string,
  bName?: string,
  bEmail?: string,
) {
  const emailA = aEmail?.trim().toLowerCase() ?? "";
  const emailB = bEmail?.trim().toLowerCase() ?? "";
  if (emailA && emailB) return emailA === emailB;
  const nameA = aName?.trim().toLowerCase() ?? "";
  const nameB = bName?.trim().toLowerCase() ?? "";
  return Boolean(nameA && nameB && nameA === nameB);
}

export function BandPaymentAgreementPdf({
  data,
}: {
  data: BandPaymentAgreementDocumentData;
  logoSrc?: string;
}) {
  const payeeAgreement = data.signatureTypedName
    ? data.signatureTypedName
    : data.legacyReplyFrom
      ? `Confirmed by email reply from ${data.legacyReplyFrom}`
      : "—";

  const showPaidBy = data.status === "paid" || Boolean(data.paidAtLabel);
  const paidBySameAsApprover =
    showPaidBy &&
    samePerson(
      data.adminRequesterName,
      data.adminRequesterEmail,
      data.adminApproverName,
      data.adminApproverEmail,
    );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.stack}>
          <View style={styles.header}>
            <ArborLogoPdf width={96} />
            <Text style={styles.status}>{data.status === "paid" ? "Paid" : "Signed"}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.documentKind}>Agreement</Text>
            <Text style={styles.brandTitle}>Band Payment Agreement</Text>
            <Text style={styles.muted}>Payment ID {data.confirmationToken}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment details</Text>
            <View style={styles.cardBody}>
              <Detail label="Band" value={data.bandName} />
              <Detail label="Event" value={data.eventTitle} />
              <Detail label="Date" value={data.eventDateLabel} />
              <Detail label="Venue" value={data.venueName ?? "—"} />
              <Detail label="Performance length" value={data.performanceHoursLabel} />
              {data.pricingMode === "per_member_hourly" ? (
                <>
                  <Detail
                    label="Rate / person / hour"
                    value={currency(data.ratePerMemberPerHourUsd ?? 0)}
                  />
                  <Detail
                    label="Member count"
                    value={data.memberCount !== undefined ? String(data.memberCount) : "—"}
                  />
                </>
              ) : null}
              <Detail label="Total" value={currency(data.totalUsd)} />
              <Detail label="Designated payee" value={data.designatedPayeeName} />
              <View style={styles.emphasis}>
                <Text style={styles.emphasisLabel}>Agreed total</Text>
                <Text style={styles.emphasisValue}>{currency(data.totalUsd)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Arbor Live — authorization</Text>
            <View style={styles.cardBody}>
              <Text style={styles.intro}>
                An Arbor Live staff member authorized this payment amount and sent it to the
                designated payee for e-signature agreement.
              </Text>
              {paidBySameAsApprover ? (
                <PersonBlock
                  label="Approved and Paid By"
                  name={data.adminRequesterName ?? data.adminApproverName}
                  email={data.adminRequesterEmail ?? data.adminApproverEmail}
                />
              ) : (
                <>
                  <PersonBlock
                    label="Approver"
                    name={data.adminRequesterName}
                    email={data.adminRequesterEmail}
                  />
                  {showPaidBy ? (
                    <PersonBlock
                      label="Paid By"
                      name={data.adminApproverName}
                      email={data.adminApproverEmail}
                    />
                  ) : null}
                </>
              )}
              <Detail label="Sent at" value={data.adminSentAtLabel ?? "—"} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Band — payment agreement</Text>
            <View style={styles.cardBody}>
              <Text style={styles.intro}>
                The designated payee agrees that the payment details and total above are accurate,
                and authorizes Arbor Live to proceed with payout processing.
              </Text>
              <View style={styles.signatureBlock}>
                <Text style={styles.signatureLine}>Signed: {payeeAgreement}</Text>
                <Detail label="Payee email" value={data.designatedPayeeEmail ?? "—"} />
                <Detail
                  label="Payout method"
                  value={
                    data.designatedPayeePayoutMethod === "pickup"
                      ? "Pickup (ASSU office)"
                      : data.designatedPayeePayoutMethod === "delivery"
                        ? "Delivery"
                        : "—"
                  }
                />
                <Detail
                  label="Mailing address"
                  value={data.designatedPayeeMailingAddress ?? "—"}
                />
                <Detail label="Signed at" value={data.signedAtLabel ?? "—"} />
              </View>
            </View>
          </View>

          {data.servicePaymentNumber || data.paidAtLabel ? (
            <View style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>Payout</Text>
              <View style={styles.cardBody}>
                {data.servicePaymentNumber ? (
                  <Detail label="Transfer / Service Payment #" value={data.servicePaymentNumber} />
                ) : null}
                {data.paidAtLabel ? <Detail label="Marked paid at" value={data.paidAtLabel} /> : null}
              </View>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
