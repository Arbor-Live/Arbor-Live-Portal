import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { ArborLogoPdf } from "./arbor-logo-pdf";
import { currency, groupInvoiceSections } from "./format";
import { invoiceTheme } from "./theme";
import type { InvoiceDocumentData, InvoiceLineItem } from "./types";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: invoiceTheme.fontFamilyPdf,
    fontSize: 10,
    color: invoiceTheme.text,
  },
  stack: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: invoiceTheme.border,
    borderRadius: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: invoiceTheme.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
  },
  headerLeft: {
    flexDirection: "column",
    gap: 8,
    maxWidth: 220,
  },
  logo: {
    width: 110,
    height: 36,
    objectFit: "contain",
  },
  headerText: {
    textAlign: "right",
    fontSize: 10,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: 700,
  },
  detailsGrid: {
    flexDirection: "row",
    gap: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailsColumn: {
    flex: 1,
  },
  sectionLabel: {
    fontWeight: 700,
    marginBottom: 6,
  },
  detailLine: {
    marginBottom: 4,
  },
  detailLabel: {
    fontWeight: 700,
  },
  link: {
    color: invoiceTheme.primary,
    textDecoration: "underline",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    backgroundColor: invoiceTheme.mutedHeaderBg,
  },
  cardBody: {
    padding: 14,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    backgroundColor: invoiceTheme.mutedHeaderBg,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableLastRow: {
    borderBottomWidth: 0,
  },
  th: {
    fontWeight: 700,
    fontSize: 9,
  },
  td: {
    fontSize: 9,
  },
  totalsGrid: {
    padding: 14,
    gap: 4,
  },
  discount: {
    color: invoiceTheme.discount,
    fontWeight: 700,
  },
  totalHighlight: {
    marginTop: 4,
    padding: 8,
    borderWidth: 1,
    borderColor: invoiceTheme.primaryBorder,
    backgroundColor: invoiceTheme.primaryHighlightBg,
    fontSize: 12,
    fontWeight: 700,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    marginVertical: 8,
  },
});

type InvoiceDocumentPdfProps = {
  data: InvoiceDocumentData;
  logoSrc?: string;
};

