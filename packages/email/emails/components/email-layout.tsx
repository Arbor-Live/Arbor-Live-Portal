import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

type EmailLayoutProps = {
  preview: string;
  heading: string;
  children: ReactNode;
};

export function EmailLayout({ preview, heading, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Text style={brandStyle}>Arbor Live</Text>
          </Section>
          <Heading style={headingStyle}>{heading}</Heading>
          {children}
          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            Arbor Notifications ·{" "}
            <Link href="https://arbor.st" style={linkStyle}>
              arbor.st
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EventDetailsSection({
  eventTitle,
  venueName,
  dateRangeLabel,
}: {
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
}) {
  return (
    <Section style={detailsStyle}>
      <Text style={detailLabelStyle}>Event</Text>
      <Text style={detailValueStyle}>{eventTitle}</Text>
      <Text style={detailLabelStyle}>When</Text>
      <Text style={detailValueStyle}>{dateRangeLabel}</Text>
      {venueName ? (
        <>
          <Text style={detailLabelStyle}>Venue</Text>
          <Text style={detailValueStyle}>{venueName}</Text>
        </>
      ) : null}
    </Section>
  );
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

const bodyStyle = {
  backgroundColor: "#f4f4f5",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: "0",
  padding: "24px 0",
};

const containerStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px",
};

const headerStyle = {
  marginBottom: "8px",
};

const brandStyle = {
  color: "#18181b",
  fontSize: "14px",
  fontWeight: "600",
  letterSpacing: "0.04em",
  margin: "0",
  textTransform: "uppercase" as const,
};

const headingStyle = {
  color: "#18181b",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.3",
  margin: "0 0 24px",
};

const detailsStyle = {
  marginBottom: "24px",
};

const detailLabelStyle = {
  color: "#71717a",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.04em",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
};

const detailValueStyle = {
  color: "#18181b",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0 0 16px",
};

const ctaSectionStyle = {
  marginBottom: "24px",
};

const buttonStyle = {
  backgroundColor: "#18181b",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 20px",
  textDecoration: "none",
};

const hrStyle = {
  borderColor: "#e4e4e7",
  margin: "24px 0",
};

const footerStyle = {
  color: "#a1a1aa",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
};

const linkStyle = {
  color: "#71717a",
  textDecoration: "underline",
};
