import {
  Body,
  Container,
  Column,
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
import { Font } from "@react-email/components";
import type { CSSProperties } from "react";
import { brand, ARBOR_LOGO_URL } from "./_components/brand-theme";
import type { ThisWeekAtArborEmailProps, ThisWeekEvent } from "../src/types";

/**
 * Public marketing newsletter. Unlike the transactional layouts in
 * `_components/email-layout.tsx`, this one is optimized for scanning a week of
 * shows from a phone lock screen: poster-led cards, big date, one clear action.
 */
export function ThisWeekAtArborEmail({
  recipientName,
  weekLabel,
  events,
  allEventsUrl,
  unsubscribeUrl,
}: ThisWeekAtArborEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const count = events.length;

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
      </Head>
      <Preview>
        {count === 1
          ? `One show this week at Arbor Live`
          : `${count} shows this week at Arbor Live`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={mastheadStyle}>
            <Img src={ARBOR_LOGO_URL} alt="Arbor Live" width="132" style={logoStyle} />
          </Section>

          <Section style={heroStyle}>
            <Text style={kickerStyle}>This week at Arbor</Text>
            <Heading style={weekLabelStyle}>{weekLabel}</Heading>
            <Text style={introStyle}>
              {greeting} here&apos;s what&apos;s happening on campus this week.
            </Text>
          </Section>

          <Section style={listStyle}>
            {events.map((event, index) => (
              <EventCard key={`${event.eventUrl}-${index}`} event={event} />
            ))}
          </Section>

          <Section style={ctaSectionStyle}>
            <Row>
              <Column align="center">
                <Link href={allEventsUrl} style={ctaLinkStyle}>
                  See all upcoming events →
                </Link>
              </Column>
            </Row>
          </Section>

          <Hr style={hrStyle} />

          <Section style={footerStyle}>
            <Text style={footerTaglineStyle}>
              You&apos;re getting this because you signed up for This Week at Arbor.
            </Text>
            <Text style={footerLineStyle}>
              <Link href={allEventsUrl} style={footerLinkStyle}>
                arborlive.stanford.edu
              </Link>
              {" · "}
              <Link href={unsubscribeUrl} style={footerLinkStyle}>
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function EventCard({ event }: { event: ThisWeekEvent }) {
  return (
    <Section style={cardStyle}>
      {event.posterImageUrl ? (
        <Img
          src={event.posterImageUrl}
          alt={`${event.title} poster`}
          width="496"
          style={posterStyle}
        />
      ) : null}
      <Section style={cardBodyStyle}>
        <Text style={whenStyle}>{event.whenLabel}</Text>
        <Heading as="h2" style={eventTitleStyle}>
          {event.title}
        </Heading>
        {event.venueName || event.hostLabel ? (
          <Text style={metaStyle}>
            {[event.venueName, event.hostLabel].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {event.caption ? <Text style={captionStyle}>{event.caption}</Text> : null}
        <Text style={actionsStyle}>
          <Link href={event.eventUrl} style={primaryLinkStyle}>
            Details &amp; tickets
          </Link>
          {event.openMicSignupUrl ? (
            <>
              {"  ·  "}
              <Link href={event.openMicSignupUrl} style={accentLinkStyle}>
                Sign up for Open Mic
              </Link>
            </>
          ) : null}
        </Text>
      </Section>
    </Section>
  );
}

ThisWeekAtArborEmail.PreviewProps = {
  recipientName: "Alex",
  weekLabel: "May 5 – May 11",
  allEventsUrl: "http://localhost:3000/events",
  unsubscribeUrl: "http://localhost:3000/newsletter?token=demo",
  events: [
    {
      title: "Spring Showcase",
      whenLabel: "Fri, May 9 · 7:00 PM",
      venueName: "Memorial Church",
      hostLabel: "Arbor Live",
      caption: "Our biggest student showcase of the quarter, featuring six acts.",
      eventUrl: "http://localhost:3000/events/demo-1",
      openMicSignupUrl: "http://localhost:3000/open-mic",
    },
    {
      title: "Outdoor Concert",
      whenLabel: "Sat, May 10 · 5:30 PM",
      venueName: "White Plaza",
      hostLabel: "Arbor Live",
      eventUrl: "http://localhost:3000/events/demo-2",
    },
  ],
} satisfies ThisWeekAtArborEmailProps;

export default ThisWeekAtArborEmail;

const bodyStyle: CSSProperties = {
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

const mastheadStyle: CSSProperties = {
  borderBottom: `1px solid ${brand.borderSubtle}`,
  padding: "24px 32px",
  textAlign: "center",
};

const logoStyle: CSSProperties = {
  display: "inline-block",
  height: "auto",
  margin: "0 auto",
};

const heroStyle: CSSProperties = {
  padding: "28px 32px 8px",
  textAlign: "center",
};

const kickerStyle: CSSProperties = {
  color: brand.accentBright,
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.12em",
  lineHeight: "18px",
  margin: "0 0 8px",
  textTransform: "uppercase",
};

const weekLabelStyle: CSSProperties = {
  color: brand.text,
  fontSize: "30px",
  fontWeight: "700",
  letterSpacing: "-0.03em",
  lineHeight: "1.15",
  margin: "0 0 12px",
};

const introStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0",
};

const listStyle: CSSProperties = {
  padding: "20px 24px 8px",
};

const cardStyle: CSSProperties = {
  backgroundColor: brand.surfaceInset,
  border: `1px solid ${brand.border}`,
  borderRadius: "12px",
  margin: "0 0 16px",
  overflow: "hidden",
};

const posterStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
};

const cardBodyStyle: CSSProperties = {
  padding: "18px 20px 20px",
};

const whenStyle: CSSProperties = {
  color: brand.accentBright,
  fontSize: "13px",
  fontWeight: "600",
  letterSpacing: "0.04em",
  lineHeight: "20px",
  margin: "0 0 6px",
  textTransform: "uppercase",
};

const eventTitleStyle: CSSProperties = {
  color: brand.text,
  fontSize: "20px",
  fontWeight: "700",
  letterSpacing: "-0.02em",
  lineHeight: "1.25",
  margin: "0 0 6px",
};

const metaStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};

const captionStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 14px",
};

const actionsStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "22px",
  margin: "0",
};

const primaryLinkStyle: CSSProperties = {
  color: brand.accentBright,
  textDecoration: "underline",
};

const accentLinkStyle: CSSProperties = {
  color: brand.text,
  textDecoration: "underline",
};

const ctaSectionStyle: CSSProperties = {
  padding: "8px 24px 24px",
};

const ctaLinkStyle: CSSProperties = {
  backgroundColor: brand.accent,
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "1.2",
  padding: "14px 28px",
  textDecoration: "none",
};

const hrStyle: CSSProperties = {
  borderColor: brand.borderSubtle,
  borderTop: `1px solid ${brand.borderSubtle}`,
  margin: "0",
};

const footerStyle: CSSProperties = {
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
