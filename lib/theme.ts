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

  // Gradients/glows removed site-wide — flat solids only.
  glow: {
    primary: "none",
    accent: "none",
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
 * Corner-roundness presets. Each drives the --radius-* CSS tokens so the whole
 * site (buttons, cards, inputs) shares one curvature. `pill` stays capped so
 * cards/inputs don't collapse into lozenges. Shown in the admin "Corners" picker.
 */
export const RADIUS_PRESETS = {
  sharp: { label: "Sharp", sm: "2px", md: "3px", lg: "4px" },
  rounded: { label: "Rounded (default)", sm: "8px", md: "14px", lg: "22px" },
  pill: { label: "Pill (extra soft)", sm: "14px", md: "22px", lg: "32px" },
} as const;

export type RadiusKey = keyof typeof RADIUS_PRESETS;

/** Options for the admin corner-roundness picker (with a preview radius). */
export const RADIUS_OPTIONS = (Object.keys(RADIUS_PRESETS) as RadiusKey[]).map((key) => ({
  key,
  label: RADIUS_PRESETS[key].label,
  // The card-level radius, used to render the corner-preview box.
  preview: RADIUS_PRESETS[key].md,
}));

/**
 * The full set of admin-controllable colors. Every role the site uses maps to
 * a CSS token, so the whole design follows from here — nothing is hardcoded.
 */
export type ThemeColors = {
  bg?: string;
  surface?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  primary?: string;
  accent?: string;
};

/** The color roles shown in the admin design panel (order = display order). */
export const COLOR_ROLES: { key: keyof ThemeColors; label: string; fallback: string }[] = [
  { key: "bg", label: "Background", fallback: "#0B1020" },
  { key: "surface", label: "Surface / cards", fallback: "#1A2140" },
  { key: "border", label: "Border", fallback: "#2A335C" },
  { key: "text", label: "Text", fallback: "#E8ECFF" },
  { key: "textMuted", label: "Muted text", fallback: "#9AA3C7" },
  { key: "primary", label: "Primary", fallback: "#7C5CFF" },
  { key: "accent", label: "Accent", fallback: "#FFB84D" },
];

/** Heading weight options for the design panel. */
export const HEADING_WEIGHTS = [
  { key: "500", label: "Medium" },
  { key: "600", label: "Semibold" },
  { key: "700", label: "Bold" },
  { key: "800", label: "Extra bold" },
];

const hex = (v?: string) => (v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null);

/**
 * Build the CSS-variable declarations (the inner body of a :root block) from
 * admin-chosen theme values. Shared by the live-site <style> injector and the
 * admin live-preview box so both render identically. Only sets what's provided;
 * everything else falls back to globals.css defaults.
 */
export function themeVarLines(opts: {
  headingFamily: string;
  bodyFamily: string;
  radius?: string;
  fontSize?: string;
  headingWeight?: string;
  colors: ThemeColors;
}): string {
  const lines: string[] = [];

  lines.push(`--font-heading:${opts.headingFamily};`);
  lines.push(`--font-body:${opts.bodyFamily};`);

  const preset = RADIUS_PRESETS[opts.radius as RadiusKey];
  if (preset) {
    lines.push(`--radius-sm:${preset.sm};`);
    lines.push(`--radius-md:${preset.md};`);
    lines.push(`--radius-lg:${preset.lg};`);
  }

  // Base font size (px) and heading weight.
  const size = Number(opts.fontSize);
  if (Number.isFinite(size) && size >= 12 && size <= 24) {
    lines.push(`--font-size-base:${size}px;`);
  }
  if (opts.headingWeight && /^(400|500|600|700|800|900)$/.test(opts.headingWeight)) {
    lines.push(`--heading-weight:${opts.headingWeight};`);
  }

  // Full color set — every role, so the whole site follows.
  const c = opts.colors;
  const bg = hex(c.bg);
  const surface = hex(c.surface);
  const border = hex(c.border);
  const text = hex(c.text);
  const textMuted = hex(c.textMuted);
  const primary = hex(c.primary);
  const accent = hex(c.accent);
  if (bg) {
    lines.push(`--bg:${bg};`);
    lines.push(`--bg-soft:${bg};`);
  }
  if (surface) lines.push(`--surface:${surface};`);
  if (border) lines.push(`--border:${border};`);
  if (text) lines.push(`--text:${text};`);
  if (textMuted) lines.push(`--text-muted:${textMuted};`);
  if (primary) {
    lines.push(`--primary:${primary};`);
    lines.push(`--primary-soft:${primary};`);
  }
  if (accent) lines.push(`--accent:${accent};`);

  return lines.join("");
}

/**
 * Build the DB-backed override <style> body. Repeats :root to raise specificity
 * (0,2,0) above globals.css's single `:root` (0,1,0) so overrides reliably win.
 */
export function themeOverrideCss(opts: {
  headingFamily: string;
  bodyFamily: string;
  radius?: string;
  fontSize?: string;
  headingWeight?: string;
  colors: ThemeColors;
}): string {
  return `:root:root{${themeVarLines(opts)}}`;
}

/** The starter questions shown as chips under the chat box. No emojis. */
export const starterQuestions = [
  { q: "What's your background and past experience?" },
  { q: "Tell me about yourself and how you see the world." },
  { q: "How can I connect with you?" },
  { q: "What are your recent projects?" },
  { q: "Show me a bit about your life?" },
];
