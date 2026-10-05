import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import {
  ARBOR_CONTACT_EMAIL,
  ARBOR_LOGO_URL,
  ARBOR_WEBSITE_URL,
  bodyText,
  brand,
  brandDark,
  eyebrowText,
  mutedText,
} from "./brand-theme";

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
    <Html lang="en">
      <BrandHead />
      <Preview>{preview}</Preview>
      <Body className={DARK.canvas} style={outerBodyStyle}>
        <Container className={DARK.surface} style={containerStyle}>
          <BrandMasthead accentColor={accentColor} />

          <Section className={GUTTER_CLASS} style={contentSectionStyle}>
            <Heading className={DARK.text} style={headingStyle}>{heading}</Heading>
            {children}
          </Section>
        </Container>

        <BrandFooter
          tagline="Stanford's student-run live event production company"
          links={[
            { href: ARBOR_WEBSITE_URL, label: "arborlive.stanford.edu" },
            { href: `mailto:${ARBOR_CONTACT_EMAIL}`, label: "Contact" },
          ]}
          suffix={`© ${year} Arbor Live`}
        />
      </Body>
    </Html>
  );
}

/** Add to sections that sit on the 40px page gutter so it narrows on phones. */
export const GUTTER_CLASS = "arbor-gutter";

/**
 * Class hooks for the dark palette. Inline styles carry the light theme, and
 * the `prefers-color-scheme: dark` rules below override them with !important.
 * React Email's <Body> repeats its background on an inner cell without the
 * class, hence the descendant selector on the canvas rule.
 */
export const DARK = {
  canvas: "arbor-dm-canvas",
  surface: "arbor-dm-surface",
  raised: "arbor-dm-raised",
  text: "arbor-dm-text",
  body: "arbor-dm-body",
  muted: "arbor-dm-muted",
  accent: "arbor-dm-accent",
  rule: "arbor-dm-rule",
  alert: "arbor-dm-alert",
  note: "arbor-dm-note",
  secondaryButton: "arbor-dm-secondary-button",
} as const;

const darkModeCss = `@media (prefers-color-scheme: dark) {
  .${DARK.canvas},
  .${DARK.canvas} > table > tbody > tr > td { background-color: ${brandDark.canvas} !important; }
  .${DARK.surface} { background-color: ${brandDark.surface} !important; border-color: ${brandDark.border} !important; }
  .${DARK.raised} { background-color: ${brandDark.surfaceRaised} !important; border-left-color: ${brandDark.borderRaised} !important; border-right-color: ${brandDark.borderRaised} !important; border-bottom-color: ${brandDark.borderRaised} !important; }
  .${DARK.text} { color: ${brandDark.text} !important; }
  .${DARK.body} { color: ${brandDark.textBody} !important; }
  .${DARK.muted} { color: ${brandDark.textMuted} !important; }
  .${DARK.accent} { color: ${brandDark.accentText} !important; }
  .${DARK.rule} { border-color: ${brandDark.borderRaised} !important; }
  .${DARK.alert} { background-color: ${brandDark.warningSoft} !important; color: ${brandDark.warning} !important; }
  .${DARK.note} { background-color: ${brandDark.accentSoft} !important; }
  .${DARK.secondaryButton} { background-color: ${brandDark.surfaceRaised} !important; border-color: ${brandDark.borderRaised} !important; color: ${brandDark.text} !important; }
}`;

/** Fonts and color-scheme hints shared by every Arbor email. */
export function BrandHead() {
  return (
    <Head>
      {/* Declaring both schemes tells Apple Mail and Outlook for Mac to apply our dark
          palette rather than auto-inverting the light one. */}
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      {/* Inline padding can only be overridden with !important; clients without media
          query support keep the desktop padding. */}
      <style>{`@media only screen and (max-width: 480px) { .${GUTTER_CLASS} { padding-left: 20px !important; padding-right: 20px !important; } }`}</style>
      <style>{darkModeCss}</style>
      {/* Space Grotesk is a variable font; one file covers the heading weights. Each <Font>
          also emits a global `* { font-family }` rule and the last one wins, so it is
          declared before Inter; headings opt in through inline styles. */}
      <Font
        fontFamily="Space Grotesk"
        fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
        webFont={{
          url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2",
          format: "woff2",
        }}
        fontWeight={600}
        fontStyle="normal"
      />
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
    </Head>
  );
}

