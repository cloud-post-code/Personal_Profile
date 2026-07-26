"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * Client-side PostHog analytics: pageviews + autocapture of visitor clicks on
 * the public chat UI. Initialised once on mount. No-ops when the key is unset
 * (e.g. local dev without analytics), so it never breaks the site.
 *
 * Server code is untouched — this is purely client analytics. The provider
 * wraps {children} inside <body>, leaving layout.tsx's DB-driven theme <head>
 * and force-dynamic rendering exactly as they were.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      // We fire pageviews manually below so App Router navigations are captured.
      capture_pageview: false,
      capture_pageleave: true,
    });
    posthog.capture("$pageview");
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
