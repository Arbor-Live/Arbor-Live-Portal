import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { ARBOR_LOGO_URL, bodyText, brand, mutedText } from "./brand-theme";

type EmailLayoutProps = {
  preview: string;
  heading: string;
  children: ReactNode;
  alignHeading?: "left" | "center";
};

export function EmailLayout({
  preview,
  heading,
  children,
  alignHeading = "center",
}: EmailLayoutProps) {
  const year = new Date().getFullYear();

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={outerBodyStyle}>
        <Container style={containerStyle}>
          <Section style={logoSectionStyle}>
            <Img
              src={ARBOR_LOGO_URL}
              alt="Arbor Live"
              width="200"
              style={logoStyle}
            />
          </Section>

          <Section style={contentSectionStyle}>
            <Heading style={{ ...headingStyle, textAlign: alignHeading }}>{heading}</Heading>
            {children}
          </Section>

          <Hr style={hrStyle} />

          <Section style={footerSectionStyle}>
            <Text style={footerLineStyle}>
              <Link href="https://arbor.st" style={footerLinkStyle}>
                Arbor Live
              </Link>
              {" • "}Stanford University
            </Text>
            <Text style={footerLineStyle}>
              Stanford&apos;s student-run live event production company
            </Text>
            <Text style={footerLineStyle}>
              <Link href="https://arbor.st/feedback" style={footerLinkStyle}>
                Contact Us
              </Link>
              {" • "}© {year} Arbor Live
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

export function EventDetailsSection({
  eventTitle,
  venueName,
  dateRangeLabel,
  title = "Event Summary",
}: {
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  title?: string;
}) {
  return (
    <Section style={highlightBoxStyle}>
      <Heading as="h2" style={highlightHeadingStyle}>
        {title}
      </Heading>
      <Text style={highlightLineStyle}>
        <strong>Event:</strong> {eventTitle}
      </Text>
      <Text style={highlightLineStyle}>
        <strong>Date &amp; Time:</strong> {dateRangeLabel}
      </Text>
      {venueName ? (
        <Text style={highlightLineStyle}>
          <strong>Venue:</strong> {venueName}
        </Text>
      ) : null}
    </Section>
  );
}

export function HighlightBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Section style={highlightBoxStyle}>
      <Heading as="h2" style={highlightHeadingStyle}>
        {title}
      </Heading>
      {children}
    </Section>
  );
}

export function InfoCard({ children }: { children: ReactNode }) {
  return <Section style={infoCardStyle}>{children}</Section>;
}

export function CtaButton({ href, label }: { href: string; label: string }) {
  return (
    <Section style={ctaSectionStyle}>
      <Button href={href} style={buttonStyle}>
        {label}
      </Button>
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

const outerBodyStyle = {
  backgroundColor: brand.background,
  fontFamily: brand.fontFamily,
  margin: "0",
  padding: "24px 0",
};

const containerStyle = {
  backgroundColor: brand.background,
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: brand.maxWidth,
  overflow: "hidden" as const,
};

const logoSectionStyle = {
  padding: "32px 32px 16px",
  textAlign: "center" as const,
};

const logoStyle = {
  display: "block",
  margin: "0 auto",
  maxWidth: "200px",
  width: "40%",
  height: "auto",
};

const contentSectionStyle = {
  padding: "0 32px 32px",
};

const headingStyle = {
  color: brand.text,
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.25",
  margin: "0 0 24px",
};

const highlightBoxStyle = {
  backgroundColor: brand.accent,
  borderRadius: "8px",
  margin: "0 0 32px",
  padding: "24px",
};

const highlightHeadingStyle = {
  color: brand.accentText,
  fontSize: "20px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 16px",
};

const highlightLineStyle = {
  color: brand.accentText,
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};

const infoCardStyle = {
  border: `1px solid ${brand.border}`,
  borderRadius: "8px",
  margin: "0 0 24px",
  padding: "16px",
};

const ctaSectionStyle = {
  margin: "0 0 24px",
  textAlign: "center" as const,
};

const buttonStyle = {
  backgroundColor: brand.accent,
  borderRadius: "8px",
  color: brand.accentText,
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  padding: "14px 28px",
  textDecoration: "none",
};

const hrStyle = {
  borderColor: brand.border,
  borderTop: `1px solid ${brand.border}`,
  margin: "0 32px 0",
};

const footerSectionStyle = {
  padding: "0 32px 32px",
};

const footerLineStyle = {
  color: brand.text,
  fontSize: "12px",
  lineHeight: "24px",
  margin: "0",
  textAlign: "center" as const,
};

const footerLinkStyle = {
  color: brand.accent,
  textDecoration: "underline",
};

const signOffStyle = {
  color: brand.text,
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 8px",
};

// Re-export for templates that need inline tweaks
export { bodyText, mutedText } from "./brand-theme";
