import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { ARBOR_CONTACT_EMAIL, ARBOR_LOGO_URL, ARBOR_WEBSITE_URL, bodyText, brand, mutedText } from "./brand-theme";

type EmailTone = "default" | "muted";

type EmailLayoutProps = {
  preview: string;
  heading: string;
  children: ReactNode;
  tone?: EmailTone;
};

export function EmailLayout({
  preview,
  heading,
  children,
  tone = "default",
}: EmailLayoutProps) {
  const year = new Date().getFullYear();
  const accentColor = tone === "muted" ? brand.mutedAccent : brand.accent;

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiA.woff2",
            format: "woff2",
          }}
          fontWeight={600}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={outerBodyStyle}>
        <Container style={containerStyle}>
          <Section style={{ ...accentBarStyle, backgroundColor: accentColor }} />

          <Section style={logoSectionStyle}>
            <Img src={ARBOR_LOGO_URL} alt="Arbor Live" width="168" style={logoStyle} />
          </Section>

          <Section style={contentSectionStyle}>
            <Heading style={headingStyle}>{heading}</Heading>
            {children}
          </Section>

          <Hr style={hrStyle} />

          <Section style={footerSectionStyle}>
            <Text style={footerTaglineStyle}>
              Stanford&apos;s student-run live event production company
            </Text>
            <Text style={footerLineStyle}>
              <Link href={ARBOR_WEBSITE_URL} style={footerLinkStyle}>
                arborlive.stanford.edu
              </Link>
              {" · "}
              <Link href={`mailto:${ARBOR_CONTACT_EMAIL}`} style={footerLinkStyle}>
                Contact
              </Link>
              {" · "}© {year} Arbor Live
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function BodyCopy({ children }: { children: ReactNode }) {
  return <Text style={bodyText}>{children}</Text>;
}

export function MutedCopy({ children }: { children: ReactNode }) {
  return <Text style={mutedText}>{children}</Text>;
}

export function AlertBanner({ children }: { children: ReactNode }) {
  return (
    <Section style={alertBannerStyle}>
      <Text style={alertBannerTextStyle}>{children}</Text>
    </Section>
  );
}

export function DetailRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Row style={detailRowStyle}>
      <Column style={detailLabelColumnStyle}>
        <Text style={detailLabelStyle}>{label}</Text>
      </Column>
      <Column>
        <Text style={emphasis ? detailValueEmphasisStyle : detailValueStyle}>{value}</Text>
      </Column>
    </Row>
  );
}

export function DataCard({
  title,
  children,
  variant = "default",
}: {
  title: string;
  children: ReactNode;
  variant?: "default" | "muted";
}) {
  return (
    <Section style={variant === "muted" ? mutedCardStyle : dataCardStyle}>
      <Heading as="h2" style={variant === "muted" ? mutedCardTitleStyle : cardTitleStyle}>
        {title}
      </Heading>
      {children}
    </Section>
  );
}

/** @deprecated Use DataCard — kept as alias for existing templates during migration. */
export const HighlightBox = DataCard;

export function InfoCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Section style={dataCardStyle}>
      {title ? (
        <Heading as="h2" style={cardTitleStyle}>
          {title}
        </Heading>
      ) : null}
      {children}
    </Section>
  );
}

export function EventDetailsSection({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventLeadName,
  title = "Event Summary",
  variant = "default",
}: {
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  eventLeadName?: string;
  title?: string;
  variant?: "default" | "muted";
}) {
  return (
    <DataCard title={title} variant={variant}>
      <DetailRow label="Event" value={eventTitle} />
      <DetailRow label="Date & time" value={dateRangeLabel} />
      {venueName ? <DetailRow label="Venue" value={venueName} /> : null}
      {eventLeadName ? <DetailRow label="Day-of lead" value={eventLeadName} /> : null}
    </DataCard>
  );
}

export function ScheduleTimeline({ items, title = "Schedule" }: { items: string[]; title?: string }) {
  return (
    <InfoCard title={title}>
      {items.map((item, index) => {
        const separatorIndex = item.indexOf(" • ");
        const label = separatorIndex >= 0 ? item.slice(0, separatorIndex) : item;
        const time =
          separatorIndex >= 0 ? item.slice(separatorIndex + 3) : undefined;

        return (
          <Row
            key={`${item}-${index}`}
            style={index < items.length - 1 ? timelineRowStyle : timelineRowLastStyle}
          >
            <Column style={timelineMarkerColumnStyle}>
              <Text style={timelineMarkerStyle}>●</Text>
            </Column>
            <Column>
              <Text style={timelineLabelStyle}>{label}</Text>
              {time ? <Text style={timelineTimeStyle}>{time}</Text> : null}
            </Column>
          </Row>
        );
      })}
    </InfoCard>
  );
}

export function ContactNote({
  managerName,
  managerEmail,
}: {
  managerName: string;
  managerEmail?: string;
}) {
  return (
    <Section style={contactNoteStyle}>
      <Text style={contactNoteLabelStyle}>Questions?</Text>
      <Text style={contactNoteTextStyle}>
        Reply to this email or contact {managerName}
        {managerEmail ? (
          <>
            {" at "}
            <Link href={`mailto:${managerEmail}`} style={inlineLinkStyle}>
              {managerEmail}
            </Link>
          </>
        ) : null}
        .
      </Text>
    </Section>
  );
}

