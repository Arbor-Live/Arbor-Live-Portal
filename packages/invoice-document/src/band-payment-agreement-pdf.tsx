import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { currency } from "./format";
import { ArborLogoPdf } from "./arbor-logo-pdf";
import { invoiceTheme } from "./theme";
import type { BandPaymentAgreementDocumentData } from "./band-payment-agreement-types";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: invoiceTheme.fontFamilyPdf,
    fontSize: 10,
    color: invoiceTheme.text,
  },
  stack: {
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  muted: {
    color: invoiceTheme.textMuted,
    fontSize: 9,
  },
  card: {
    borderWidth: 1,
    borderColor: invoiceTheme.border,
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    backgroundColor: invoiceTheme.mutedHeaderBg,
  },
  cardBody: {
    padding: 12,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  label: {
    fontWeight: 700,
    width: 140,
  },
  value: {
    flex: 1,
  },
  emphasis: {
    fontSize: 12,
    fontWeight: 700,
  },
  signatureLine: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: invoiceTheme.border,
    fontSize: 12,
    fontWeight: 700,
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

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.stack}>
          <View style={styles.header}>
            <View>
              <ArborLogoPdf />
              <Text style={styles.brandTitle}>Band Payment Agreement</Text>
              <Text style={styles.muted}>Payment ID {data.confirmationToken}</Text>
            </View>
            <View>
              <Text style={styles.muted}>Status: {data.status === "paid" ? "Paid" : "Signed"}</Text>
            </View>
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
              {data.designatedPayeeEmail ? (
                <Detail label="Payee email" value={data.designatedPayeeEmail} />
              ) : null}
              {data.designatedPayeeMailingAddress ? (
                <Detail label="Mailing address" value={data.designatedPayeeMailingAddress} />
              ) : null}
              <Text style={styles.emphasis}>Agreed total: {currency(data.totalUsd)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Arbor Live — signature request</Text>
            <View style={styles.cardBody}>
              <Text>
                An Arbor Live staff member sent this payment to the designated payee for e-signature
                agreement to the amount above.
              </Text>
              <Detail label="Sent by" value={data.adminSenderName ?? "Arbor staff"} />
              <Detail label="Sent at" value={data.adminSentAtLabel ?? "—"} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Band — payment agreement</Text>
            <View style={styles.cardBody}>
              <Text>
                The designated payee agrees that the payment details and total above are accurate, and
                authorizes Arbor Live to proceed with payout processing.
              </Text>
              <Text style={styles.signatureLine}>Signed: {payeeAgreement}</Text>
              <Detail label="Signed at" value={data.signedAtLabel ?? "—"} />
            </View>
          </View>

          {data.servicePaymentNumber || data.paidAtLabel ? (
            <View style={styles.card}>
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
