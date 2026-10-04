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
import {
  crewLinePerson,
  describeHeadcount,
  describeHoursTimesRate,
  formatPeople,
  groupCrewBySection,
  parseCrewLine,
  sumCrewAmountUsd,
  type CrewGroup,
  type CrewLine,
} from "./crew-sections";
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
  crewDay: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    fontSize: 8,
    fontWeight: 700,
    color: invoiceTheme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  crewSectionRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 2,
  },
  crewSectionTitle: {
    fontSize: 9.5,
    fontWeight: 700,
  },
  crewMuted: {
    fontSize: 8,
    color: invoiceTheme.textMuted,
  },
  crewPersonRow: {
    flexDirection: "row",
    marginLeft: 18,
    paddingRight: 8,
    paddingLeft: 8,
    paddingVertical: 2.5,
    borderLeftWidth: 1,
    borderLeftColor: invoiceTheme.border,
  },
  crewSectionEnd: {
    borderBottomWidth: 1,
    borderBottomColor: invoiceTheme.border,
    paddingBottom: 4,
  },
  crewLead: {
    fontSize: 7,
    fontWeight: 700,
    color: invoiceTheme.primary,
  },
  crewTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderTopWidth: 1.5,
    borderTopColor: invoiceTheme.text,
    fontSize: 10,
    fontWeight: 700,
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
                <Text style={styles.invoiceNumber}>
                  {invoice.isFinal ? "Invoice" : "Estimate"} {invoice.invoiceNumber}
                </Text>
              </View>
              <View style={styles.headerText}>
                <Text>Office of Student Engagement</Text>
                <Text>arborlive@stanford.edu</Text>
                <Text>arborlive.stanford.edu</Text>
              </View>
            </View>
            <View style={styles.detailsGrid}>
              <View style={styles.detailsColumn}>
                <Text style={styles.sectionLabel}>{invoice.isFinal ? "Invoice Details" : "Estimate Details"}</Text>
                <DetailLine label="Invoice number" value={invoice.invoiceNumber} />
                <DetailLine label="Issue date" value={invoice.issueDate} />
                {invoice.dueDate ? <DetailLine label="Due date" value={invoice.dueDate} /> : null}
                <DetailLine label="Manager" value={invoice.managerName} />
                {invoice.managerEmail ? (
                  <DetailLine label="Manager email" value={invoice.managerEmail} />
                ) : null}
                <DetailLine label="Quote status" value={invoice.clientApprovalStatus ?? "pending"} />
                {invoice.isFinal ? null : (
                  <Text style={styles.detailLine}>
                    Estimate: the final invoice follows the event, once hours are final.
                    {invoice.paymentOpenEarly ? "" : " Please don't pay this estimate."}
                  </Text>
                )}
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
                {invoice.clientGroupName ? (
                  <DetailLine label="Host" value={invoice.clientGroupName} />
                ) : null}
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
          {sections.crew.length ? <CrewSectionTable rows={sections.crew} /> : null}
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
          <View style={[styles.td, { flex: itemFlex }]}>
            <Text>{row.label}</Text>
            {row.detailNote ? (
              <Text style={{ fontSize: 7, color: "#64748b", marginTop: 2 }}>{row.detailNote}</Text>
            ) : null}
          </View>
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

const crewItemFlex = 3;
/**
 * A section is kept on one page when its estimated wrapped rows fit well
 * within a Letter page (~720pt usable; a row is ~11pt). Bigger ones may split,
 * since react-pdf clips an unbreakable view taller than a page.
 */
const KEEP_TOGETHER_MAX_ROWS = 30;
/** Characters of name · role · notes that fit on one row of the first column. */
const CREW_CHARS_PER_ROW = 60;

function estimatedRows(group: CrewGroup) {
  return group.lines.reduce((rows, line) => {
    const text = [crewLinePerson(line) ?? line.role, line.role, line.notes].filter(Boolean).join(" · ");
    return rows + Math.max(1, Math.ceil(text.length / CREW_CHARS_PER_ROW));
  }, 1);
}

function keepTogether(group: CrewGroup | undefined) {
  return group !== undefined && estimatedRows(group) <= KEEP_TOGETHER_MAX_ROWS;
}
const crewRateFlex = 1.5;
const crewAmountFlex = 1;