/** Zinc-950 band with the white logo and a green rule, echoing the site hero. */
export function BrandMasthead({ accentColor = brand.accent }: { accentColor?: string }) {
  return (
    <>
      <Section className={GUTTER_CLASS} style={mastheadStyle}>
        <Img src={ARBOR_LOGO_URL} alt="Arbor Live" width="104" style={logoStyle} />
      </Section>
      <Section style={{ ...accentBarStyle, backgroundColor: accentColor }} />
    </>
  );
}

export function BrandFooter({
  tagline,
  links,
  suffix,
}: {
  tagline: string;
  links: { href: string; label: string }[];
  suffix?: string;
}) {
  return (
    <Section className={GUTTER_CLASS} style={footerSectionStyle}>
      <Text className={DARK.muted} style={footerTaglineStyle}>{tagline}</Text>
      <Text className={DARK.muted} style={footerLineStyle}>
        {links.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? " · " : null}
            <Link className={DARK.text} href={link.href} style={footerLinkStyle}>
              {link.label}
            </Link>
          </span>
        ))}
        {suffix ? ` · ${suffix}` : null}
      </Text>
    </Section>
  );
}

export function BodyCopy({ children }: { children: ReactNode }) {
  return <Text className={DARK.body} style={bodyText}>{children}</Text>;
}

export function MutedCopy({ children }: { children: ReactNode }) {
  return <Text className={DARK.muted} style={mutedText}>{children}</Text>;
}

