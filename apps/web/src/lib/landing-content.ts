export const ARBOR_CONTACT_EMAIL = "arborlive@stanford.edu";
export const ARBOR_EXTERNAL_SITE = "https://arborlive.stanford.edu";

export type LandingLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type LandingProgram = {
  id: string;
  title: string;
  description: string;
  schedule?: { when: string; where: string };
  cta?: LandingLink;
  /** CSS gradient placeholder when no image asset is provided */
  imageGradient: string;
  featured?: boolean;
};

export type LandingStat = {
  value: string;
  label: string;
};

export type LandingFaq = {
  question: string;
  answer: string;
};

export const landingHero = {
  eyebrow: "We are Arbor Live",
  headline: "We make",
  accentWord: "Live Events",
  headlineEnd: "Happen",
  subheadline:
    "The only student-run live event production company at Stanford. We bring live music and production to every corner of campus.",
  primaryCta: { label: "Book your event", href: "/public/request" },
  secondaryCta: { label: "Explore equipment", href: "/public/packages" },
  /** H.264 plays in Chrome/Firefox; HEVC is smaller and used on Safari when supported. */
  backgroundVideoSrc: "/dnm-opti-h264.mp4",
  backgroundVideoSrcHevc: "/dnm-opti-265.mp4",
  backgroundVideoCredit: { label: "VEP", href: "https://wearevep.com" },
} as const;

export const landingMission = {
  title: "Spread joy and spark connections",
  body: "Our mission is to bring live music to every corner of campus — from trivia nights to open mics, jams, and full production for your group.",
  seriesTitle: "Weekly on campus",
  seriesSubtitle: "Show up, bring friends, and make some noise.",
} as const;

export const landingPrograms: LandingProgram[] = [
  {
    id: "trivia",
    title: "Trivia",
    description:
      "Ahhhh the good ol' classic! Join us every Thursday right outside Arbor Bar next to the huge screen for fun trivia with friends. Come with your crew, pick a team name, and get answering!",
    schedule: { when: "Thu · 7pm", where: "Arbor Bar" },
    cta: { label: "Open Instagram", href: "https://instagram.com/arbortrivia", external: true },
    imageGradient: "from-amber-900/70 via-primary/35 to-zinc-900",
  },
  {
    id: "jams",
    title: "Musician Jams and Mixers",
    description:
      "Arbor is all about community! We're the mesh that connects musicians all throughout campus. Every two weeks, musicians come together to play in a friendly, collaborative environment.",
    schedule: { when: "Wed · 7pm", where: "Varies!" },
    cta: {
      label: "When's the next jam?",
      href: `${ARBOR_EXTERNAL_SITE}/socials`,
      external: true,
    },
    imageGradient: "from-zinc-900 via-primary/30 to-emerald-950",
  },
  {
    id: "open-mic",
    title: "Open Mic at CoHo",
    description:
      "Join us at CoHo every other Wednesday to show off your skills! Whether you're a singer, a comedian, or want to show off something cool — we're eager to see what you've got.",
    schedule: { when: "Wed · 8pm", where: "CoHo" },
    cta: { label: "Sign up to perform", href: `${ARBOR_EXTERNAL_SITE}/open-mic`, external: true },
    imageGradient: "from-violet-950/80 via-primary/25 to-zinc-900",
  },
  {
    id: "singer-songwriter",
    title: "Singer-songwriter at OnCall Café",
    description:
      "Join us every Tuesday at OnCall Café to chill and study! Come listen to Stanford's up-and-coming singer-songwriters perform and show off their work.",
    schedule: { when: "Tue · 8pm", where: "OnCall Café" },
    cta: {
      label: "Check out OnCall Café",
      href: `${ARBOR_EXTERNAL_SITE}/socials`,
      external: true,
    },
    imageGradient: "from-emerald-950/90 via-primary/20 to-zinc-900",
  },
  {
    id: "stage",
    title: "The Arbor Live Stage",
    description:
      "Join us every week during Fall and Spring quarters and listen to the best bands on campus perform in a relaxed setting. Grab dinner, hang out, and party like it's 1999.",
    cta: { label: "See what's on", href: `${ARBOR_EXTERNAL_SITE}/socials`, external: true },
    imageGradient: "from-emerald-900/80 via-primary/40 to-zinc-900",
  },
  {
    id: "your-event",
    title: "Your event!",
    description:
      "Ask Arbor Live to run your event. Tell us when and where — we'll handle logistics, booking, and running the show so you can focus on your community.",
    cta: { label: "Book us", href: "/public/request" },
    imageGradient: "from-primary/50 via-zinc-900 to-emerald-950/90",
    featured: true,
  },
];

export const landingStats: LandingStat[] = [
  { value: "200+", label: "Events per year" },
  { value: "40+", label: "Trusted campus orgs" },
  { value: "30+", label: "Student producers" },
  { value: "10+", label: "Years of experience" },
];

export const landingEventTypes: string[] = [
  "Boileroom",
  "DJs",
  "Debates",
  "Festivals",
  "Open Mics",
  "Row Sigs",
  "Workshops",
  "Live Bands",
  "Trivia",
  "Dance Shows",
  "Corporate Events",
  "Competitions",
  "Film Screenings",
  "Musicals",
  "A Cappella",
  "+ More",
];

export const landingFaqs: LandingFaq[] = [
  {
    question: "How can I join Arbor Live?",
    answer:
      "We accept inquiries year-round via Instagram or email. Our primary recruitment happens during the first quarter of the academic year. Reach out to learn about hands-on roles in sound, lighting, design, marketing, and operations.",
  },
  {
    question: "The Arbor? Arbor Live? What's the difference?",
    answer:
      "The Arbor is Stanford's student union space in Tresidder. Arbor Live is the student-run production company that powers live events across campus — including weekly programming at the Arbor Live Stage and production services for student groups.",
  },
  {
    question: "How do I book Arbor Live for my event?",
    answer:
      "Submit a booking request through our portal. A member of our team will follow up within 1–5 business days with next steps. For urgent requests, email arborlive@stanford.edu.",
  },
];

export const landingNavLinks: LandingLink[] = [
  { label: "Programs", href: "/#programs" },
  { label: "Work", href: "/work" },
  { label: "Crew", href: "/crew" },
  { label: "Artists", href: "/artists" },
  { label: "Equipment", href: "/public/packages" },
  { label: "Book us", href: "/public/request" },
];

export const landingFooterLinks: LandingLink[] = [
  { label: "Our Work", href: "/work" },
  { label: "The Team", href: "/crew" },
  { label: "Artists", href: "/artists" },
  { label: "Book Us", href: "/public/request" },
  { label: "Instagram", href: "https://instagram.com/thearborstanford", external: true },
  { label: "Feedback", href: `${ARBOR_EXTERNAL_SITE}/feedback`, external: true },
];

export const landingPortalLinks: LandingLink[] = [
  { label: "Equipment packages", href: "/public/packages" },
  { label: "Model types", href: "/public/types" },
  { label: "Staff sign-in", href: "/sign-in" },
];