export function CtaButton({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const buttonStyle = variant === "secondary" ? secondaryButtonStyle : primaryButtonStyle;

  return (
    <Section style={ctaSectionStyle}>
      <Row>
        <Column align="center">
          <Button href={href} style={buttonStyle}>
            {label}
          </Button>
        </Column>
      </Row>
    </Section>
  );
}

export function EmailSignOff() {
  return (
    <Text style={signOffStyle}>
      Best regards,
      <br />
      The Arbor Live Team
    </Text>
  );
}

const outerBodyStyle: CSSProperties = {
  backgroundColor: brand.canvas,
  fontFamily: brand.fontFamily,
  margin: "0",
  padding: "32px 16px",
};

const containerStyle: CSSProperties = {
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: brand.maxWidth,
};

const accentBarStyle: CSSProperties = {
  height: "3px",
  lineHeight: "3px",
  fontSize: "3px",
};

const logoSectionStyle: CSSProperties = {
  padding: "28px 32px 12px",
  textAlign: "center",
};

const logoStyle: CSSProperties = {
  display: "inline-block",
  height: "auto",
  margin: "0 auto",
};

const contentSectionStyle: CSSProperties = {
  padding: "8px 32px 28px",
};

const headingStyle: CSSProperties = {
  color: brand.text,
  fontSize: "24px",
  fontWeight: "700",
  letterSpacing: "-0.02em",
  lineHeight: "1.2",
  margin: "0 0 20px",
  textAlign: "center",
};

const dataCardStyle: CSSProperties = {
  backgroundColor: brand.surfaceInset,
  border: `1px solid ${brand.accentBorder}`,
  borderRadius: "10px",
  margin: "0 0 24px",
  padding: "20px",
};

const mutedCardStyle: CSSProperties = {
  ...dataCardStyle,
  backgroundColor: brand.surfaceRaised,
  border: `1px solid ${brand.border}`,
};

const cardTitleStyle: CSSProperties = {
  color: brand.accentBright,
  fontSize: "13px",
  fontWeight: "600",
  letterSpacing: "0.06em",
  lineHeight: "1.2",
  margin: "0 0 16px",
  textTransform: "uppercase",
};

const mutedCardTitleStyle: CSSProperties = {
  ...cardTitleStyle,
  color: brand.textMuted,
};

const detailRowStyle: CSSProperties = {
  marginBottom: "10px",
};

const detailLabelColumnStyle: CSSProperties = {
  width: "38%",
  verticalAlign: "top",
};

const detailLabelStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
};

const detailValueStyle: CSSProperties = {
  color: brand.text,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
};

const detailValueEmphasisStyle: CSSProperties = {
  ...detailValueStyle,
  color: brand.text,
  fontSize: "18px",
  fontWeight: "700",
  lineHeight: "24px",
};

const alertBannerStyle: CSSProperties = {
  backgroundColor: brand.warningSoft,
  borderLeft: `3px solid ${brand.warningBorder}`,
  borderRadius: "8px",
  margin: "0 0 24px",
  padding: "14px 16px",
};

const alertBannerTextStyle: CSSProperties = {
  color: brand.warning,
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "22px",
  margin: "0",
};

const timelineRowStyle: CSSProperties = {
  borderBottom: `1px solid ${brand.borderSubtle}`,
  marginBottom: "12px",
  paddingBottom: "12px",
};

const timelineRowLastStyle: CSSProperties = {
  marginBottom: "0",
};

const timelineMarkerColumnStyle: CSSProperties = {
  width: "24px",
  verticalAlign: "top",
};

const timelineMarkerStyle: CSSProperties = {
  color: brand.accent,
  fontSize: "10px",
  lineHeight: "22px",
  margin: "0",
};

const timelineLabelStyle: CSSProperties = {
  color: brand.text,
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "20px",
  margin: "0 0 2px",
};

const timelineTimeStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};

const contactNoteStyle: CSSProperties = {
  backgroundColor: brand.accentSoft,
  borderRadius: "8px",
  margin: "0 0 24px",
  padding: "14px 16px",
};

const contactNoteLabelStyle: CSSProperties = {
  color: brand.accentBright,
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.04em",
  lineHeight: "18px",
  margin: "0 0 4px",
  textTransform: "uppercase",
};

const contactNoteTextStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
};

const inlineLinkStyle: CSSProperties = {
  color: brand.accentBright,
  textDecoration: "underline",
};

const ctaSectionStyle: CSSProperties = {
  margin: "4px 0 24px",
};

const primaryButtonStyle: CSSProperties = {
  backgroundColor: brand.accent,
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "1.2",
  padding: "14px 28px",
  textAlign: "center",
  textDecoration: "none",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: brand.surfaceRaised,
  border: `1px solid ${brand.border}`,
  color: brand.text,
};

const hrStyle: CSSProperties = {
  borderColor: brand.borderSubtle,
  borderTop: `1px solid ${brand.borderSubtle}`,
  margin: "0",
};

const footerSectionStyle: CSSProperties = {
  padding: "20px 32px 28px",
};

const footerTaglineStyle: CSSProperties = {
  color: brand.textSubtle,
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0 0 8px",
  textAlign: "center",
};

const footerLineStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0",
  textAlign: "center",
};

const footerLinkStyle: CSSProperties = {
  color: brand.accentBright,
  textDecoration: "none",
};

const signOffStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0",
};

export { bodyText, mutedText } from "./brand-theme";