/** One billed crew line under its section: who, role, hours × rate, amount. */
function CrewPersonRow({ line }: { line: CrewLine }) {
  const person = crewLinePerson(line);
  return (
    <View style={styles.crewPersonRow} wrap={false}>
      <View style={{ flex: crewItemFlex, paddingRight: 8 }}>
        {line.manualLabel ? (
          <Text style={styles.td}>{formatPeople(line.people)}</Text>
        ) : (
          <Text style={styles.td}>
            <Text style={line.person ? {} : { fontStyle: "italic", color: invoiceTheme.textMuted }}>
              {person ?? line.role ?? "Crew"}
            </Text>
            {line.lead ? <Text style={styles.crewLead}>{"  LEAD"}</Text> : null}
            {person && line.role ? <Text style={styles.crewMuted}>{`  ·  ${line.role}`}</Text> : null}
          </Text>
        )}
        {line.notes ? <Text style={styles.crewMuted}>{line.notes}</Text> : null}
      </View>
      <Text style={[styles.crewMuted, { flex: crewRateFlex, textAlign: "right", fontSize: 8.5 }]}>
        {describeHoursTimesRate(line)}
      </Text>
      <Text style={[styles.td, { flex: crewAmountFlex, textAlign: "right" }]}>{currency(line.amountUsd)}</Text>
    </View>
  );
}

/**
 * A Run of Show section with every person listed. Sections that fit never split
 * across pages; an oversized one may, but its header keeps rows after it. A
 * hand-entered people × hours row is its own one-line section.
 */
function CrewSectionBlock({ group }: { group: CrewGroup }) {
  const unbreakable = keepTogether(group);
  const single = group.lines.length === 1 && group.lines[0]!.manualLabel ? group.lines[0]! : undefined;
  return (
    <View style={styles.crewSectionEnd} wrap={!unbreakable}>
      <View style={styles.crewSectionRow} minPresenceAhead={unbreakable ? undefined : 48}>
        <Text style={[styles.crewSectionTitle, { flex: crewItemFlex, paddingRight: 8 }]}>
          {group.title}
          <Text style={[styles.crewMuted, { fontWeight: 400 }]}>
            {`   ${describeHeadcount(group.lines)}`}
          </Text>
          {single?.notes ? <Text style={[styles.crewMuted, { fontWeight: 400 }]}>{`\n${single.notes}`}</Text> : null}
        </Text>
        <Text style={[styles.crewMuted, { flex: crewRateFlex, textAlign: "right", fontSize: 8.5 }]}>
          {single ? describeHoursTimesRate(single) : ""}
        </Text>
        <Text style={[styles.crewSectionTitle, { flex: crewAmountFlex, textAlign: "right" }]}>
          {currency(group.amountUsd)}
        </Text>
      </View>
      {single
        ? null
        : group.lines.map((line) => <CrewPersonRow key={line.id} line={line} />)}
    </View>
  );
}

/**
 * Crew by day (multi-day bookings) and Run of Show section, every section
 * expanded. Presentation only: section, day, and crew totals are the exact sum
 * of the billed lines.
 */
function CrewSectionTable({ rows }: { rows: InvoiceLineItem[] }) {
  const lines = rows.map((row) => parseCrewLine({ ...row, notes: row.detailNote }));
  const days = groupCrewBySection(lines);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} minPresenceAhead={80}>
        Crew
      </Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: crewItemFlex }]}>Section and crew</Text>
        <Text style={[styles.th, { flex: crewRateFlex, textAlign: "right" }]}>Hours × rate</Text>
        <Text style={[styles.th, { flex: crewAmountFlex, textAlign: "right" }]}>Amount</Text>
      </View>
      {days.map((day) => {
        const [first, ...rest] = day.groups;
        return (
          <View key={day.key}>
            {/* The day heading travels with its first section (when that fits on a page). */}
            <View wrap={!keepTogether(first)} minPresenceAhead={60}>
              {day.title ? (
                <View style={styles.crewDay}>
                  <Text>{day.title}</Text>
                  <Text>{currency(day.amountUsd)}</Text>
                </View>
              ) : null}
              {first ? <CrewSectionBlock group={first} /> : null}
            </View>
            {rest.map((group) => (
              <CrewSectionBlock key={group.key} group={group} />
            ))}
          </View>
        );
      })}
      <View style={styles.crewTotal} wrap={false}>
        <Text>Crew total</Text>
        <Text>{currency(sumCrewAmountUsd(lines))}</Text>
      </View>
    </View>
  );
}
