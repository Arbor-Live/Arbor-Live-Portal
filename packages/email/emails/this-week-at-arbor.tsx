import {
  Body,
  Container,
  Column,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties } from "react";
import { BrandFooter, BrandHead, BrandMasthead, DARK, GUTTER_CLASS } from "./_components/email-layout";
import { brand, eyebrowText } from "./_components/brand-theme";
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
    <Html lang="en">
      <BrandHead />
      <Preview>
        {count === 1
          ? `One show this week at Arbor Live`
          : `${count} shows this week at Arbor Live`}
      </Preview>
      <Body className={DARK.canvas} style={bodyStyle}>
        <Container className={DARK.surface} style={containerStyle}>
          <BrandMasthead />

          <Section className={GUTTER_CLASS} style={heroStyle}>
            <Text className={DARK.accent} style={kickerStyle}>This week at Arbor</Text>
            <Heading className={DARK.text} style={weekLabelStyle}>{weekLabel}</Heading>
            <Text className={DARK.muted} style={introStyle}>
              {greeting} here&apos;s what&apos;s happening on campus this week.
            </Text>
          </Section>

          <Section className={GUTTER_CLASS} style={listStyle}>
            {events.map((event, index) => (
              <EventCard key={`${event.eventUrl}-${index}`} event={event} />
            ))}
          </Section>

          <Section className={GUTTER_CLASS} style={ctaSectionStyle}>
            <Row>
              <Column align="left">
                <Link href={allEventsUrl} style={ctaLinkStyle}>
                  See all upcoming events →
                </Link>
              </Column>
            </Row>
          </Section>

        </Container>

        <BrandFooter
          tagline="You're getting this because you signed up for This Week at Arbor."
          links={[
            { href: allEventsUrl, label: "arborlive.stanford.edu" },
            { href: unsubscribeUrl, label: "Unsubscribe" },
          ]}
        />
      </Body>
    </Html>
  );
}

function EventCard({ event }: { event: ThisWeekEvent }) {
  return (
    <Section className={DARK.surface} style={cardStyle}>
      {event.posterImageUrl ? (
        <Img
          src={event.posterImageUrl}
          alt={`${event.title} poster`}
          width="518"
          style={posterStyle}
        />
      ) : null}
      <Section style={cardBodyStyle}>
        <Text className={DARK.accent} style={whenStyle}>{event.whenLabel}</Text>
        <Heading as="h2" className={DARK.text} style={eventTitleStyle}>
          {event.title}
        </Heading>
        {event.venueName || event.hostLabel ? (
          <Text className={DARK.muted} style={metaStyle}>
            {[event.venueName, event.hostLabel].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {event.caption ? <Text className={DARK.body} style={captionStyle}>{event.caption}</Text> : null}
        <Text style={actionsStyle}>
          <Link className={DARK.accent} href={event.eventUrl} style={primaryLinkStyle}>
            Details &amp; tickets
          </Link>
          {event.openMicSignupUrl ? (
            <>
              {"  ·  "}
              <Link className={DARK.text} href={event.openMicSignupUrl} style={accentLinkStyle}>
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
  padding: "32px 12px",
};

const containerStyle: CSSProperties = {
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  margin: "0 auto",
  maxWidth: brand.maxWidth,
};

const heroStyle: CSSProperties = {
  padding: "36px 40px 8px",
};

const kickerStyle: CSSProperties = {
  ...eyebrowText,
  margin: "0 0 10px",
};

const weekLabelStyle: CSSProperties = {
  color: brand.text,
  fontFamily: brand.headingFontFamily,
  fontSize: "36px",
  fontWeight: "600",
  letterSpacing: "-0.0325em",
  lineHeight: "1.1",
  margin: "0 0 14px",
};

const introStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0",
};

const listStyle: CSSProperties = {
  padding: "24px 40px 4px",
};

const cardStyle: CSSProperties = {
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  margin: "0 0 20px",
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
  ...eyebrowText,
  margin: "0 0 8px",
};

const eventTitleStyle: CSSProperties = {
  color: brand.text,
  fontFamily: brand.headingFontFamily,
  fontSize: "22px",
  fontWeight: "600",
  letterSpacing: "-0.0325em",
  lineHeight: "1.2",
  margin: "0 0 6px",
};

const metaStyle: CSSProperties = {
  color: brand.textMuted,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};

const captionStyle: CSSProperties = {
  color: brand.textBody,
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
  color: brand.accent,
  textDecoration: "underline",
};

const accentLinkStyle: CSSProperties = {
  color: brand.text,
  textDecoration: "underline",
};

const ctaSectionStyle: CSSProperties = {
  padding: "4px 40px 36px",
};

const ctaLinkStyle: CSSProperties = {
  backgroundColor: brand.accent,
  color: brand.accentForeground,
  display: "inline-block",
  fontFamily: brand.headingFontFamily,
  fontSize: "15px",
  fontWeight: "600",
  letterSpacing: "-0.015em",
  lineHeight: "1.2",
  padding: "14px 24px",
  textDecoration: "none",
};