export function InvoiceDocumentPdf({ data, logoSrc }: InvoiceDocumentPdfProps) {
  const sections = groupInvoiceSections(data.lineItems);
  const { invoice } = data;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.stack}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {logoSrc ? (
                  <Image src={logoSrc} style={styles.logo} />
                ) : (
                  <ArborLogoPdf width={132} />
                )}
                <Text style={styles.invoiceNumber}>Invoice {invoice.invoiceNumber}</Text>
              </View>
              <View style={styles.headerText}>
                <Text>Office of Student Engagement</Text>
                <Text>arborlive@stanford.edu</Text>
                <Text>arborlive.stanford.edu</Text>
              </View>
            </View>
            <View style={styles.detailsGrid}>
              <View style={styles.detailsColumn}>
                <Text style={styles.sectionLabel}>Invoice Details</Text>
                <DetailLine label="Invoice number" value={invoice.invoiceNumber} />
                <DetailLine label="Issue date" value={invoice.issueDate} />
                {invoice.dueDate ? <DetailLine label="Due date" value={invoice.dueDate} /> : null}
                <DetailLine label="Manager" value={invoice.managerName} />
                {invoice.managerEmail ? (
                  <DetailLine label="Manager email" value={invoice.managerEmail} />
                ) : null}
                <DetailLine label="Quote status" value={invoice.clientApprovalStatus ?? "pending"} />
                {invoice.digitalQuoteUrl ? (
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailLabel}>Live quote: </Text>
                    <Link src={invoice.digitalQuoteUrl} style={styles.link}>
                      {invoice.digitalQuoteUrl}
                    </Link>
                  </Text>
                ) : null}
              </View>
              <View style={styles.detailsColumn}>
                <Text style={styles.sectionLabel}>Contact Details</Text>
                {invoice.clientGroupName ? <DetailLine label="Group" value={invoice.clientGroupName} /> : null}
                {invoice.clientContactName ? (
                  <DetailLine label="Contact" value={invoice.clientContactName} />
                ) : null}
                {invoice.clientEmail ? <DetailLine label="Client email" value={invoice.clientEmail} /> : null}
                {invoice.clientPhone ? <DetailLine label="Client phone" value={invoice.clientPhone} /> : null}
              </View>
            </View>
          </View>

          {sections.equipment.length ? (
            <SectionTable title="Equipment" rows={sections.equipment} />
          ) : null}
          {sections.external.length ? (
            <SectionTable title="External Rentals" rows={sections.external} showProvider />
          ) : null}
          {sections.artists.length ? <ArtistsSectionTable rows={sections.artists} /> : null}
          {sections.crew.length ? <SectionTable title="Crew" rows={sections.crew} /> : null}
          {sections.fees.length ? <SectionTable title="Fees" rows={sections.fees} /> : null}

          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>Payment Methods</Text>
            <View style={styles.cardBody}>
              <Text>ASSU ePay or GrantEd Group Transfer</Text>
              <Text>VSO: Arbor Live (5001)</Text>
              <View style={styles.divider} />
              <Text style={styles.detailLabel}>iJournal PTA</Text>
              <Text>PTA: 1056598-1-ZBABS</Text>
              <Text>Approver: O&apos;Neal Patrick</Text>
            </View>
          </View>

          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>Totals</Text>
            <View style={styles.totalsGrid}>
              <Text>Equipment: {currency(invoice.equipmentSubtotalUsd)}</Text>
              <Text>External rentals: {currency(invoice.externalRentalsSubtotalUsd)}</Text>
              <Text>Artists: {currency(invoice.artistsSubtotalUsd)}</Text>
              <Text>Crew: {currency(invoice.crewSubtotalUsd)}</Text>
              <Text>Fees: {currency(invoice.feesSubtotalUsd)}</Text>
              <Text style={styles.detailLabel}>Subtotal: {currency(invoice.subtotalUsd)}</Text>
              <Text style={styles.discount}>Discount: -{currency(invoice.discountAmountUsd)}</Text>
              <Text style={styles.totalHighlight}>Total: {currency(invoice.totalUsd)}</Text>
            </View>
          </View>

          {invoice.notes?.trim() ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notes</Text>
              <View style={styles.cardBody}>
                <Text>{invoice.notes.trim()}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

function ArtistsSectionTable({ rows }: { rows: InvoiceLineItem[] }) {
  const hasBreakdown = rows.some(
    (row) =>
      row.memberCount !== undefined &&
      row.memberCount > 0 &&
      row.performanceHours !== undefined &&
      row.performanceHours > 0,
  );
  if (!hasBreakdown) {
    return <SectionTable title="Artists" rows={rows} />;
  }

  const itemFlex = 2.4;
  const hoursFlex = 0.7;
  const peopleFlex = 0.7;
  const rateFlex = 1.2;
  const amountFlex = 1;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Artists</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: itemFlex }]}>Band / DJ</Text>
        <Text style={[styles.th, { flex: hoursFlex, textAlign: "right" }]}>Hours</Text>
        <Text style={[styles.th, { flex: peopleFlex, textAlign: "right" }]}>People</Text>
        <Text style={[styles.th, { flex: rateFlex, textAlign: "right" }]}>Rate / person / hr</Text>
        <Text style={[styles.th, { flex: amountFlex, textAlign: "right" }]}>Amount</Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={
            index === rows.length - 1
              ? [styles.tableRow, styles.tableLastRow]
              : styles.tableRow
          }
        >
          <Text style={[styles.td, { flex: itemFlex }]}>{row.label}</Text>
          <Text style={[styles.td, { flex: hoursFlex, textAlign: "right" }]}>
            {row.performanceHours !== undefined && row.performanceHours > 0
              ? row.performanceHours
              : row.quantity}
          </Text>
          <Text style={[styles.td, { flex: peopleFlex, textAlign: "right" }]}>
            {row.memberCount !== undefined && row.memberCount > 0 ? row.memberCount : "—"}
          </Text>
          <Text style={[styles.td, { flex: rateFlex, textAlign: "right" }]}>
            {currency(row.rateUsd)}
          </Text>
          <Text style={[styles.td, { flex: amountFlex, textAlign: "right", fontWeight: 700 }]}>
            {currency(row.amountUsd)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionTable({
  title,
  rows,
  showProvider,
}: {
  title: string;
  rows: InvoiceLineItem[];
  showProvider?: boolean;
}) {
  const providerFlex = showProvider ? 1.2 : 0;
  const itemFlex = showProvider ? 2.2 : 3;
  const qtyFlex = 0.7;
  const rateFlex = 1;
  const amountFlex = 1;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.tableHeader}>
        {showProvider ? (
          <Text style={[styles.th, { flex: providerFlex }]}>Provider</Text>
        ) : null}
        <Text style={[styles.th, { flex: itemFlex }]}>Item</Text>
        <Text style={[styles.th, { flex: qtyFlex, textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.th, { flex: rateFlex, textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.th, { flex: amountFlex, textAlign: "right" }]}>Amount</Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={
            index === rows.length - 1
              ? [styles.tableRow, styles.tableLastRow]
              : styles.tableRow
          }
        >
          {showProvider ? (
            <Text style={[styles.td, { flex: providerFlex }]}>{row.provider || "—"}</Text>
          ) : null}
          <View style={[styles.td, { flex: itemFlex }]}>
            <Text>{row.label}</Text>
            {row.detailNote ? (
              <Text style={{ fontSize: 7, color: "#64748b", marginTop: 2 }}>{row.detailNote}</Text>
            ) : null}
          </View>
          <View style={[styles.td, { flex: qtyFlex, alignItems: "flex-end" }]}>
            <Text style={{ textAlign: "right" }}>{row.quantity}</Text>
            {row.quantityDetail ? (
              <Text style={{ fontSize: 7, color: "#64748b", textAlign: "right" }}>{row.quantityDetail}</Text>
            ) : null}
          </View>
          <Text style={[styles.td, { flex: rateFlex, textAlign: "right" }]}>{currency(row.rateUsd)}</Text>
          <Text style={[styles.td, { flex: amountFlex, textAlign: "right", fontWeight: 700 }]}>
            {currency(row.amountUsd)}
          </Text>
        </View>
      ))}
    </View>
  );
}
