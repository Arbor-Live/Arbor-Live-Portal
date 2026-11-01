// This file configures the initialization of Sentry on the client.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,

  integrations: [Sentry.replayIntegration()],

  tracesSampleRate: 0.1,

  // 10% of sessions; 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
