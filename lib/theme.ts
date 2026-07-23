/**
 * ── BLAKE BRAND · single source of truth ──────────────────────────────
 *
 * Vibe: "Curious builder." Technical but warm, playful but not gimmicky.
 * A terminal that went to art school. Confident, a little retro-future.
 *
 * Change the values here and the whole site re-skins. These are emitted as
 * CSS custom properties in app/globals.css / the <html> style, so both React
 * components and raw CSS read from the same tokens.
 *
 * To rebrand from your real LinkedIn later: swap the colors + fonts below,
 * update the persona seed in prisma seed / admin, done.
 */

export const brand = {
  name: "Blake",
  tagline: "Curious builder. I make things and talk about them.",

  // ── Color ──
  color: {
    // Deep ink navy base — the "night terminal" background.
    bg: "#0B1020",
    bgSoft: "#12182E",
    surface: "#1A2140",
    border: "#2A335C",

    text: "#E8ECFF",
    textMuted: "#9AA3C7",

    // Electric "signal violet" — primary accent / brand.
    primary: "#7C5CFF",
    primarySoft: "#A48BFF",

    // Warm amber — the spark / highlight / call-to-action glow.
    accent: "#FFB84D",

    // Semantic
    success: "#4ADE80",
    danger: "#FF6B6B",
  },

  // ── Type ── (both open-source, commercial-safe, loaded via next/font)
  font: {
    heading: "var(--font-heading)", // Space Grotesk
    body: "var(--font-body)",       // Inter
    mono: "var(--font-mono)",       // system mono for code / terminal bits
  },

  radius: {
    sm: "8px",
    md: "14px",
    lg: "22px",
    pill: "999px",
  },

  // Signature glow used on the primary/accent elements.
  glow: {
    primary: "0 0 0 1px rgba(124,92,255,0.4), 0 8px 30px rgba(124,92,255,0.25)",
    accent: "0 0 0 1px rgba(255,184,77,0.4), 0 8px 30px rgba(255,184,77,0.20)",
  },
} as const;

/** Emit the palette as CSS variables for globals.css. */
export function themeCssVars(): string {
  const c = brand.color;
  return `
    --bg:${c.bg}; --bg-soft:${c.bgSoft}; --surface:${c.surface}; --border:${c.border};
    --text:${c.text}; --text-muted:${c.textMuted};
    --primary:${c.primary}; --primary-soft:${c.primarySoft}; --accent:${c.accent};
    --success:${c.success}; --danger:${c.danger};
    --radius-sm:${brand.radius.sm}; --radius-md:${brand.radius.md};
    --radius-lg:${brand.radius.lg}; --radius-pill:${brand.radius.pill};
    --glow-primary:${brand.glow.primary}; --glow-accent:${brand.glow.accent};
  `.trim();
}

/**
 * Build a CSS-variable override string from admin-chosen theme values, so the
 * live site restyles from the DB. Only overrides what's provided; everything
 * else falls back to globals.css defaults. Colors are validated hex.
 */
export function themeOverrideCss(opts: {
  headingFamily: string;
  bodyFamily: string;
  colors: { bg?: string; primary?: string; accent?: string };
}): string {
  const hex = (v?: string) => (v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null);
  const lines: string[] = [];

  // Fonts always set (from the curated allowlist).
  lines.push(`--font-heading:${opts.headingFamily};`);
  lines.push(`--font-body:${opts.bodyFamily};`);

  const bg = hex(opts.colors.bg);
  const primary = hex(opts.colors.primary);
  const accent = hex(opts.colors.accent);
  if (bg) lines.push(`--bg:${bg};`);
  if (primary) {
    lines.push(`--primary:${primary};`);
    lines.push(`--primary-soft:${primary};`);
  }
  if (accent) lines.push(`--accent:${accent};`);

  // `html` selector has higher specificity than :root, so this reliably wins
  // over globals.css defaults and the next/font variable class.
  return `html{${lines.join("")}}`;
}

/** The starter questions shown as chips under the chat box. No emojis. */
export const starterQuestions = [
  { q: "What's your background and past experience?" },
  { q: "Tell me about yourself and how you see the world." },
  { q: "How can I connect with you?" },
  { q: "What are your recent projects?" },
  { q: "Show me a bit about your life?" },
];
