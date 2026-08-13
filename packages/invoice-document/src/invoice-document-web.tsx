import type { CSSProperties, ReactNode } from "react";
import { currency, groupInvoiceSections } from "./format";
import { invoiceTheme } from "./theme";
import type { InvoiceDocumentData, InvoiceLineItem } from "./types";

type InvoiceDocumentWebProps = {
  data: InvoiceDocumentData;
  logoSrc?: string;
};

export function InvoiceDocumentWeb({ data, logoSrc = "/logo.svg" }: InvoiceDocumentWebProps) {
  const sections = groupInvoiceSections(data.lineItems);
  const { invoice } = data;

  return (
    <div style={rootStyle}>
      <section style={cardStyle}>
        <header style={headerStyle}>
          <div style={headerLeftStyle}>
            <img src={logoSrc} alt="Arbor Live logo" style={logoStyle} />
            <p style={invoiceNumberStyle}>Invoice {invoice.invoiceNumber}</p>
          </div>
          <div style={headerTextStyle}>
            <p style={brandTitleStyle}>Arbor Live</p>
            <p style={headerLineStyle}>Office of Student Engagement</p>
            <p style={headerLineStyle}>
              <a href="mailto:arborlive@stanford.edu" style={linkStyle}>
                arborlive@stanford.edu
              </a>
            </p>
            <p style={headerLineStyle}>
              <a href="http://arborlive.stanford.edu" style={linkStyle}>
                arborlive.stanford.edu
              </a>
            </p>
          </div>
        </header>
        <div style={detailsGridStyle}>
          <div>
            <p style={sectionLabelStyle}>Invoice Details</p>
            <DetailLine label="Invoice number" value={invoice.invoiceNumber} />
            <DetailLine label="Issue date" value={invoice.issueDate} />
            {invoice.dueDate ? <DetailLine label="Due date" value={invoice.dueDate} /> : null}
            <DetailLine label="Manager" value={invoice.managerName} />
            {invoice.managerEmail ? (
              <DetailLine label="Manager email" value={invoice.managerEmail} />
            ) : null}
            <DetailLine label="Quote status" value={invoice.clientApprovalStatus ?? "pending"} />
            {invoice.digitalQuoteUrl ? (
              <p style={detailLineStyle}>
                <span style={detailLabelStyle}>Live quote:</span>{" "}
                <a href={invoice.digitalQuoteUrl} style={linkStyle}>
                  {invoice.digitalQuoteUrl}
                </a>
              </p>
            ) : null}
          </div>
          <div>
            <p style={sectionLabelStyle}>Contact Details</p>
            {invoice.clientGroupName ? (
              <DetailLine label="Group" value={invoice.clientGroupName} />
            ) : null}
            {invoice.clientContactName ? (
              <DetailLine label="Contact" value={invoice.clientContactName} />
            ) : null}
            {invoice.clientEmail ? <DetailLine label="Client email" value={invoice.clientEmail} /> : null}
            {invoice.clientPhone ? <DetailLine label="Client phone" value={invoice.clientPhone} /> : null}
          </div>
        </div>
      </section>

      {sections.equipment.length ? (
        <SectionTable title="Equipment" rows={sections.equipment} />
      ) : null}
      {sections.external.length ? (
        <SectionTable title="External Rentals" rows={sections.external} showProvider />
      ) : null}
      {sections.artists.length ? <ArtistsSectionTable rows={sections.artists} /> : null}
      {sections.crew.length ? <SectionTable title="Crew" rows={sections.crew} /> : null}
      {sections.fees.length ? <SectionTable title="Fees" rows={sections.fees} /> : null}

      <section style={cardStyle}>
        <h2 style={cardTitleStyle}>Payment Methods</h2>
        <div style={cardBodyStyle}>
          <p style={bodyTextStyle}>
            <a href="https://assuepay.stanford.edu/" style={linkStyle}>
              ASSU ePay
            </a>{" "}
            or <strong>GrantEd Group Transfer</strong>
          </p>
          <p style={bodyTextStyle}>
            VSO: <strong>Arbor Live (5001)</strong>
          </p>
          <hr style={dividerStyle} />
          <p style={strongTextStyle}>iJournal PTA</p>
          <p style={bodyTextStyle}>
            PTA: <strong>1056598-1-ZBABS</strong>
          </p>
          <p style={bodyTextStyle}>
            Approver: <strong>O&apos;Neal Patrick</strong>
          </p>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardTitleStyle}>Totals</h2>
        <div style={totalsGridStyle}>
          <p style={bodyTextStyle}>Equipment: {currency(invoice.equipmentSubtotalUsd)}</p>
          <p style={bodyTextStyle}>External rentals: {currency(invoice.externalRentalsSubtotalUsd)}</p>
          <p style={bodyTextStyle}>Artists: {currency(invoice.artistsSubtotalUsd)}</p>
          <p style={bodyTextStyle}>Crew: {currency(invoice.crewSubtotalUsd)}</p>
          <p style={bodyTextStyle}>Fees: {currency(invoice.feesSubtotalUsd)}</p>
          <p style={strongTextStyle}>Subtotal: {currency(invoice.subtotalUsd)}</p>
          <p style={discountStyle}>Discount: -{currency(invoice.discountAmountUsd)}</p>
          <p style={totalHighlightStyle}>Total: {currency(invoice.totalUsd)}</p>
        </div>
      </section>

      {invoice.notes?.trim() ? (
        <section style={cardStyle}>
          <h2 style={cardTitleStyle}>Notes</h2>
          <p style={bodyTextStyle}>{invoice.notes.trim()}</p>
        </section>
      ) : null}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <p style={detailLineStyle}>
      <span style={detailLabelStyle}>{label}:</span> {value}
    </p>
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

  return (
    <section style={cardStyle}>
      <h2 style={tableTitleStyle}>Artists</h2>
      <table style={tableStyle}>
        <thead>
          <tr style={tableHeadRowStyle}>
            <th style={thStyle}>Band / DJ</th>
            <th style={thRightStyle}>Hours</th>
            <th style={thRightStyle}>People</th>
            <th style={thRightStyle}>Rate / person / hr</th>
            <th style={thRightStyle}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              style={index < rows.length - 1 ? tableRowStyle : tableLastRowStyle}
            >
              <td style={tdStyle}>{row.label}</td>
              <td style={tdRightStyle}>
                {row.performanceHours !== undefined && row.performanceHours > 0
                  ? row.performanceHours
                  : row.quantity}
              </td>
              <td style={tdRightStyle}>
                {row.memberCount !== undefined && row.memberCount > 0 ? row.memberCount : "—"}
              </td>
              <td style={tdRightStyle}>{currency(row.rateUsd)}</td>
              <td style={tdAmountStyle}>{currency(row.amountUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
  return (
    <section style={cardStyle}>
      <h2 style={tableTitleStyle}>{title}</h2>
      <table style={tableStyle}>
        <thead>
          <tr style={tableHeadRowStyle}>
            {showProvider ? <th style={thStyle}>Provider</th> : null}
            <th style={thStyle}>Item</th>
            <th style={thRightStyle}>Qty</th>
            <th style={thRightStyle}>Rate</th>
            <th style={thRightStyle}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              style={index < rows.length - 1 ? tableRowStyle : tableLastRowStyle}
            >
              {showProvider ? <td style={tdStyle}>{row.provider || "—"}</td> : null}
              <td style={tdStyle}>
                {row.label}
                {row.detailNote ? (
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>{row.detailNote}</div>
                ) : null}
              </td>
              <td style={tdRightStyle}>
                {row.quantity}
                {row.quantityDetail ? (
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{row.quantityDetail}</div>
                ) : null}
              </td>
              <td style={tdRightStyle}>{currency(row.rateUsd)}</td>
              <td style={tdAmountStyle}>{currency(row.amountUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  fontFamily: invoiceTheme.fontFamily,
  color: invoiceTheme.text,
};

const cardStyle: CSSProperties = {
  border: `1px solid ${invoiceTheme.border}`,
  borderRadius: "12px",
  overflow: "hidden",
  background: invoiceTheme.white,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  padding: "16px 20px",
  background: `linear-gradient(135deg, ${invoiceTheme.primaryHighlightBg}, transparent)`,
  borderBottom: `1px solid ${invoiceTheme.border}`,
};

const headerLeftStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "10px",
};

const logoStyle: CSSProperties = {
  height: "48px",
  width: "auto",
  filter: "brightness(0)",
};

const headerTextStyle: CSSProperties = {
  textAlign: "right",
  fontSize: "14px",
};

const brandTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 700,
};

const headerLineStyle: CSSProperties = {
  margin: "4px 0 0",
};

const invoiceNumberStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

const linkStyle: CSSProperties = {
  color: invoiceTheme.primary,
  textDecoration: "underline",
};

const detailsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "24px",
  padding: "16px 20px 20px",
  fontSize: "14px",
};

const sectionLabelStyle: CSSProperties = {
  margin: "0 0 8px",
  fontWeight: 600,
};

const detailLineStyle: CSSProperties = {
  margin: "4px 0 0",
};

const detailLabelStyle: CSSProperties = {
  fontWeight: 600,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  padding: "14px 16px",
  borderBottom: `1px solid ${invoiceTheme.border}`,
  fontSize: "18px",
  fontWeight: 600,
};

const cardBodyStyle: CSSProperties = {
  padding: "16px",
  fontSize: "14px",
};

const bodyTextStyle: CSSProperties = {
  margin: "0 0 8px",
};

const strongTextStyle: CSSProperties = {
  margin: "0 0 8px",
  fontWeight: 600,
};

const dividerStyle: CSSProperties = {
  border: "none",
  borderTop: `1px solid ${invoiceTheme.border}`,
  margin: "12px 0",
};

const totalsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
  padding: "16px",
  fontSize: "14px",
};

const discountStyle: CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: invoiceTheme.discount,
};

const totalHighlightStyle: CSSProperties = {
  margin: 0,
  padding: "8px",
  borderRadius: "8px",
  border: `1px solid ${invoiceTheme.primaryBorder}`,
  background: invoiceTheme.primaryHighlightBg,
  fontSize: "16px",
  fontWeight: 700,
};

const tableTitleStyle: CSSProperties = {
  margin: 0,
  padding: "14px 16px",
  borderBottom: `1px solid ${invoiceTheme.border}`,
  background: invoiceTheme.mutedHeaderBg,
  fontSize: "18px",
  fontWeight: 600,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const tableHeadRowStyle: CSSProperties = {
  borderBottom: `1px solid ${invoiceTheme.border}`,
  background: "rgba(244, 244, 245, 0.7)",
};

const thStyle: CSSProperties = {
  padding: "8px",
  textAlign: "left",
  fontWeight: 600,
};

const thRightStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tableRowStyle: CSSProperties = {
  borderBottom: `1px solid ${invoiceTheme.border}`,
};

const tableLastRowStyle: CSSProperties = {};

const tdStyle: CSSProperties = {
  padding: "8px",
  verticalAlign: "top",
};

const tdRightStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const tdAmountStyle: CSSProperties = {
  ...tdRightStyle,
  fontWeight: 600,
};

export function InvoiceDocumentWebShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} style={rootStyle}>
      {children}
    </div>
  );
}