export function AlertBanner({ children }: { children: ReactNode }) {
  return (
    <Section className={DARK.alert} style={alertBannerStyle}>
      <Text className={DARK.alert} style={alertBannerTextStyle}>{children}</Text>
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
    <Row className={DARK.rule} style={detailRowStyle}>
      <Column style={detailLabelColumnStyle}>
        <Text className={DARK.muted} style={detailLabelStyle}>{label}</Text>
      </Column>
      <Column>
        <Text className={DARK.text} style={emphasis ? detailValueEmphasisStyle : detailValueStyle}>
          {value}
        </Text>
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
    <Section className={DARK.raised} style={variant === "muted" ? mutedCardStyle : dataCardStyle}>
      <Heading
        as="h2"
        className={variant === "muted" ? DARK.muted : DARK.accent}
        style={variant === "muted" ? mutedCardTitleStyle : cardTitleStyle}
      >
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
    <Section className={DARK.raised} style={dataCardStyle}>
      {title ? (
        <Heading as="h2" className={DARK.accent} style={cardTitleStyle}>
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
            className={DARK.rule}
            style={index < items.length - 1 ? timelineRowStyle : timelineRowLastStyle}
          >
            <Column style={timelineMarkerColumnStyle}>
              <Text className={DARK.accent} style={timelineMarkerStyle}>■</Text>
            </Column>
            <Column>
              <Text className={DARK.text} style={timelineLabelStyle}>{label}</Text>
              {time ? <Text className={DARK.muted} style={timelineTimeStyle}>{time}</Text> : null}
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
    <Section className={DARK.note} style={contactNoteStyle}>
      <Text className={DARK.accent} style={contactNoteLabelStyle}>Questions?</Text>
      <Text className={DARK.body} style={contactNoteTextStyle}>
        Reply to this email or contact {managerName}
        {managerEmail ? (
          <>
            {" at "}
            <InlineLink href={`mailto:${managerEmail}`}>{managerEmail}</InlineLink>
          </>
        ) : null}
        .
      </Text>
    </Section>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={DARK.accent} href={href} style={inlineLinkStyle}>
      {children}
    </Link>
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
        <Column align="left">
          <Button
            href={href}
            className={variant === "secondary" ? DARK.secondaryButton : undefined}
            style={buttonStyle}
          >
            {label}
          </Button>
        </Column>
      </Row>
    </Section>
  );
}

export function EmailSignOff() {
  return (
    <Text className={DARK.muted} style={signOffStyle}>
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
  padding: "32px 12px",
};

const containerStyle: CSSProperties = {
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  margin: "0 auto",
  maxWidth: brand.maxWidth,
};

const mastheadStyle: CSSProperties = {
  backgroundColor: brand.masthead,
  padding: "24px 40px",
};

const logoStyle: CSSProperties = {
  display: "block",
  height: "auto",
};

const accentBarStyle: CSSProperties = {
  height: "4px",
  lineHeight: "4px",
  fontSize: "4px",
};

const contentSectionStyle: CSSProperties = {
  padding: "36px 40px 32px",
};

const headingStyle: CSSProperties = {
  color: brand.text,
  fontFamily: brand.headingFontFamily,
  fontSize: "28px",
  fontWeight: "600",
  letterSpacing: "-0.0325em",
  lineHeight: "1.15",
  margin: "0 0 24px",
};

const dataCardStyle: CSSProperties = {
  backgroundColor: brand.surfaceRaised,
  border: `1px solid ${brand.border}`,
  borderTop: `2px solid ${brand.accent}`,
  margin: "0 0 24px",
  padding: "20px 22px 14px",
};

const mutedCardStyle: CSSProperties = {
  ...dataCardStyle,
  borderTop: `2px solid ${brand.mutedAccent}`,
};

const cardTitleStyle: CSSProperties = {
  ...eyebrowText,
};

const mutedCardTitleStyle: CSSProperties = {
  ...cardTitleStyle,
  color: brand.textSubtle,
};

const detailRowStyle: CSSProperties = {
  borderTop: `1px solid ${brand.border}`,
};

const detailLabelColumnStyle: CSSProperties = {
  width: "36%",
  verticalAlign: "top",
};

const detailLabelStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
  padding: "8px 12px 8px 0",
};

const detailValueStyle: CSSProperties = {
  color: brand.text,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
  padding: "8px 0",
};

const detailValueEmphasisStyle: CSSProperties = {
  ...detailValueStyle,
  fontFamily: brand.headingFontFamily,
  fontSize: "20px",
  fontWeight: "600",
  letterSpacing: "-0.02em",
  lineHeight: "26px",
};

const alertBannerStyle: CSSProperties = {
  backgroundColor: brand.warningSoft,
  borderLeft: `3px solid ${brand.warningBorder}`,
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
  borderBottom: `1px solid ${brand.border}`,
  marginBottom: "10px",
  paddingBottom: "10px",
};

const timelineRowLastStyle: CSSProperties = {
  marginBottom: "6px",
};

const timelineMarkerColumnStyle: CSSProperties = {
  width: "20px",
  verticalAlign: "top",
};

const timelineMarkerStyle: CSSProperties = {
  color: brand.accent,
  fontSize: "8px",
  lineHeight: "20px",
  margin: "0",
};

const timelineLabelStyle: CSSProperties = {
  color: brand.text,
  fontFamily: brand.headingFontFamily,
  fontSize: "15px",
  fontWeight: "600",
  letterSpacing: "-0.015em",
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
  borderLeft: `3px solid ${brand.accent}`,
  margin: "0 0 24px",
  padding: "14px 16px",
};

const contactNoteLabelStyle: CSSProperties = {
  ...eyebrowText,
  margin: "0 0 4px",
};

const contactNoteTextStyle: CSSProperties = {
  color: brand.textBody,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
};

const inlineLinkStyle: CSSProperties = {
  color: brand.accent,
  textDecoration: "underline",
};

const ctaSectionStyle: CSSProperties = {
  margin: "8px 0 28px",
};

const primaryButtonStyle: CSSProperties = {
  backgroundColor: brand.accent,
  border: `1px solid ${brand.accent}`,
  color: brand.accentForeground,
  display: "inline-block",
  fontFamily: brand.headingFontFamily,
  fontSize: "15px",
  fontWeight: "600",
  letterSpacing: "-0.015em",
  lineHeight: "1.2",
  padding: "14px 24px",
  textAlign: "center",
  textDecoration: "none",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  color: brand.text,
};

const footerSectionStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: brand.maxWidth,
  padding: "20px 40px 8px",
};

const footerTaglineStyle: CSSProperties = {
  color: brand.textSubtle,
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0 0 4px",
};

const footerLineStyle: CSSProperties = {
  color: brand.textSubtle,
  fontSize: "12px",
  lineHeight: "20px",
  margin: "0",
};

const footerLinkStyle: CSSProperties = {
  color: brand.textMuted,
  textDecoration: "underline",
};

const signOffStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0",
};

export { bodyText, mutedText } from "./brand-theme";
