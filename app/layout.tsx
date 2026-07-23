import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { brand, themeOverrideCss } from "@/lib/theme";
import { headingFamily, bodyFamily } from "@/lib/fonts";
import { getProfile } from "@/lib/db";
import { safeJson } from "@/lib/util";
import "./globals.css";

// Body + mono are fixed. The heading font default is Space Grotesk, but the
// admin-chosen font/colors are injected as an override <style> below.
const headingDefault = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: `Blake's personal website. Chat with an AI host about his projects, background, and recent work.`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the admin-controlled theme so the whole site restyles from the DB.
  const profile = await getProfile().catch(() => null);
  const colors = safeJson<{ bg?: string; primary?: string; accent?: string }>(
    profile?.themeColors ?? "{}",
    {},
  );
  const override = themeOverrideCss({
    headingFamily: headingFamily(profile?.themeFont ?? "space-grotesk"),
    bodyFamily: bodyFamily(profile?.themeBodyFont ?? "inter"),
    colors,
  });

  return (
    <html
      lang="en"
      className={`${headingDefault.variable} ${body.variable} ${mono.variable}`}
    >
      <head>
        {/* DB-backed theme override — wins over globals.css :root defaults. */}
        <style dangerouslySetInnerHTML={{ __html: override }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
